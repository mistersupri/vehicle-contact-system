import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import { all, audit, get, now, run, tx } from '../db.ts';
import { config } from '../config.ts';
import { AppError, notFound, parse, requireUser } from '../lib/http.ts';
import { decrypt, encrypt, hmac, randomToken, uuid } from '../lib/security.ts';

const vehicleSchema = z.object({
  plate_number: z.string().trim().min(2, 'Pelat nomor wajib diisi').max(30).transform((s) => s.toUpperCase().replace(/\s+/g, ' ')),
  vehicle_type: z.enum(['Mobil', 'Motor', 'Truk', 'Bus', 'Lainnya']),
  brand: z.string().trim().max(100).optional().nullable().transform((v) => v || null),
  model: z.string().trim().max(100).optional().nullable().transform((v) => v || null),
  color: z.string().trim().max(50).optional().nullable().transform((v) => v || null),
  owner_display_name: z.string().trim().min(2, 'Nama tampilan wajib diisi').max(150),
});

export const publicUrl = (token: string) => `${config.appUrl}/v/${token}`;

function createQr(vehicleId: string, replaces?: string) {
  const token = randomToken(32); // 256 bit
  const id = uuid();
  run('INSERT INTO qr_codes(id,vehicle_id,token_hash,token_encrypted,created_at) VALUES (?,?,?,?,?)', id, vehicleId, hmac(token, 'qr'), encrypt(token), now());
  if (replaces) run('UPDATE qr_codes SET revoked_at=?, replaced_by_id=? WHERE id=?', now(), id, replaces);
  return { id, token };
}
const activeQr = (vehicleId: string) => get<any>('SELECT * FROM qr_codes WHERE vehicle_id=? AND revoked_at IS NULL ORDER BY created_at DESC', vehicleId);

export function ownedVehicle(userId: string, id: string) {
  const v = get<any>('SELECT * FROM vehicles WHERE id=? AND user_id=? AND deleted_at IS NULL', id, userId);
  if (!v) throw notFound('Kendaraan'); // 404 (bukan 403) agar tidak membocorkan keberadaan data akun lain
  return v;
}

function serialize(v: any) {
  const qr = activeQr(v.id);
  const stats = get<any>(`SELECT COUNT(*) total, SUM(status='NEW') new_reports FROM reports WHERE vehicle_id=?`, v.id);
  return {
    id: v.id, plate_number: v.plate_number, vehicle_type: v.vehicle_type, brand: v.brand, model: v.model, color: v.color,
    owner_display_name: v.owner_display_name, status: v.status, created_at: v.created_at,
    qr: qr ? { id: qr.id, created_at: qr.created_at, public_url: publicUrl(decrypt(qr.token_encrypted)) } : null,
    report_count: stats?.total ?? 0, new_report_count: stats?.new_reports ?? 0,
  };
}

