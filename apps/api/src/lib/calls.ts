import crypto from 'node:crypto';
import { all, audit, get, getSetting, now, run, tx } from '../db.ts';
import { config, LIMITS } from '../config.ts';
import { AppError } from './http.ts';
import { hmac, publicReference, signToken, uuid } from './security.ts';
import { isOwnerOnline, room, rooms, send, sendToOwner } from './hub.ts';
import { enqueue } from './notify.ts';

export type CallStatus = 'RINGING' | 'ACCEPTED' | 'COMPLETED' | 'MISSED' | 'REJECTED' | 'FAILED';
export const ACTIVE: CallStatus[] = ['RINGING', 'ACCEPTED'];

export interface CallSettings {
  user_id: string; webrtc_enabled: number; pstn_enabled: number; call_availability: 'ONLINE' | 'ALWAYS' | 'OFFLINE';
  max_call_duration_seconds: number; ring_timeout_seconds: number; allow_anonymous_webrtc: number; quiet_hours: string | null;
  owner_phone_encrypted: string | null;
}
export function settingsFor(userId: string): CallSettings {
  let s = get<CallSettings>('SELECT * FROM call_settings WHERE user_id=?', userId);
  if (!s) {
    run('INSERT INTO call_settings(user_id,updated_at) VALUES(?,?)', userId, now());
    s = get<CallSettings>('SELECT * FROM call_settings WHERE user_id=?', userId)!;
  }
  return s;
}

export function inQuietHours(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const q = JSON.parse(raw) as { enabled: boolean; start: string; end: string; timezone?: string };
    if (!q.enabled) return false;
    const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: q.timezone ?? 'Asia/Jakarta' }).format(new Date());
    const cur = parts.replace(':', '') ; const s = q.start.replace(':', ''), e = q.end.replace(':', '');
    return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
  } catch { return false; }
}

/** Alasan panggilan WebRTC tidak tersedia, atau null jika tersedia. */
export function webrtcUnavailableReason(userId: string): string | null {
  const s = settingsFor(userId);
  if (!s.webrtc_enabled) return 'WEBRTC_DISABLED';
  if (s.call_availability === 'OFFLINE') return 'OWNER_OFFLINE';
  if (inQuietHours(s.quiet_hours)) return 'QUIET_HOURS';
  if (s.call_availability === 'ONLINE' && !isOwnerOnline(userId)) return 'OWNER_OFFLINE';
  return null;
}

export function logEvent(callId: string, type: string, meta: Record<string, unknown> = {}) {
  run('INSERT INTO call_events(id,call_id,event_type,metadata,created_at) VALUES (?,?,?,?,?)', uuid(), callId, type, JSON.stringify(meta), now());
}

export function iceServers(callId: string) {
  const servers: { urls: string | string[]; username?: string; credential?: string }[] = [{ urls: config.stunUrl }];
  if (config.turnUrl && config.turnSecret) {
    // Kredensial TURN sementara (coturn use-auth-secret): username = expiry:callId
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${callId}`;
    const credential = crypto.createHmac('sha1', config.turnSecret).update(username).digest('base64');
    servers.push({ urls: config.turnUrl.split(','), username, credential });
  }
  return servers;
}

const timers = new Map<string, NodeJS.Timeout>();
const clearTimer = (id: string) => { const t = timers.get(id); if (t) clearTimeout(t); timers.delete(id); };

export interface CallRow { id: string; public_reference: string; vehicle_id: string; owner_id: string; call_type: string; status: CallStatus; caller_session_hash: string | null; started_at: string; answered_at: string | null }

export function createWebrtcCall(vehicle: { id: string; user_id: string; plate_number: string }, callerKey: string): CallRow {
  const unavailable = webrtcUnavailableReason(vehicle.user_id);
  if (unavailable) throw new AppError(409, unavailable, 'Pemilik tidak dapat dihubungi melalui panggilan saat ini', { fallback: 'message' });
  const cooldown = getSetting('call_cooldown_seconds');
  const callerHash = hmac(callerKey, 'caller');

  const call = tx(() => {
    if (get('SELECT 1 FROM calls WHERE vehicle_id=? AND status IN (\'RINGING\',\'ACCEPTED\')', vehicle.id))
      throw new AppError(409, 'BUSY', 'Pemilik sedang menerima panggilan lain', { fallback: 'message' });
    const recent = get('SELECT 1 FROM calls WHERE vehicle_id=? AND caller_session_hash=? AND created_at>?', vehicle.id, callerHash, new Date(Date.now() - cooldown * 1000).toISOString());
    if (recent) throw new AppError(429, 'COOLDOWN', `Tunggu ${cooldown} detik sebelum menelepon lagi`);
    const id = uuid();
    run(`INSERT INTO calls(id,public_reference,vehicle_id,owner_id,call_type,status,caller_session_hash,started_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      id, publicReference('CALL'), vehicle.id, vehicle.user_id, 'WEBRTC', 'RINGING', callerHash, now(), now());
    logEvent(id, 'call.created');
    return get<CallRow>('SELECT * FROM calls WHERE id=?', id)!;
  });

  const s = settingsFor(vehicle.user_id);
  sendToOwner(vehicle.user_id, { type: 'call:invite', call_id: call.id, reference: call.public_reference, plate: vehicle.plate_number, vehicle_id: vehicle.id, started_at: call.started_at, ring_timeout: s.ring_timeout_seconds });
  timers.set(call.id, setTimeout(() => finish(call.id, 'MISSED', 'timeout'), s.ring_timeout_seconds * 1000));
  return call;
}

