import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, get, getSetting, now, run, tx } from '../db.ts';
import { LIMITS } from '../config.ts';
import { AppError, ipHash, notFound, parse } from '../lib/http.ts';
import { decrypt, encrypt, hmac, publicReference, uuid } from '../lib/security.ts';
import { processImage } from '../lib/storage.ts';
import { enqueue } from '../lib/notify.ts';
import { createWebrtcCall, callerToken, iceServers, settingsFor, webrtcUnavailableReason, logEvent } from '../lib/calls.ts';
import { getTelephony, telephonyReady } from '../lib/telephony.ts';

/** Cari kendaraan dari token QR. Mengembalikan status agar halaman bisa menampilkan "QR tidak aktif". */
export function resolveToken(token: string) {
  if (!token || token.length > 200) throw notFound('Kendaraan');
  const row = get<any>(
    `SELECT q.id AS qr_id, q.revoked_at, v.* FROM qr_codes q JOIN vehicles v ON v.id=q.vehicle_id WHERE q.token_hash=?`, hmac(token, 'qr'));
  if (!row) throw notFound('Kendaraan');
  const owner = get<any>('SELECT status, deleted_at FROM users WHERE id=?', row.user_id);
  const active = !row.revoked_at && row.status === 'ACTIVE' && !row.deleted_at && owner?.status === 'ACTIVE';
  return { vehicle: row, active };
}
function requireActive(token: string, ip: string) {
  const r = resolveToken(token);
  if (!r.active) throw new AppError(410, 'QR_INACTIVE', 'QR atau kendaraan ini tidak aktif');
  if (get('SELECT 1 FROM blocked_sources WHERE user_id=? AND source_hash=?', r.vehicle.user_id, ip))
    throw new AppError(403, 'SOURCE_BLOCKED', 'Anda tidak dapat menghubungi pemilik kendaraan ini');
  return r.vehicle;
}
function abuse(vehicleId: string | null, type: string, source: string, details: object = {}) {
  run('INSERT INTO abuse_events(id,vehicle_id,event_type,source_hash,details,created_at) VALUES (?,?,?,?,?,?)', uuid(), vehicleId, type, source, JSON.stringify(details), now());
}

const PUBLIC_STATUS: Record<string, string> = { NEW: 'Diterima', READ: 'Dilihat pemilik', IN_PROGRESS: 'Sedang ditangani', RESOLVED: 'Selesai', ARCHIVED: 'Selesai' };

const reportSchema = z.object({
  category: z.string().min(1, 'Pilih kategori laporan'),
  message: z.string().trim().min(3, 'Pesan wajib diisi').max(LIMITS.messageMax, `Pesan maksimal ${LIMITS.messageMax} karakter`),
  reporter_name: z.string().trim().max(150).optional().nullable().transform((v) => v || null),
  reporter_phone: z.string().trim().max(30).regex(/^[+0-9\s-]{6,30}$/, 'Nomor telepon tidak valid').optional().nullable().or(z.literal('')).transform((v) => v || null),
  attachment_ids: z.array(z.string().uuid()).max(LIMITS.photosMax, `Maksimal ${LIMITS.photosMax} foto`).default([]),
});