export default async function vehicleRoutes(app: FastifyInstance) {
  app.get('/vehicles', async (req) => {
    const u = requireUser(req);
    return { vehicles: all('SELECT * FROM vehicles WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC', u.id).map(serialize) };
  });

  app.post('/vehicles', async (req, reply) => {
    const u = requireUser(req);
    const body = parse(vehicleSchema, req.body);
    const id = uuid();
    tx(() => {
      run('INSERT INTO vehicles(id,user_id,plate_number,vehicle_type,brand,model,color,owner_display_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        id, u.id, body.plate_number, body.vehicle_type, body.brand, body.model, body.color, body.owner_display_name, 'ACTIVE', now(), now());
      createQr(id);
    });
    audit(u.id, 'vehicle.created', 'vehicle', id, { plate: body.plate_number });
    return reply.status(201).send({ vehicle: serialize(get('SELECT * FROM vehicles WHERE id=?', id)) });
  });

  app.get('/vehicles/:id', async (req) => {
    const u = requireUser(req);
    return { vehicle: serialize(ownedVehicle(u.id, (req.params as any).id)) };
  });

  app.patch('/vehicles/:id', async (req) => {
    const u = requireUser(req);
    const v = ownedVehicle(u.id, (req.params as any).id);
    const b = parse(vehicleSchema.partial(), req.body);
    const m = { ...v, ...Object.fromEntries(Object.entries(b).filter(([, x]) => x !== undefined)) };
    run('UPDATE vehicles SET plate_number=?,vehicle_type=?,brand=?,model=?,color=?,owner_display_name=?,updated_at=? WHERE id=?',
      m.plate_number, m.vehicle_type, m.brand, m.model, m.color, m.owner_display_name, now(), v.id);
    audit(u.id, 'vehicle.updated', 'vehicle', v.id);
    return { vehicle: serialize(get('SELECT * FROM vehicles WHERE id=?', v.id)) };
  });

  const setStatus = (status: 'ACTIVE' | 'INACTIVE', action: string) => async (req: any) => {
    const u = requireUser(req);
    const v = ownedVehicle(u.id, req.params.id);
    if (v.status === 'SUSPENDED') throw new AppError(403, 'VEHICLE_SUSPENDED', 'Kendaraan ditangguhkan oleh administrator');
    run('UPDATE vehicles SET status=?, updated_at=? WHERE id=?', status, now(), v.id);
    audit(u.id, action, 'vehicle', v.id);
    return { vehicle: serialize(get('SELECT * FROM vehicles WHERE id=?', v.id)) };
  };
  app.post('/vehicles/:id/activate', setStatus('ACTIVE', 'vehicle.activated'));
  app.post('/vehicles/:id/deactivate', setStatus('INACTIVE', 'vehicle.deactivated'));

  // Hapus = soft delete + cabut QR; riwayat laporan tetap tersimpan (VEH-09)
  app.delete('/vehicles/:id', async (req) => {
    const u = requireUser(req);
    const v = ownedVehicle(u.id, (req.params as any).id);
    tx(() => {
      run("UPDATE vehicles SET status='INACTIVE', deleted_at=?, updated_at=? WHERE id=?", now(), now(), v.id);
      run('UPDATE qr_codes SET revoked_at=? WHERE vehicle_id=? AND revoked_at IS NULL', now(), v.id);
    });
    audit(u.id, 'vehicle.deleted', 'vehicle', v.id);
    return { ok: true };
  });

  app.get('/vehicles/:id/qr', async (req, reply) => {
    const u = requireUser(req);
    const v = ownedVehicle(u.id, (req.params as any).id);
    const qr = activeQr(v.id);
    if (!qr) throw new AppError(404, 'NO_ACTIVE_QR', 'Tidak ada QR aktif. Buat QR baru.');
    const url = publicUrl(decrypt(qr.token_encrypted));
    const q = req.query as any;
    const filename = `qr-${v.plate_number.replace(/[^A-Z0-9]/g, '')}`;
    const disposition = q.download ? `attachment; filename="${filename}.${q.format === 'svg' ? 'svg' : 'png'}"` : 'inline';
    reply.header('cache-control', 'private, no-store').header('content-disposition', disposition);
    if (q.format === 'svg') return reply.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' }));
    return reply.type('image/png').send(await QRCode.toBuffer(url, { margin: 2, width: 1024, errorCorrectionLevel: 'M' }));
  });

  app.post('/vehicles/:id/qr/regenerate', async (req) => {
    const u = requireUser(req);
    const v = ownedVehicle(u.id, (req.params as any).id);
    tx(() => { const old = activeQr(v.id); createQr(v.id, old?.id); });
    audit(u.id, 'qr.regenerated', 'vehicle', v.id);
    return { vehicle: serialize(v) };
  });

  app.post('/vehicles/:id/qr/revoke', async (req) => {
    const u = requireUser(req);
    const v = ownedVehicle(u.id, (req.params as any).id);
    run('UPDATE qr_codes SET revoked_at=? WHERE vehicle_id=? AND revoked_at IS NULL', now(), v.id);
    audit(u.id, 'qr.revoked', 'vehicle', v.id);
    return { vehicle: serialize(v) };
  });
}
