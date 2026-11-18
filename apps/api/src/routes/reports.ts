import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, audit, get, now, run, tx } from '../db.ts';
import { AppError, notFound, paging, parse, requireUser } from '../lib/http.ts';
import { decrypt, uuid } from '../lib/security.ts';
import { storage } from '../lib/storage.ts';
import { sendToOwner } from '../lib/hub.ts';

export const STATUSES = ['NEW', 'READ', 'IN_PROGRESS', 'RESOLVED', 'ARCHIVED'] as const;

export function ownedReport(userId: string, id: string) {
  const r = get<any>(`SELECT r.*, v.plate_number, v.name AS vehicle_name, v.user_id AS owner_id FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=? AND v.user_id=?`, id, userId);
  if (!r) throw notFound('Laporan');
  return r;
}
function list(r: any) {
  return { id: r.id, reference: r.public_reference, vehicle_id: r.vehicle_id, plate_number: r.plate_number, vehicle_name: r.vehicle_name ?? null, urgent: !!r.urgent, category: r.category, message: r.message, status: r.status, reporter_name: r.reporter_name, created_at: r.created_at, updated_at: r.updated_at, resolved_at: r.resolved_at, photo_count: r.photo_count ?? 0 };
}

export function changeStatus(report: any, newStatus: string, actor: string, note?: string | null) {
  if (report.status === newStatus) return;
  tx(() => {
    run('UPDATE reports SET status=?, updated_at=?, resolved_at=? WHERE id=?', newStatus, now(), newStatus === 'RESOLVED' ? now() : newStatus === 'ARCHIVED' ? report.resolved_at : null, report.id);
    run('INSERT INTO report_status_histories(id,report_id,old_status,new_status,changed_by_user_id,note,created_at) VALUES (?,?,?,?,?,?,?)', uuid(), report.id, report.status, newStatus, actor, note ?? null, now());
  });
  audit(actor, 'report.status_changed', 'report', report.id, { from: report.status, to: newStatus });
  // Alert mendesak yang sudah ditangani: tutup layar penuh di semua perangkat pemilik
  if (report.urgent && report.status === 'NEW') {
    const owner = get<any>('SELECT user_id FROM vehicles WHERE id=?', report.vehicle_id)?.user_id;
    if (owner) sendToOwner(owner, { type: 'alert:dismiss', report_id: report.id });
  }
}

