import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, audit, get, now, run, tx } from '../db.ts';
import { AppError, notFound, paging, parse, requireUser } from '../lib/http.ts';
import { decrypt, uuid } from '../lib/security.ts';
import { storage } from '../lib/storage.ts';

export const STATUSES = ['NEW', 'READ', 'IN_PROGRESS', 'RESOLVED', 'ARCHIVED'] as const;

export function ownedReport(userId: string, id: string) {
  const r = get<any>(`SELECT r.*, v.plate_number, v.user_id AS owner_id FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=? AND v.user_id=?`, id, userId);
  if (!r) throw notFound('Laporan');
  return r;
}
function list(r: any) {
  return { id: r.id, reference: r.public_reference, vehicle_id: r.vehicle_id, plate_number: r.plate_number, category: r.category, message: r.message, status: r.status, reporter_name: r.reporter_name, created_at: r.created_at, updated_at: r.updated_at, resolved_at: r.resolved_at, photo_count: r.photo_count ?? 0 };
}

export function changeStatus(report: any, newStatus: string, actor: string, note?: string | null) {
  if (report.status === newStatus) return;
  tx(() => {
    run('UPDATE reports SET status=?, updated_at=?, resolved_at=? WHERE id=?', newStatus, now(), newStatus === 'RESOLVED' ? now() : newStatus === 'ARCHIVED' ? report.resolved_at : null, report.id);
    run('INSERT INTO report_status_histories(id,report_id,old_status,new_status,changed_by_user_id,note,created_at) VALUES (?,?,?,?,?,?,?)', uuid(), report.id, report.status, newStatus, actor, note ?? null, now());
  });
  audit(actor, 'report.status_changed', 'report', report.id, { from: report.status, to: newStatus });
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
    if (q.from) { where.push('r.created_at>=?'); p.push(new Date(q.from).toISOString()); }
    if (q.to) { where.push('r.created_at<=?'); p.push(new Date(new Date(q.to).getTime() + 86400000).toISOString()); }
    const w = where.join(' AND ');
    const rows = all(`SELECT r.*, v.plate_number, (SELECT COUNT(*) FROM report_attachments a WHERE a.report_id=r.id) photo_count FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE ${w} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
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
    const recent = all(`SELECT r.*, v.plate_number, (SELECT COUNT(*) FROM report_attachments a WHERE a.report_id=r.id) photo_count FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.user_id=? AND r.status<>'ARCHIVED' ORDER BY r.created_at DESC LIMIT 5`, u.id).map(list);
    const perDay = all<any>(`SELECT substr(r.created_at,1,10) d, COUNT(*) c FROM reports r JOIN vehicles v ON v.id=r.vehicle_id WHERE v.user_id=? AND r.created_at>? GROUP BY d`, u.id, new Date(Date.now() - 7 * 86400000).toISOString());
    return { vehicles: { total: vehicles.total, active: vehicles.active ?? 0 }, reports: byStatus, calls: { total: calls.total, missed: calls.missed ?? 0, seconds: calls.seconds }, recent_reports: recent, reports_per_day: perDay };
  });
}