export function callerToken(callId: string) {
  return signToken({ call_id: callId, role: 'CALLER' }, LIMITS.maxCallSeconds + 120);
}

/** Satu pintu untuk semua perubahan status akhir panggilan. Idempoten. */
export function finish(callId: string, status: Exclude<CallStatus, 'RINGING' | 'ACCEPTED'>, reason: string) {
  const call = get<CallRow & { answered_at: string | null }>('SELECT * FROM calls WHERE id=?', callId);
  if (!call || !ACTIVE.includes(call.status)) return false;
  clearTimer(callId); clearTimer(`max:${callId}`);
  const ended = now();
  const duration = call.answered_at ? Math.max(0, Math.round((Date.parse(ended) - Date.parse(call.answered_at)) / 1000)) : null;
  run('UPDATE calls SET status=?, ended_at=?, duration_seconds=?, end_reason=? WHERE id=?', status, ended, duration, reason, callId);
  logEvent(callId, `call.${status.toLowerCase()}`, { reason, duration });

  const r = rooms.get(callId);
  const fallback = status !== 'COMPLETED';
  send(r?.caller, { type: status === 'COMPLETED' ? 'call:end' : status === 'REJECTED' ? 'call:reject' : status === 'MISSED' && reason === 'timeout' ? 'call:timeout' : 'call:error', call_id: callId, reason, fallback });
  if (call.answered_at) send(r?.owner, { type: 'call:end', call_id: callId, reason });
  sendToOwner(call.owner_id, { type: 'call:cancelled', call_id: callId, status, reason });
  rooms.delete(callId);

  if (status === 'MISSED') {
    const v = get<{ plate_number: string }>('SELECT plate_number FROM vehicles WHERE id=?', call.vehicle_id);
    enqueue('call.missed', { call_id: callId, owner_id: call.owner_id, plate: v?.plate_number, at: ended });
  }
  return true;
}

export function accept(callId: string, ownerId: string, ownerSocket?: import('ws').WebSocket) {
  const call = ownedCall(callId, ownerId);
  if (call.status !== 'RINGING') throw new AppError(409, 'NOT_RINGING', 'Panggilan sudah tidak aktif');
  clearTimer(callId);
  const s = settingsFor(ownerId);
  run('UPDATE calls SET status=\'ACCEPTED\', answered_at=? WHERE id=?', now(), callId);
  logEvent(callId, 'call.accepted');
  const r = room(callId); if (ownerSocket) r.owner = ownerSocket;
  send(r.caller, { type: 'call:accept', call_id: callId });
  sendToOwner(ownerId, { type: 'call:taken', call_id: callId });
  const max = Math.min(s.max_call_duration_seconds, LIMITS.maxCallSeconds);
  timers.set(`max:${callId}`, setTimeout(() => finish(callId, 'COMPLETED', 'max_duration'), max * 1000));
  return get<CallRow>('SELECT * FROM calls WHERE id=?', callId)!;
}
export function reject(callId: string, ownerId: string) { ownedCall(callId, ownerId); return finish(callId, 'REJECTED', 'rejected_by_owner'); }
export function end(callId: string, ownerId: string) { ownedCall(callId, ownerId); return finish(callId, 'COMPLETED', 'ended_by_owner'); }
export function cancelByCaller(callId: string) {
  const c = get<CallRow>('SELECT * FROM calls WHERE id=?', callId);
  if (!c) return false;
  return finish(callId, c.status === 'RINGING' ? 'MISSED' : 'COMPLETED', c.status === 'RINGING' ? 'caller_cancelled' : 'ended_by_caller');
}
export function ownedCall(callId: string, ownerId: string): CallRow {
  const c = get<CallRow>('SELECT * FROM calls WHERE id=? AND owner_id=?', callId, ownerId);
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Panggilan tidak ditemukan');
  return c;
}
export const pendingInvites = (ownerId: string) =>
  all<any>(`SELECT c.id AS call_id, c.public_reference AS reference, c.started_at, v.plate_number AS plate, v.id AS vehicle_id
            FROM calls c JOIN vehicles v ON v.id=c.vehicle_id WHERE c.owner_id=? AND c.status='RINGING' AND c.call_type='WEBRTC'`, ownerId);

/** Bersihkan panggilan yatim setelah restart server. */
export function reapStaleCalls() {
  for (const c of all<{ id: string }>("SELECT id FROM calls WHERE status IN ('RINGING','ACCEPTED') AND call_type='WEBRTC'")) finish(c.id, 'FAILED', 'server_restart');
}
export { audit };