export default async function reportRoutes(app: FastifyInstance) {
  app.get('/reports', async (req) => {
    const u = requireUser(req);
    const q = req.query as any;
    const { limit, offset } = paging(q);
    const where = ['v.user_id=?']; const p: any[] = [u.id];
    if (q.vehicle_id) { where.push('r.vehicle_id=?'); p.push(q.vehicle_id); }
    if (q.category) { where.push('r.category=?'); p.push(q.category); }
    if (q.status) { where.push('r.status=?'); p.push(q.status); }
    else if (!q.include_archived) where.push("r.status<>'ARCHIVED'");
    if (q.q) { const like = `%${String(q.q).replace(/[%_]/g, '').slice(0, 60)}%`; where.push('(r.message LIKE ? OR r.public_reference LIKE ? OR v.plate_number LIKE ? OR v.name LIKE ?)'); p.push(like, like, like, like); }
    if (q.urgent === '1') where.push('r.urgent=1');
    if (q.from) { where.push('r.created_at>=?'); p.push(new Date(q.from).toISOString()); }
    if (q.to) { where.push('r.created_at<=?'); p.push(new Date(new Date(q.to).getTime() + 86400000).toISOString()); }
    const w = where.join(' AND ');
    const rows = all(`SELECT r.*, v.plate_number, v.name AS vehicle_name, (SELECT COUNT(*) FROM report_attachments a WHERE a.report_id=r.id) photo_count FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE ${w} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    const total = get<any>(`SELECT COUNT(*) c FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE ${w}`, ...p).c;
    return { reports: rows.map(list), total };
  });

  app.get('/reports/:id', async (req) => {
    const u = requireUser(req);
    let r = ownedReport(u.id, (req.params as any).id);
    if (r.status === 'NEW') { changeStatus(r, 'READ', u.id, 'Dibuka pemilik'); r = ownedReport(u.id, r.id); }
    const attachments = all<any>('SELECT id,mime_type,file_size,width,height FROM report_attachments WHERE report_id=?', r.id);
    return {
      report: { ...list(r), reporter_phone: r.reporter_phone_encrypted ? decrypt(r.reporter_phone_encrypted) : null, attachments, source_blocked: !!get('SELECT 1 FROM blocked_sources WHERE user_id=? AND source_hash=?', u.id, r.source_ip_hash ?? '') },
    };
  });

  app.patch('/reports/:id/status', async (req) => {
    const u = requireUser(req);
    const b = parse(z.object({ status: z.enum(STATUSES), note: z.string().trim().max(500).optional().nullable() }), req.body);
    const r = ownedReport(u.id, (req.params as any).id);
    changeStatus(r, b.status, u.id, b.note);
    return { report: list(ownedReport(u.id, r.id)) };
  });

  app.post('/reports/:id/archive', async (req) => {
    const u = requireUser(req);
    const r = ownedReport(u.id, (req.params as any).id);
    changeStatus(r, 'ARCHIVED', u.id, 'Diarsipkan');
    return { ok: true };
  });

  app.get('/reports/:id/history', async (req) => {
    const u = requireUser(req);
    const r = ownedReport(u.id, (req.params as any).id);
    return { history: all('SELECT old_status,new_status,note,created_at,changed_by_user_id IS NULL AS system FROM report_status_histories WHERE report_id=? ORDER BY created_at', r.id) };
  });

  // Blokir sumber pelapor yang menyalahgunakan layanan
  app.post('/reports/:id/block-source', async (req) => {
    const u = requireUser(req);
    const r = ownedReport(u.id, (req.params as any).id);
    if (!r.source_ip_hash) throw new AppError(400, 'NO_SOURCE', 'Sumber laporan tidak diketahui');
    run('INSERT OR IGNORE INTO blocked_sources(id,user_id,source_hash,reason,created_at) VALUES (?,?,?,?,?)', uuid(), u.id, r.source_ip_hash, `report:${r.id}`, now());
    audit(u.id, 'source.blocked', 'report', r.id);
    return { ok: true };
  });
  app.delete('/reports/:id/block-source', async (req) => {
    const u = requireUser(req);
    const r = ownedReport(u.id, (req.params as any).id);
    run('DELETE FROM blocked_sources WHERE user_id=? AND source_hash=?', u.id, r.source_ip_hash ?? '');
    audit(u.id, 'source.unblocked', 'report', r.id);
    return { ok: true };
  });

  // Lampiran privat: hanya pemilik kendaraan
  app.get('/attachments/:id', async (req, reply) => {
    const u = requireUser(req);
    const a = get<any>(`SELECT a.* FROM report_attachments a JOIN reports r ON r.id=a.report_id JOIN vehicles v ON v.id=r.vehicle_id WHERE a.id=? AND v.user_id=?`, (req.params as any).id, u.id);
    if (!a) throw notFound('Lampiran');
    const thumb = (req.query as any).thumb === '1';
    reply.header('cache-control', 'private, max-age=3600').header('x-content-type-options', 'nosniff');
    return reply.type(thumb ? 'image/webp' : a.mime_type).send(await storage.get(thumb ? a.thumb_key : a.storage_key));
  });

  app.get('/dashboard/summary', async (req) => {
    const u = requireUser(req);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const r of all<any>('SELECT r.status, COUNT(*) c FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.user_id=? GROUP BY r.status', u.id)) byStatus[r.status] = r.c;
    const vehicles = get<any>("SELECT COUNT(*) total, SUM(status='ACTIVE') active FROM vehicles WHERE user_id=? AND deleted_at IS NULL", u.id);
    const calls = get<any>("SELECT COUNT(*) total, SUM(status='MISSED') missed, COALESCE(SUM(duration_seconds),0) seconds FROM calls WHERE owner_id=?", u.id);
    const recent = all(`SELECT r.*, v.plate_number, v.name AS vehicle_name, (SELECT COUNT(*) FROM report_attachments a WHERE a.report_id=r.id) photo_count FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.user_id=? AND r.status<>'ARCHIVED' ORDER BY r.created_at DESC LIMIT 5`, u.id).map(list);
    const perDay = all<any>(`SELECT substr(r.created_at,1,10) d, COUNT(*) c FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.user_id=? AND r.created_at>? GROUP BY d`, u.id, new Date(Date.now() - 7 * 86400000).toISOString());
    const iso = (ms: number) => new Date(Date.now() - ms).toISOString();
    const today = get<any>('SELECT COUNT(*) c FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.user_id=? AND r.created_at>?', u.id, iso(86400000)).c;
    const dl = get<any>("SELECT COALESCE(SUM(status='SENT'),0) sent, COALESCE(SUM(status='FAILED'),0) failed FROM notification_deliveries WHERE user_id=? AND created_at>?", u.id, iso(30 * 86400000));
    const rate = dl.sent + dl.failed > 0 ? Math.round((dl.sent / (dl.sent + dl.failed)) * 100) : null;
    const ch = (c: string) => (c === 'TELEGRAM' ? 'Telegram' : c === 'EMAIL' ? 'Email' : 'WhatsApp');
    type Act = { type: string; title: string; subtitle: string; at: string };
    const act: Act[] = [
      ...all<any>(`SELECT r.created_at at, r.urgent, c.label, v.plate_number plate FROM reports r JOIN vehicles v ON v.id=r.vehicle_id LEFT JOIN report_categories c ON c.code=r.category WHERE v.user_id=? ORDER BY r.created_at DESC LIMIT 5`, u.id)
        .map((x) => ({ type: x.urgent ? 'alert' : 'report', title: x.urgent ? 'Notifikasi mendesak diterima' : 'Laporan baru diterima', subtitle: `${x.label ?? 'Laporan'} · ${x.plate}`, at: x.at })),
      ...all<any>(`SELECT c.started_at at, COALESCE(v.name, v.plate_number) n FROM calls c JOIN vehicles v ON v.id=c.vehicle_id WHERE c.owner_id=? AND c.status='MISSED' ORDER BY c.started_at DESC LIMIT 3`, u.id)
        .map((x) => ({ type: 'missed_call', title: 'Panggilan tak terjawab', subtitle: x.n, at: x.at })),
      ...all<any>(`SELECT d.sent_at at, d.channel, r.public_reference ref FROM notification_deliveries d LEFT JOIN reports r ON r.id=d.report_id WHERE d.user_id=? AND d.status='SENT' AND d.sent_at IS NOT NULL ORDER BY d.sent_at DESC LIMIT 3`, u.id)
        .map((x) => ({ type: 'notification', title: `Notifikasi ${ch(x.channel)} terkirim`, subtitle: x.ref ? `Laporan #${x.ref}` : 'Pesan tes', at: x.at })),
      ...all<any>(`SELECT h.created_at at, c.label, v.plate_number plate FROM report_status_histories h JOIN reports r ON r.id=h.report_id JOIN vehicles v ON v.id=r.vehicle_id LEFT JOIN report_categories c ON c.code=r.category WHERE v.user_id=? AND h.new_status='RESOLVED' ORDER BY h.created_at DESC LIMIT 3`, u.id)
        .map((x) => ({ type: 'resolved', title: 'Laporan ditandai selesai', subtitle: `${x.label ?? 'Laporan'} · ${x.plate}`, at: x.at })),
      ...all<any>(`SELECT created_at at, COALESCE(name, plate_number) n, plate_number plate FROM vehicles WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 2`, u.id)
        .map((x) => ({ type: 'vehicle', title: 'Kendaraan baru ditambahkan', subtitle: `${x.n} · ${x.plate}`, at: x.at })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return {
      vehicles: { total: vehicles.total, active: vehicles.active ?? 0 }, reports: byStatus, reports_total: total, reports_today: today,
      calls: { total: calls.total, missed: calls.missed ?? 0, seconds: calls.seconds },
      notifications: { sent: dl.sent, failed: dl.failed, rate }, activity: act,
      recent_reports: recent, reports_per_day: perDay,
    };
  });
}