export default async function publicRoutes(app: FastifyInstance) {
  const publicLimit = (max: number, window = '1 minute') => ({ config: { rateLimit: { max, timeWindow: window } } });

  app.get('/public/vehicles/:token', publicLimit(60), async (req, reply) => {
    const { vehicle, active } = resolveToken((req.params as any).token);
    reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex, nofollow');
    if (!active) return { active: false, plate_masked: vehicle.plate_number.replace(/.(?=.{3})/g, '•') };
    const s = settingsFor(vehicle.user_id);
    const cats = all('SELECT code,label,description FROM report_categories WHERE active=1 ORDER BY sort');
    return {
      active: true,
      vehicle: { plate_number: vehicle.plate_number, vehicle_type: vehicle.vehicle_type, brand: vehicle.brand, model: vehicle.model, color: vehicle.color, owner_display_name: vehicle.owner_display_name },
      categories: cats,
      limits: { message_max: LIMITS.messageMax, photos_max: LIMITS.photosMax, photo_bytes_max: LIMITS.photoBytesMax },
      calls: {
        webrtc_enabled: !!s.webrtc_enabled,
        webrtc_available: !webrtcUnavailableReason(vehicle.user_id),
        webrtc_unavailable_reason: webrtcUnavailableReason(vehicle.user_id),
        pstn_available: !!s.pstn_enabled && telephonyReady() && !!s.owner_phone_encrypted,
      },
    };
  });

  // Upload foto: validasi isi file, hapus EXIF, simpan di storage privat
  app.post('/public/vehicles/:token/uploads', publicLimit(20, '10 minutes'), async (req) => {
    const ip = ipHash(req);
    const v = requireActive((req.params as any).token, ip);
    const file = await req.file({ limits: { fileSize: LIMITS.photoBytesMax, files: 1 } });
    if (!file) throw new AppError(400, 'NO_FILE', 'Foto tidak ditemukan');
    const buf = await file.toBuffer();
    if (file.file.truncated) throw new AppError(400, 'FILE_TOO_LARGE', 'Ukuran foto maksimal 5 MB');
    const pending = get<any>('SELECT COUNT(*) c FROM report_attachments WHERE vehicle_id=? AND report_id IS NULL AND created_at>?', v.id, new Date(Date.now() - 3600_000).toISOString());
    if (pending.c >= 30) throw new AppError(429, 'TOO_MANY_UPLOADS', 'Terlalu banyak unggahan. Coba lagi nanti.');
    const img = await processImage(buf);
    const id = uuid();
    run('INSERT INTO report_attachments(id,report_id,vehicle_id,storage_key,thumb_key,mime_type,file_size,width,height,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      id, null, v.id, img.storageKey, img.thumbKey, img.mime, img.size, img.width, img.height, now());
    return { id, width: img.width, height: img.height };
  });

  app.post('/public/vehicles/:token/reports', publicLimit(10, '10 minutes'), async (req, reply) => {
    const ip = ipHash(req);
    const v = requireActive((req.params as any).token, ip);
    const b = parse(reportSchema, req.body);
    const cat = get<any>('SELECT code,label FROM report_categories WHERE code=? AND active=1', b.category);
    if (!cat) throw new AppError(400, 'VALIDATION_ERROR', 'Kategori tidak valid', { fields: { category: 'Kategori tidak valid' } });

    const limit = getSetting('report_rate_limit'), windowMin = getSetting('report_rate_window_minutes');
    const recent = get<any>('SELECT COUNT(*) c FROM reports WHERE vehicle_id=? AND created_at>?', v.id, new Date(Date.now() - windowMin * 60_000).toISOString());
    if (recent.c >= limit) {
      abuse(v.id, 'report.rate_limited', ip);
      throw new AppError(429, 'RATE_LIMITED', `Terlalu banyak laporan untuk kendaraan ini. Coba lagi dalam ${windowMin} menit.`);
    }
    const sameSource = get<any>('SELECT COUNT(*) c FROM reports WHERE vehicle_id=? AND source_ip_hash=? AND created_at>?', v.id, ip, new Date(Date.now() - 60_000).toISOString());
    if (sameSource.c >= 2) { abuse(v.id, 'report.source_cooldown', ip); throw new AppError(429, 'RATE_LIMITED', 'Mohon tunggu sebentar sebelum mengirim laporan lagi'); }

    const id = uuid(), reference = publicReference('VCS');
    tx(() => {
      for (const aid of b.attachment_ids) {
        const a = get('SELECT 1 FROM report_attachments WHERE id=? AND vehicle_id=? AND report_id IS NULL', aid, v.id);
        if (!a) throw new AppError(400, 'INVALID_ATTACHMENT', 'Lampiran tidak valid atau sudah dipakai');
      }
      run(`INSERT INTO reports(id,public_reference,vehicle_id,category,message,status,reporter_name,reporter_phone_encrypted,source_ip_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        id, reference, v.id, cat.code, b.message, 'NEW', b.reporter_name, b.reporter_phone ? encrypt(b.reporter_phone) : null, ip, now(), now());
      run('INSERT INTO report_status_histories(id,report_id,old_status,new_status,changed_by_user_id,note,created_at) VALUES (?,?,?,?,?,?,?)', uuid(), id, null, 'NEW', null, 'Laporan dibuat', now());
      for (const aid of b.attachment_ids) run('UPDATE report_attachments SET report_id=? WHERE id=?', id, aid);
      // outbox di transaksi yang sama: laporan tidak pernah tersimpan tanpa event notifikasi
      enqueue('report.created', { report_id: id, owner_id: v.user_id, reference, plate: v.plate_number, category_label: cat.label, message: b.message, at: now() });
    });
    return reply.status(201).send({ reference, status: PUBLIC_STATUS.NEW });
  });

  app.get('/public/reports/:reference', publicLimit(30), async (req) => {
    const r = get<any>('SELECT public_reference, status, created_at, updated_at FROM reports WHERE public_reference=?', String((req.params as any).reference).toUpperCase());
    if (!r) throw notFound('Laporan');
    return { reference: r.public_reference, status: PUBLIC_STATUS[r.status], created_at: r.created_at, updated_at: r.updated_at }; // data minimum
  });

  // ---- Panggilan WebRTC ----
  app.post('/public/calls', publicLimit(6, '10 minutes'), async (req, reply) => {
    const ip = ipHash(req);
    const body = parse(z.object({ vehicle_token: z.string().min(10).max(200), client_id: z.string().min(8).max(100).optional() }), req.body);
    const v = requireActive(body.vehicle_token, ip);
    const s = settingsFor(v.user_id);
    if (!s.allow_anonymous_webrtc) throw new AppError(403, 'ANONYMOUS_DISABLED', 'Pemilik tidak menerima panggilan anonim');
    const call = createWebrtcCall(v, `${ip}:${body.client_id ?? ''}`);
    return reply.status(201).send({
      call_id: call.id, reference: call.public_reference, signaling_token: callerToken(call.id),
      ice_servers: iceServers(call.id), ring_timeout_seconds: s.ring_timeout_seconds,
    });
  });

  // ---- Panggilan PSTN (adapter; aktif hanya jika provider siap) ----
  app.post('/public/calls/pstn', publicLimit(3, '10 minutes'), async (req, reply) => {
    const ip = ipHash(req);
    const body = parse(z.object({
      vehicle_token: z.string().min(10).max(200),
      caller_phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Gunakan format internasional, contoh +628123456789'),
      consent: z.literal(true, { errorMap: () => ({ message: 'Persetujuan wajib diberikan' }) }),
    }), req.body);
    const adapter = getTelephony();
    if (!adapter) throw new AppError(503, 'PSTN_UNAVAILABLE', 'Panggilan telepon biasa belum tersedia', { fallback: 'message' });
    const v = requireActive(body.vehicle_token, ip);
    const s = settingsFor(v.user_id);
    if (!s.pstn_enabled || !s.owner_phone_encrypted) throw new AppError(409, 'PSTN_DISABLED', 'Pemilik tidak menerima panggilan telepon biasa', { fallback: 'message' });
    const allowed = String(getSetting('pstn_allowed_prefixes')).split(',').map((x) => x.trim()).filter(Boolean);
    if (!allowed.some((p) => body.caller_phone.startsWith(p))) throw new AppError(400, 'DESTINATION_NOT_ALLOWED', 'Kode negara nomor ini belum didukung');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const n = get<any>("SELECT COUNT(*) c FROM calls WHERE vehicle_id=? AND call_type='PSTN' AND created_at>?", v.id, today.toISOString());
    if (n.c >= getSetting('pstn_daily_limit_per_vehicle')) { abuse(v.id, 'pstn.daily_limit', ip); throw new AppError(429, 'PSTN_LIMIT', 'Batas panggilan harian tercapai', { fallback: 'message' }); }
    if (get("SELECT 1 FROM calls WHERE vehicle_id=? AND status IN ('RINGING','ACCEPTED')", v.id)) throw new AppError(409, 'BUSY', 'Pemilik sedang menerima panggilan lain', { fallback: 'message' });

    const callId = uuid(), reference = publicReference('CALL');
    run(`INSERT INTO calls(id,public_reference,vehicle_id,owner_id,call_type,status,caller_session_hash,started_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      callId, reference, v.id, v.user_id, 'PSTN', 'RINGING', hmac(ip, 'caller'), now(), now());
    try {
      const r = await adapter.createCall({ callerPhone: body.caller_phone, ownerPhone: decrypt(s.owner_phone_encrypted), callRef: reference });
      run('INSERT INTO telephony_sessions(id,call_id,provider,provider_call_id,virtual_number,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', uuid(), callId, adapter.name, r.providerCallId, r.virtualNumber, 'RINGING', now(), now());
      logEvent(callId, 'pstn.created', { provider: adapter.name });
    } catch {
      run("UPDATE calls SET status='FAILED', ended_at=?, end_reason='provider_error' WHERE id=?", now(), callId);
      throw new AppError(502, 'PSTN_FAILED', 'Panggilan telepon gagal dimulai', { fallback: 'message' });
    }
    return reply.status(201).send({ reference, status: 'RINGING' });
  });
}
