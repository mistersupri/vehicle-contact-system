import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, audit, get, now, run } from '../db.ts';
import { AppError, notFound, paging, parse, requireUser, userFromSessionToken, SESSION_COOKIE } from '../lib/http.ts';
import { encrypt, uuid, verifyToken } from '../lib/security.ts';
import { accept, cancelByCaller, end, finish, ownedCall, pendingInvites, reject, settingsFor } from '../lib/calls.ts';
import { ownerSockets, room, rooms, send, isOwnerOnline } from '../lib/hub.ts';
import { telephonyReady } from '../lib/telephony.ts';
import { LIMITS } from '../config.ts';
import { getIceServers } from '../lib/ice.ts';

const callRow = (c: any) => ({ id: c.id, reference: c.public_reference, plate_number: c.plate_number, vehicle_id: c.vehicle_id, call_type: c.call_type, status: c.status, started_at: c.started_at, answered_at: c.answered_at, ended_at: c.ended_at, duration_seconds: c.duration_seconds, end_reason: c.end_reason });
const callsQ = `SELECT c.*, v.plate_number FROM calls c JOIN vehicles v ON v.id=c.vehicle_id WHERE c.owner_id=?`;

export default async function callRoutes(app: FastifyInstance) {
  app.get('/calls/history', async (req) => {
    const u = requireUser(req); const { limit, offset } = paging(req.query);
    return { calls: all(`${callsQ} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`, u.id, limit, offset).map(callRow) };
  });
  app.get('/calls/missed', async (req) => {
    const u = requireUser(req); const { limit, offset } = paging(req.query);
    return { calls: all(`${callsQ} AND c.status='MISSED' ORDER BY c.created_at DESC LIMIT ? OFFSET ?`, u.id, limit, offset).map(callRow) };
  });
  app.get('/calls/:id', async (req) => {
    const u = requireUser(req);
    const c = get<any>(`${callsQ} AND c.id=?`, u.id, (req.params as any).id);
    if (!c) throw notFound('Panggilan');
    return { call: callRow(c), events: all('SELECT event_type,metadata,created_at FROM call_events WHERE call_id=? ORDER BY created_at', c.id) };
  });
  app.post('/calls/:id/accept', async (req) => { const u = requireUser(req); return { call: callRow(accept((req.params as any).id, u.id)) }; });
  app.post('/calls/:id/reject', async (req) => { const u = requireUser(req); reject((req.params as any).id, u.id); return { ok: true }; });
  app.post('/calls/:id/end', async (req) => { const u = requireUser(req); end((req.params as any).id, u.id); return { ok: true }; });
  // Pembatalan oleh penelepon memakai token signaling (tanpa login)
  app.post('/calls/:id/cancel', async (req) => {
    const { token } = parse(z.object({ token: z.string() }), req.body);
    const p = verifyToken<{ call_id: string; role: string }>(token);
    if (!p || p.role !== 'CALLER' || p.call_id !== (req.params as any).id) throw new AppError(403, 'FORBIDDEN', 'Token tidak valid');
    cancelByCaller(p.call_id);
    return { ok: true };
  });

  // ---- Pengaturan panggilan ----
  const present = (userId: string) => {
    const s = settingsFor(userId);
    return {
      webrtc_enabled: !!s.webrtc_enabled, pstn_enabled: !!s.pstn_enabled, call_availability: s.call_availability,
      max_call_duration_seconds: s.max_call_duration_seconds, ring_timeout_seconds: s.ring_timeout_seconds,
      allow_anonymous_webrtc: !!s.allow_anonymous_webrtc,
      quiet_hours: s.quiet_hours ? JSON.parse(s.quiet_hours) : { enabled: false, start: '22:00', end: '06:00', timezone: 'Asia/Jakarta' },
      owner_phone_set: !!s.owner_phone_encrypted, pstn_provider_ready: telephonyReady(), owner_online: isOwnerOnline(userId),
    };
  };
  app.get('/call-settings', async (req) => ({ settings: present(requireUser(req).id) }));
  app.patch('/call-settings', async (req) => {
    const u = requireUser(req);
    const b = parse(z.object({
      webrtc_enabled: z.boolean(), pstn_enabled: z.boolean(), call_availability: z.enum(['ONLINE', 'ALWAYS', 'OFFLINE']),
      max_call_duration_seconds: z.number().int().min(60).max(LIMITS.maxCallSeconds),
      ring_timeout_seconds: z.number().int().min(15).max(90), allow_anonymous_webrtc: z.boolean(),
      quiet_hours: z.object({ enabled: z.boolean(), start: z.string().regex(/^\d\d:\d\d$/), end: z.string().regex(/^\d\d:\d\d$/), timezone: z.string().default('Asia/Jakarta') }),
      owner_phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Gunakan format internasional, contoh +628123456789').nullable(),
    }).partial(), req.body);
    settingsFor(u.id);
    const cur = get<any>('SELECT * FROM call_settings WHERE user_id=?', u.id);
    if (b.pstn_enabled && !telephonyReady()) throw new AppError(409, 'PSTN_PROVIDER_NOT_READY', 'Provider telephony belum dikonfigurasi oleh administrator');
    run(`UPDATE call_settings SET webrtc_enabled=?, pstn_enabled=?, call_availability=?, max_call_duration_seconds=?, ring_timeout_seconds=?, allow_anonymous_webrtc=?, quiet_hours=?, owner_phone_encrypted=?, updated_at=? WHERE user_id=?`,
      b.webrtc_enabled === undefined ? cur.webrtc_enabled : +b.webrtc_enabled, b.pstn_enabled === undefined ? cur.pstn_enabled : +b.pstn_enabled,
      b.call_availability ?? cur.call_availability, b.max_call_duration_seconds ?? cur.max_call_duration_seconds, b.ring_timeout_seconds ?? cur.ring_timeout_seconds,
      b.allow_anonymous_webrtc === undefined ? cur.allow_anonymous_webrtc : +b.allow_anonymous_webrtc,
      b.quiet_hours ? JSON.stringify(b.quiet_hours) : cur.quiet_hours,
      b.owner_phone === undefined ? cur.owner_phone_encrypted : b.owner_phone ? encrypt(b.owner_phone) : null, now(), u.id);
    audit(u.id, 'call_settings.updated', 'user', u.id, { fields: Object.keys(b).filter((k) => k !== 'owner_phone') });
    return { settings: present(u.id) };
  });

  // ---- WebSocket signaling (hanya signaling; media lewat WebRTC langsung) ----
  app.get('/call-signaling', { websocket: true }, async (socket, req) => {
    const q = req.query as any;
    // Pemilik: cookie sesi. Penelepon: token signaling berumur pendek.
    const owner = userFromSessionToken(req.cookies[SESSION_COOKIE]);
    const caller = !owner && q.token ? verifyToken<{ call_id: string; role: string }>(String(q.token)) : null;
    if (!owner && !(caller && caller.role === 'CALLER')) { send(socket, { type: 'call:error', reason: 'unauthorized' }); socket.close(4401); return; }

    let callerCallId: string | null = null;
    if (owner) {
      const set = ownerSockets.get(owner.id) ?? new Set(); set.add(socket); ownerSockets.set(owner.id, set);
      for (const inv of pendingInvites(owner.id)) send(socket, { type: 'call:invite', ...inv, ring_timeout: settingsFor(owner.id).ring_timeout_seconds });
      send(socket, { type: 'hello', role: 'OWNER' });
    } else if (caller) {
      const c = get<any>('SELECT * FROM calls WHERE id=?', caller.call_id);
      if (!c || !['RINGING', 'ACCEPTED'].includes(c.status)) {
        // Penelepon bisa tersambung setelah panggilan sudah berakhir (mis. ditolak sangat cepat): sampaikan alasan yang akurat.
        const type = c?.status === 'REJECTED' ? 'call:reject' : c?.status === 'MISSED' ? 'call:timeout' : c?.status === 'COMPLETED' ? 'call:end' : 'call:error';
        send(socket, { type, reason: c?.end_reason ?? 'call_inactive', fallback: c?.status !== 'COMPLETED' }); socket.close(4410); return;
      }
      callerCallId = c.id; room(c.id).caller = socket;
      // jangan menahan pendaftaran listener (message/close) selama menunggu kredensial ICE
      const cid = c.id; void getIceServers(cid).then((ice) => send(socket, { type: 'call:ringing', call_id: cid, ice_servers: ice }));
      if (c.status === 'ACCEPTED') send(socket, { type: 'call:accept', call_id: c.id });
    }

    socket.on('message', async (raw) => {
      let m: any;
      try { m = JSON.parse(String(raw)); } catch { return; }
      try {
        const callId = owner ? m.call_id : callerCallId; // penelepon hanya boleh bertindak di panggilannya sendiri
        if (!callId || typeof m.type !== 'string') return;
        const r = rooms.get(callId);
        const call = get<any>('SELECT * FROM calls WHERE id=?', callId);
        // validasi keanggotaan sesi pada setiap pesan
        if (!call || (owner && call.owner_id !== owner.id)) return send(socket, { type: 'call:error', reason: 'forbidden' });

        switch (m.type) {
          case 'call:accept': if (owner) accept(callId, owner.id, socket); break;
          case 'call:reject': if (owner) reject(callId, owner.id); break;
          case 'call:end': owner ? end(callId, owner.id) : cancelByCaller(callId); break;
          case 'call:offer': // penelepon -> pemilik
            if (!owner && call.status === 'ACCEPTED') send(r?.owner, { type: 'call:offer', call_id: callId, sdp: m.sdp, ice_servers: await getIceServers(callId) }); break;
          case 'call:answer': // pemilik -> penelepon
            if (owner && call.status === 'ACCEPTED' && r?.owner === socket) send(r.caller, { type: 'call:answer', call_id: callId, sdp: m.sdp }); break;
          case 'call:ice-candidate':
            if (call.status === 'ACCEPTED') send(owner ? r?.caller : r?.owner, { type: 'call:ice-candidate', call_id: callId, candidate: m.candidate }); break;
        }
      } catch (e: any) {
        send(socket, { type: 'call:error', reason: e?.code ?? 'error', message: e?.message });
      }
    });

    socket.on('close', () => {
      if (owner) {
        const set = ownerSockets.get(owner.id); set?.delete(socket); if (set && !set.size) ownerSockets.delete(owner.id);
        for (const [id, r] of rooms) if (r.owner === socket) finish(id, 'COMPLETED', 'owner_disconnected');
      } else if (callerCallId) {
        const r = rooms.get(callerCallId);
        if (r?.caller === socket) cancelByCaller(callerCallId);
      }
    });
  });
}
void uuid;
