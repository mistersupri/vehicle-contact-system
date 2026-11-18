import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, audit, DEFAULT_SETTINGS, get, getSetting, now, run, setSetting, type SettingKey } from '../db.ts';
import { config } from '../config.ts';
import { AppError, notFound, paging, parse, requireAdmin } from '../lib/http.ts';
import { telegramConfigured, whatsappConfigured } from '../lib/providers.ts';
import { cloudflareTurnConfigured, turnMode } from '../lib/ice.ts';
import { mailConfigured } from '../lib/mail.ts';
import { telephonyReady } from '../lib/telephony.ts';
import { changeStatus, STATUSES } from './reports.ts';
import { finish } from '../lib/calls.ts';

const like = (s: unknown) => `%${String(s ?? '').replace(/[%_]/g, '')}%`;

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => { if (req.url.includes('/admin/')) requireAdmin(req); });

  app.get('/admin/metrics', async () => {
    const c = (sql: string, ...p: any[]) => get<any>(sql, ...p) ?? {};
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    return {
      users: c("SELECT COUNT(*) total, SUM(status='ACTIVE') active, SUM(status='SUSPENDED') suspended FROM users WHERE deleted_at IS NULL"),
      vehicles: c("SELECT COUNT(*) total, SUM(status='ACTIVE') active FROM vehicles WHERE deleted_at IS NULL"),
      reports: c("SELECT COUNT(*) total, SUM(status='NEW') new_count, SUM(created_at>?) last7 FROM reports", since),
      calls: c("SELECT COUNT(*) total, SUM(status='MISSED') missed, SUM(call_type='PSTN') pstn, SUM(call_type='WEBRTC') webrtc FROM calls"),
      queue: c("SELECT SUM(status IN ('PENDING','PROCESSING')) pending, SUM(status='RETRY_SCHEDULED') retrying, SUM(status='FAILED') failed, SUM(status='SENT') sent FROM notification_deliveries"),
      abuse_last7: c('SELECT COUNT(*) c FROM abuse_events WHERE created_at>?', since).c,
      reports_per_day: all<any>('SELECT substr(created_at,1,10) d, COUNT(*) c FROM reports WHERE created_at>? GROUP BY d ORDER BY d', since),
    };
  });

  app.get('/admin/users', async (req) => {
    const q = req.query as any; const { limit, offset } = paging(q);
    const where = ['u.deleted_at IS NULL']; const p: any[] = [];
    if (q.q) { where.push('(u.email LIKE ? OR u.name LIKE ?)'); p.push(like(q.q), like(q.q)); }
    if (q.status) { where.push('u.status=?'); p.push(q.status); }
    const rows = all(`SELECT u.id,u.name,u.email,u.status,u.email_verified_at,u.created_at,(SELECT COUNT(*) FROM vehicles v WHERE v.user_id=u.id AND v.deleted_at IS NULL) vehicle_count FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    return { users: rows, total: get<any>(`SELECT COUNT(*) c FROM users u WHERE ${where.join(' AND ')}`, ...p).c };
  });
  app.patch('/admin/users/:id/status', async (req) => {
    const admin = requireAdmin(req, ['SUPER_ADMIN', 'ADMIN']);
    const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }), req.body);
    const id = (req.params as any).id;
    if (id === admin.id) throw new AppError(400, 'SELF_ACTION', 'Tidak dapat mengubah status akun sendiri');
    const u = get<any>('SELECT id FROM users WHERE id=? AND deleted_at IS NULL', id);
    if (!u) throw notFound('Pengguna');
    run('UPDATE users SET status=?, email_verified_at=CASE WHEN ?=\'ACTIVE\' THEN COALESCE(email_verified_at, ?) ELSE email_verified_at END, updated_at=? WHERE id=?', status, status, now(), now(), id);
    if (status === 'SUSPENDED') run('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now(), id);
    audit(admin.id, 'admin.user_status', 'user', id, { status });
    return { ok: true };
  });

  app.get('/admin/vehicles', async (req) => {
    const q = req.query as any; const { limit, offset } = paging(q);
    const where = ['v.deleted_at IS NULL']; const p: any[] = [];
    if (q.q) { where.push('(v.plate_number LIKE ? OR u.email LIKE ?)'); p.push(like(q.q), like(q.q)); }
    if (q.status) { where.push('v.status=?'); p.push(q.status); }
    const rows = all(`SELECT v.id,v.plate_number,v.vehicle_type,v.brand,v.model,v.status,v.created_at,u.email owner_email,(SELECT COUNT(*) FROM reports r WHERE r.vehicle_id=v.id) report_count FROM vehicles v JOIN users u ON u.id=v.user_id WHERE ${where.join(' AND ')} ORDER BY v.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    return { vehicles: rows, total: get<any>(`SELECT COUNT(*) c FROM vehicles v JOIN users u ON u.id=v.user_id WHERE ${where.join(' AND ')}`, ...p).c };
  });
  app.patch('/admin/vehicles/:id/status', async (req) => {
    const admin = requireAdmin(req, ['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);
    const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']) }), req.body);
    const id = (req.params as any).id;
    if (!get('SELECT 1 FROM vehicles WHERE id=? AND deleted_at IS NULL', id)) throw notFound('Kendaraan');
    run('UPDATE vehicles SET status=?, updated_at=? WHERE id=?', status, now(), id);
    audit(admin.id, 'admin.vehicle_status', 'vehicle', id, { status });
    return { ok: true };
  });
  app.post('/admin/vehicles/:id/revoke-qr', async (req) => {
    const admin = requireAdmin(req);
    const id = (req.params as any).id;
    run('UPDATE qr_codes SET revoked_at=? WHERE vehicle_id=? AND revoked_at IS NULL', now(), id);
    audit(admin.id, 'admin.qr_revoked', 'vehicle', id);
    return { ok: true };
  });

  app.get('/admin/reports', async (req) => {
    const q = req.query as any; const { limit, offset } = paging(q);
    const where = ['1=1']; const p: any[] = [];
    if (q.status) { where.push('r.status=?'); p.push(q.status); }
    if (q.q) { where.push('(v.plate_number LIKE ? OR r.public_reference LIKE ?)'); p.push(like(q.q), like(q.q)); }
    const rows = all(`SELECT r.id,r.public_reference reference,r.category,r.status,r.created_at,substr(r.message,1,120) excerpt,v.plate_number FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    return { reports: rows, total: get<any>(`SELECT COUNT(*) c FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE ${where.join(' AND ')}`, ...p).c };
  });
  app.patch('/admin/reports/:id/status', async (req) => {
    const admin = requireAdmin(req);
    const { status, note } = parse(z.object({ status: z.enum(STATUSES), note: z.string().max(500).optional() }), req.body);
    const r = get<any>('SELECT * FROM reports WHERE id=?', (req.params as any).id);
    if (!r) throw notFound('Laporan');
    changeStatus(r, status, admin.id, note ?? 'Moderasi admin');
    return { ok: true };
  });

  app.get('/admin/calls', async (req) => {
    const { limit, offset } = paging(req.query);
    return { calls: all('SELECT c.id,c.public_reference reference,c.call_type,c.status,c.started_at,c.duration_seconds,c.end_reason,v.plate_number FROM calls c JOIN vehicles v ON v.id=c.vehicle_id ORDER BY c.created_at DESC LIMIT ? OFFSET ?', limit, offset) };
  });

  app.get('/admin/abuse', async (req) => {
    const { limit, offset } = paging(req.query);
    return { events: all<any>('SELECT a.id,a.event_type,a.created_at,a.details,substr(a.source_hash,1,10) source,v.plate_number FROM abuse_events a LEFT JOIN vehicles v ON v.id=a.vehicle_id ORDER BY a.created_at DESC LIMIT ? OFFSET ?', limit, offset).map((e) => ({ ...e, details: JSON.parse(e.details) })) };
  });

  app.get('/admin/categories', async () => ({ categories: all('SELECT * FROM report_categories ORDER BY sort') }));
  app.put('/admin/categories/:code', async (req) => {
    const admin = requireAdmin(req, ['SUPER_ADMIN', 'ADMIN']);
    const code = String((req.params as any).code).toUpperCase();
    const b = parse(z.object({ label: z.string().trim().min(2).max(60), description: z.string().trim().max(200), active: z.boolean() }), req.body);
    if (!/^[A-Z_]{2,30}$/.test(code)) throw new AppError(400, 'VALIDATION_ERROR', 'Kode kategori tidak valid');
    const max = get<any>('SELECT COALESCE(MAX(sort),0)+1 n FROM report_categories').n;
    run('INSERT INTO report_categories(code,label,description,active,sort) VALUES (?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET label=excluded.label, description=excluded.description, active=excluded.active', code, b.label, b.description, +b.active, max);
    audit(admin.id, 'admin.category_saved', 'report_category', null, { code });
    return { ok: true };
  });

  app.get('/admin/integrations', async () => {
    const q = (s: string) => get<any>(`SELECT ${s} FROM notification_deliveries`) ?? {};
    return {
      integrations: [
        { key: 'telegram', name: 'Telegram Bot', configured: telegramConfigured(), mode: telegramConfigured() ? 'live' : 'simulasi', stats: q("SUM(channel='TELEGRAM' AND status='SENT') sent, SUM(channel='TELEGRAM' AND status='FAILED') failed") },
        { key: 'whatsapp', name: 'WhatsApp Business', configured: whatsappConfigured(), mode: whatsappConfigured() ? 'live' : 'simulasi', stats: q("SUM(channel='WHATSAPP' AND status='SENT') sent, SUM(channel='WHATSAPP' AND status='FAILED') failed") },
        { key: 'telephony', name: 'Telephony / PSTN', configured: telephonyReady(), mode: config.telephonyProvider, stats: get<any>("SELECT SUM(call_type='PSTN') total, SUM(call_type='PSTN' AND status='FAILED') failed FROM calls") },
        { key: 'smtp', name: 'Email (SMTP)', configured: mailConfigured(), mode: mailConfigured() ? `${config.smtpHost}:${config.smtpPort}` : 'tidak terkirim', stats: get<any>("SELECT SUM(status='PENDING') menunggu_verifikasi FROM users WHERE deleted_at IS NULL") },
        { key: 'turn', name: 'STUN/TURN', configured: cloudflareTurnConfigured() || !!config.turnUrl, mode: turnMode(), stats: {} },
      ],
      queue: get<any>("SELECT SUM(status='PENDING') pending, SUM(status='RETRY_SCHEDULED') retrying, SUM(status='FAILED') failed FROM notification_deliveries"),
      failures: all("SELECT id,channel,last_error_code,attempts,updated_at FROM notification_deliveries WHERE status IN ('FAILED','RETRY_SCHEDULED') ORDER BY updated_at DESC LIMIT 20"),
    };
  });

  app.get('/admin/audit-logs', async (req) => {
    const q = req.query as any; const { limit, offset } = paging(q, 50);
    const where = ['1=1']; const p: any[] = [];
    if (q.action) { where.push('a.action LIKE ?'); p.push(like(q.action)); }
    const rows = all<any>(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,u.email actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    return { logs: rows.map((r) => ({ ...r, metadata: JSON.parse(r.metadata) })) };
  });

  app.get('/admin/settings', async () => ({ settings: Object.fromEntries((Object.keys(DEFAULT_SETTINGS) as SettingKey[]).map((k) => [k, getSetting(k)])) }));
  app.patch('/admin/settings', async (req) => {
    const admin = requireAdmin(req, ['SUPER_ADMIN', 'ADMIN']);
    const b = parse(z.object({
      report_rate_limit: z.number().int().min(1).max(100), report_rate_window_minutes: z.number().int().min(1).max(1440),
      call_cooldown_seconds: z.number().int().min(0).max(3600), pstn_daily_limit_per_vehicle: z.number().int().min(0).max(100),
      pstn_allowed_prefixes: z.string().max(200),
    }).partial(), req.body);
    for (const [k, v] of Object.entries(b)) if (v !== undefined) setSetting(k as SettingKey, v);
    audit(admin.id, 'admin.settings_updated', 'system', null, b);
    return { ok: true };
  });
}
void finish;
