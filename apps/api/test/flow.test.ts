import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DB_FILE = ':memory:';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'vcs-'));
process.env.RETRY_SCHEDULE = '0,1,1';
process.env.TELEPHONY_PROVIDER = 'mock';

const { buildApp } = await import('../src/server.ts');
const { all, get, run } = await import('../src/db.ts');
const { tick } = await import('../src/lib/notify.ts');
const { totpNow, decrypt } = await import('../src/lib/security.ts');
const { signWebhook } = await import('../src/lib/telephony.ts');
const sharp = (await import('sharp')).default;
const { WebSocket } = await import('ws');

let app: Awaited<ReturnType<typeof buildApp>>;
let base = '';
before(async () => { app = await buildApp(); await app.listen({ port: 0, host: '127.0.0.1' }); base = `http://127.0.0.1:${(app.server.address() as any).port}`; });
after(async () => { await app.close(); });

const H = { 'x-requested-with': 'vcs' };
class Client {
  cookie = '';
  async req(method: string, path: string, body?: any, extra: Record<string, string> = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { ...H, ...(isForm || body === undefined ? {} : { 'content-type': 'application/json' }), ...(this.cookie ? { cookie: this.cookie } : {}), ...extra },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') ?? '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) as any, res };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b: any = {}) => this.req('POST', p, b);
  patch = (p: string, b: any) => this.req('PATCH', p, b);
}

async function signup(email: string, name = 'Tester') {
  const c = new Client();
  const pw = 'Passw0rd-Aman1';
  const r = await c.post('/auth/register', { name, email, password: pw });
  assert.equal(r.status, 201);
  const token = new URL(r.body.dev_verify_url).searchParams.get('token');
  assert.equal((await c.post('/auth/verify-email', { token })).status, 200);
  const l = await c.post('/auth/login', { email, password: pw });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  return c;
}
const vehicleBody = { plate_number: 'b 1234 xyz', vehicle_type: 'Mobil', brand: 'Toyota', model: 'Avanza', color: 'Putih', owner_display_name: 'Budi S.' };
const tokenOf = (url: string) => url.split('/v/')[1];

test('auth: password lemah ditolak, login butuh verifikasi email, CSRF header wajib', async () => {
  const c = new Client();
  assert.equal((await c.post('/auth/register', { name: 'A', email: 'x@y.id', password: 'short' })).status, 400);
  const r = await c.post('/auth/register', { name: 'Andi', email: 'andi@example.com', password: 'Passw0rd-Aman1' });
  const early = await c.post('/auth/login', { email: 'andi@example.com', password: 'Passw0rd-Aman1' });
  assert.equal(early.status, 403); assert.equal(early.body.error.code, 'EMAIL_NOT_VERIFIED');
  assert.ok(r.body.dev_verify_url);
  const noHeader = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  assert.equal((await c.get('/auth/me')).status, 401);
});

test('laporan end-to-end, otorisasi kepemilikan, pencabutan QR', async () => {
  const owner = await signup('owner@example.com');
  const other = await signup('other@example.com');
  const created = await owner.post('/vehicles', vehicleBody);
  assert.equal(created.status, 201);
  const v = created.body.vehicle;
  assert.equal(v.plate_number, 'B 1234 XYZ');
  const token = tokenOf(v.qr.public_url);
  assert.ok(token.length >= 43, 'token 256-bit');

  // token mentah tidak tersimpan; hanya hash
  assert.equal(get("SELECT COUNT(*) c FROM qr_codes WHERE token_hash=?", token)!.c, 0);

  const pub = await new Client().get(`/public/vehicles/${token}`);
  assert.equal(pub.status, 200);
  const dump = JSON.stringify(pub.body);
  assert.ok(!dump.includes('owner@example.com') && !dump.includes('user_id'), 'tidak membocorkan data pemilik');
  assert.equal(pub.body.vehicle.owner_display_name, 'Budi S.');

  // QR bisa diunduh PNG + SVG
  const png = await owner.get(`/vehicles/${v.id}/qr`); assert.equal(png.res.headers.get('content-type'), 'image/png');
  const svg = await owner.get(`/vehicles/${v.id}/qr?format=svg`); assert.match(String(svg.body), /<svg/);

  const anon = new Client();
  assert.equal((await anon.post(`/public/vehicles/${token}/reports`, { category: 'PARKING', message: 'x'.repeat(1001) })).status, 400);
  assert.equal((await anon.post(`/public/vehicles/${token}/reports`, { category: 'NOPE', message: 'halo' })).status, 400);
  const rep = await anon.post(`/public/vehicles/${token}/reports`, { category: 'ACCESS', message: 'Menghalangi pintu keluar', reporter_name: 'Rina', reporter_phone: '+628111222333' });
  assert.equal(rep.status, 201);
  assert.match(rep.body.reference, /^VCS-[A-Z0-9]{10}$/);
  assert.equal((await anon.get(`/public/reports/${rep.body.reference}`)).body.status, 'Diterima');

  const list = await owner.get('/reports');
  assert.equal(list.body.total, 1);
  const rid = list.body.reports[0].id;
  const detail = await owner.get(`/reports/${rid}`);
  assert.equal(detail.body.report.reporter_phone, '+628111222333');
  assert.equal(detail.body.report.status, 'READ'); // otomatis READ saat dibuka

  assert.equal((await owner.patch(`/reports/${rid}/status`, { status: 'IN_PROGRESS', note: 'OTW' })).status, 200);
  const hist = await owner.get(`/reports/${rid}/history`);
  assert.deepEqual(hist.body.history.map((h: any) => h.new_status), ['NEW', 'READ', 'IN_PROGRESS']);

  // akun lain tidak bisa mengakses (404, bukan 403)
  assert.equal((await other.get(`/vehicles/${v.id}`)).status, 404);
  assert.equal((await other.get(`/reports/${rid}`)).status, 404);
  assert.equal((await other.patch(`/reports/${rid}/status`, { status: 'RESOLVED' })).status, 404);
  assert.equal((await new Client().get(`/reports/${rid}`)).status, 401);

  // regenerasi: token lama tidak valid, laporan lama tetap ada
  const regen = await owner.post(`/vehicles/${v.id}/qr/regenerate`);
  assert.equal(regen.status, 200);
  const old = await anon.get(`/public/vehicles/${token}`);
  assert.equal(old.body.active, false);
  assert.equal((await anon.post(`/public/vehicles/${token}/reports`, { category: 'OTHER', message: 'halo' })).status, 410);
  assert.equal((await owner.get('/reports')).body.total, 1);
  assert.equal((await anon.get('/public/vehicles/tokenngawur123456')).status, 404);

  // nonaktifkan kendaraan
  const newToken = tokenOf((await owner.get(`/vehicles/${v.id}`)).body.vehicle.qr.public_url);
  await owner.post(`/vehicles/${v.id}/deactivate`);
  assert.equal((await anon.post(`/public/vehicles/${newToken}/reports`, { category: 'OTHER', message: 'halo' })).status, 410);
});

test('rate limit laporan per kendaraan (5 per 10 menit)', async () => {
  const owner = await signup('rl@example.com');
  const v = (await owner.post('/vehicles', { ...vehicleBody, plate_number: 'D 1 RL' })).body.vehicle;
  const token = tokenOf(v.qr.public_url);
  const codes: number[] = [];
  for (let i = 0; i < 7; i++) {
    run('UPDATE reports SET source_ip_hash=? WHERE vehicle_id=?', `other-${i}`, v.id); // hindari cooldown per-sumber agar batas kendaraan yang teruji
    codes.push((await new Client().post(`/public/vehicles/${token}/reports`, { category: 'OTHER', message: `laporan ${i}` })).status);
  }
  assert.deepEqual(codes.slice(0, 5), [201, 201, 201, 201, 201]);
  assert.equal(codes[5], 429);
});

test('foto: validasi isi file, EXIF/GPS dibuang, maksimal 3, hanya pemilik yang bisa melihat', async () => {
  const owner = await signup('foto@example.com');
  const v = (await owner.post('/vehicles', { ...vehicleBody, plate_number: 'F 1 FT' })).body.vehicle;
  const token = tokenOf(v.qr.public_url);
  const anon = new Client();
  const jpegWithGps = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#336699' } })
    .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 12/1 0/1' } }).jpeg().toBuffer();
  assert.ok((await sharp(jpegWithGps).metadata()).exif, 'fixture memang punya EXIF');

  const up = async (data: Buffer, name: string, type: string) => { const f = new FormData(); f.append('file', new Blob([new Uint8Array(data)], { type }), name); return anon.req('POST', `/public/vehicles/${token}/uploads`, f); };
  const ok = await up(jpegWithGps, 'a.jpg', 'image/jpeg');
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const att = get<any>('SELECT * FROM report_attachments WHERE id=?', ok.body.id)!;
  const stored = await (await import('../src/lib/storage.ts')).storage.get(att.storage_key);
  assert.equal((await sharp(stored).metadata()).exif, undefined, 'EXIF/GPS dibuang');
  assert.ok(existsSync(join(process.env.DATA_DIR!, 'uploads', att.thumb_key)));

  assert.equal((await up(Buffer.from('<?php echo 1; ?>'), 'x.jpg', 'image/jpeg')).status, 400); // ekstensi/MIME palsu
  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).gif().toBuffer();
  assert.equal((await up(gif, 'x.gif', 'image/gif')).body.error.code, 'INVALID_IMAGE_TYPE');
  assert.equal((await up(Buffer.alloc(5 * 1024 * 1024 + 10, 1), 'big.jpg', 'image/jpeg')).status, 400);

  const ids = [ok.body.id];
  for (let i = 0; i < 3; i++) ids.push((await up(jpegWithGps, 'b.jpg', 'image/jpeg')).body.id);
  assert.equal((await anon.post(`/public/vehicles/${token}/reports`, { category: 'DAMAGE', message: 'baret', attachment_ids: ids })).status, 400); // 4 foto
  const rep = await anon.post(`/public/vehicles/${token}/reports`, { category: 'DAMAGE', message: 'baret', attachment_ids: ids.slice(0, 3) });
  assert.equal(rep.status, 201);
  const rid = (await owner.get('/reports')).body.reports[0].id;
  const d = (await owner.get(`/reports/${rid}`)).body.report;
  assert.equal(d.attachments.length, 3);
  assert.equal((await owner.get(`/attachments/${d.attachments[0].id}?thumb=1`)).res.headers.get('content-type'), 'image/webp');
  const stranger = await signup('stranger@example.com');
  assert.equal((await stranger.get(`/attachments/${d.attachments[0].id}`)).status, 404);
  assert.equal((await anon.get(`/attachments/${d.attachments[0].id}`)).status, 401);
  // lampiran yang sudah dipakai tidak bisa dipakai ulang
  assert.equal((await anon.post(`/public/vehicles/${token}/reports`, { category: 'DAMAGE', message: 'lagi', attachment_ids: [ids[0]] })).status, 400);
});

test('notifikasi: outbox -> delivery per kanal, kegagalan satu kanal tidak menghalangi, retry tanpa duplikat', async () => {
  const owner = await signup('notif@example.com');
  const v = (await owner.post('/vehicles', { ...vehicleBody, plate_number: 'N 1 NT' })).body.vehicle;
  const token = tokenOf(v.qr.public_url);

  const tg = await owner.post('/notifications/telegram/connect');
  assert.ok(tg.body.dev_token);
  assert.equal((await owner.post('/notifications/telegram/simulate', { token: tg.body.dev_token })).status, 200);
  assert.equal((await owner.post('/notifications/telegram/simulate', { token: tg.body.dev_token })).status, 400, 'token sekali pakai');
  const wa = await owner.post('/notifications/whatsapp/connect', { phone: '+628123456789' });
  assert.equal((await owner.post('/notifications/whatsapp/verify', { code: '000000' })).status, 400);
  assert.equal((await owner.post('/notifications/whatsapp/verify', { code: wa.body.dev_code })).status, 200);
  const chans = (await owner.get('/notifications/channels')).body.channels;
  assert.equal(chans.length, 2);
  assert.ok(!JSON.stringify(chans).includes('628123456789'), 'tujuan dimasking');

  // Rusak WhatsApp: patch sender agar gagal sementara
  const { senders } = await import('../src/lib/providers.ts');
  const orig = senders.WHATSAPP.send; let waCalls = 0;
  senders.WHATSAPP.send = async () => { waCalls++; if (waCalls < 2) throw new Error('boom'); return 'wa-ok'; };

  await new Client().post(`/public/vehicles/${token}/reports`, { category: 'ACCESS', message: 'tolong pindahkan' });
  await tick();
  let d = all<any>("SELECT channel,status,attempts FROM notification_deliveries WHERE user_id=(SELECT user_id FROM vehicles WHERE id=?) ORDER BY channel", v.id);
  assert.deepEqual(d.map((x) => [x.channel, x.status]), [['TELEGRAM', 'SENT'], ['WHATSAPP', 'RETRY_SCHEDULED']]);
  await new Promise((r) => setTimeout(r, 1500));
  await tick(); await tick();
  d = all<any>("SELECT channel,status,attempts FROM notification_deliveries WHERE user_id=(SELECT user_id FROM vehicles WHERE id=?) ORDER BY channel", v.id);
  assert.deepEqual(d.map((x) => [x.channel, x.status, x.attempts]), [['TELEGRAM', 'SENT', 1], ['WHATSAPP', 'SENT', 2]]);
  assert.equal(get<any>('SELECT COUNT(*) c FROM notification_deliveries')!.c >= 2, true);

  // kanal dinonaktifkan tidak menerima
  await owner.patch(`/notifications/channels/${chans[0].id}`, { enabled: false });
  const before = get<any>('SELECT COUNT(*) c FROM notification_deliveries')!.c;
  await new Client().post(`/public/vehicles/${token}/reports`, { category: 'LIGHT', message: 'lampu' });
  await tick();
  assert.equal(get<any>('SELECT COUNT(*) c FROM notification_deliveries')!.c, before + 1);
  senders.WHATSAPP.send = orig;
});

function wsOpen(path: string, headers: Record<string, string> = {}) {
  const ws = new WebSocket(base.replace('http', 'ws') + `/api/v1${path}`, { headers });
  const msgs: any[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
  const waitFor = async (type: string, ms = 2000, match?: (m: any) => boolean) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const i = msgs.findIndex((m) => m.type === type && (!match || match(m))); if (i >= 0) return msgs.splice(i, 1)[0]; await new Promise((r) => setTimeout(r, 15)); }
    throw new Error(`timeout menunggu ${type}; diterima: ${msgs.map((m) => m.type)}`);
  };
  return new Promise<{ ws: InstanceType<typeof WebSocket>; msgs: any[]; waitFor: typeof waitFor }>((res, rej) => { ws.on('open', () => res({ ws, msgs, waitFor })); ws.on('error', rej); });
}

test('WebRTC signaling: invite, accept, relay offer/answer/ice, riwayat, satu panggilan aktif', async () => {
  const owner = await signup('call@example.com');
  const v = (await owner.post('/vehicles', { ...vehicleBody, plate_number: 'C 1 CL' })).body.vehicle;
  const token = tokenOf(v.qr.public_url);
  const anon = new Client();

  // pemilik offline -> mode ONLINE menolak, menawarkan pesan
  const off = await anon.post('/public/calls', { vehicle_token: token, client_id: 'client-aaa-1' });
  assert.equal(off.status, 409); assert.equal(off.body.error.code, 'OWNER_OFFLINE'); assert.equal(off.body.error.fallback, 'message');
  assert.equal((await new Client().get(`/public/vehicles/${token}`)).body.calls.webrtc_available, false);

  const o = await wsOpen('/call-signaling', { cookie: owner.cookie });
  await o.waitFor('hello');
  const call = await anon.post('/public/calls', { vehicle_token: token, client_id: 'client-aaa-1' });
  assert.equal(call.status, 201, JSON.stringify(call.body));
  assert.ok(call.body.signaling_token && call.body.ice_servers.length);
  const inv = await o.waitFor('call:invite'); assert.equal(inv.call_id, call.body.call_id); assert.equal(inv.plate, 'C 1 CL');

  // satu panggilan aktif per kendaraan
  assert.equal((await new Client().post('/public/calls', { vehicle_token: token, client_id: 'client-bbb-2' })).body.error.code, 'BUSY');

  const c = await wsOpen(`/call-signaling?token=${encodeURIComponent(call.body.signaling_token)}`);
  await c.waitFor('call:ringing');
  // penelepon tidak boleh meng-accept
  c.ws.send(JSON.stringify({ type: 'call:accept', call_id: call.body.call_id }));
  o.ws.send(JSON.stringify({ type: 'call:accept', call_id: call.body.call_id }));
  await c.waitFor('call:accept');
  c.ws.send(JSON.stringify({ type: 'call:offer', sdp: { type: 'offer', sdp: 'fake-offer' } }));
  assert.equal((await o.waitFor('call:offer')).sdp.sdp, 'fake-offer');
  o.ws.send(JSON.stringify({ type: 'call:answer', call_id: call.body.call_id, sdp: { type: 'answer', sdp: 'fake-answer' } }));
  assert.equal((await c.waitFor('call:answer')).sdp.sdp, 'fake-answer');
  c.ws.send(JSON.stringify({ type: 'call:ice-candidate', candidate: { candidate: 'c1' } }));
  assert.equal((await o.waitFor('call:ice-candidate')).candidate.candidate, 'c1');

  await new Promise((r) => setTimeout(r, 1100));
  assert.equal((await owner.post(`/calls/${call.body.call_id}/end`)).status, 200);
  await c.waitFor('call:end');
  const hist = (await owner.get('/calls/history')).body.calls;
  assert.equal(hist[0].status, 'COMPLETED'); assert.ok(hist[0].duration_seconds >= 1);

  // orang lain tidak bisa mengendalikan panggilan ini
  const intruder = await signup('intruder@example.com');
  assert.equal((await intruder.post(`/calls/${call.body.call_id}/accept`)).status, 404);

  // ditolak -> penelepon diberi fallback; tak terjawab tercatat
  const c2 = (await anon.post('/public/calls', { vehicle_token: token, client_id: 'client-ccc-3' })).body;
  await o.waitFor('call:invite');
  assert.equal((await owner.post(`/calls/${c2.call_id}/reject`)).status, 200);
  assert.equal((await o.waitFor('call:cancelled', 2000, (m) => m.call_id === c2.call_id)).call_id, c2.call_id);
  const w2 = await wsOpen(`/call-signaling?token=${encodeURIComponent(c2.signaling_token)}`);
  assert.equal((await w2.waitFor('call:error')).fallback, true); // sudah tidak aktif

  const c3 = (await new Client().post('/public/calls', { vehicle_token: token, client_id: 'client-ddd-4' })).body;
  await o.waitFor('call:invite');
  const w3 = await wsOpen(`/call-signaling?token=${encodeURIComponent(c3.signaling_token)}`);
  await w3.waitFor('call:ringing');
  w3.ws.close(); // penelepon membatalkan sebelum dijawab
  assert.equal((await o.waitFor('call:cancelled', 2000, (m) => m.call_id === c3.call_id)).call_id, c3.call_id);
  assert.equal((await owner.get('/calls/missed')).body.calls.length, 1);
  o.ws.close();

  // token signaling palsu ditolak
  const bad = await wsOpen('/call-signaling?token=ngawur.ngawur');
  assert.equal((await bad.waitFor('call:error')).reason, 'unauthorized');
});

test('PSTN: butuh consent, provider siap, nomor valid; webhook wajib tanda tangan', async () => {
  const owner = await signup('pstn@example.com');
  const v = (await owner.post('/vehicles', { ...vehicleBody, plate_number: 'P 1 ST' })).body.vehicle;
  const token = tokenOf(v.qr.public_url);
  const anon = new Client();
  assert.equal((await anon.post('/public/calls/pstn', { vehicle_token: token, caller_phone: '+628111111111', consent: true })).body.error.code, 'PSTN_DISABLED');
  assert.equal((await owner.patch('/call-settings', { pstn_enabled: true, owner_phone: '+628999888777' })).status, 200);
  assert.equal((await new Client().get(`/public/vehicles/${token}`)).body.calls.pstn_available, true);

  assert.equal((await anon.post('/public/calls/pstn', { vehicle_token: token, caller_phone: '+628111111111', consent: false })).status, 400);
  assert.equal((await anon.post('/public/calls/pstn', { vehicle_token: token, caller_phone: '08111', consent: true })).status, 400);
  assert.equal((await anon.post('/public/calls/pstn', { vehicle_token: token, caller_phone: '+14155550123', consent: true })).body.error.code, 'DESTINATION_NOT_ALLOWED');
  const ok = await anon.post('/public/calls/pstn', { vehicle_token: token, caller_phone: '+628111111111', consent: true });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.ok(!JSON.stringify(ok.body).includes('628999888777'), 'nomor pemilik tidak bocor');

  const ts = get<any>('SELECT * FROM telephony_sessions')!;
  const payload = JSON.stringify({ provider_call_id: ts.provider_call_id, status: 'NO_ANSWER' });
  const unsigned = await fetch(`${base}/api/v1/webhooks/telephony/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
  assert.equal(unsigned.status, 401);
  const signed = await fetch(`${base}/api/v1/webhooks/telephony/events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': signWebhook(payload) }, body: payload });
  assert.equal(signed.status, 200);
  assert.equal(get<any>('SELECT status FROM calls WHERE id=?', ts.call_id)!.status, 'MISSED');
  // nomor pemilik tersimpan terenkripsi
  const raw = get<any>('SELECT owner_phone_encrypted p FROM call_settings WHERE owner_phone_encrypted IS NOT NULL')!.p;
  assert.ok(!raw.includes('628999888777')); assert.equal(decrypt(raw), '+628999888777');
});

test('admin: wajib MFA, pemilik biasa ditolak, aksi tercatat di audit log', async () => {
  const { hashPassword, newTotpSecret, encrypt, uuid } = await import('../src/lib/security.ts');
  const id = uuid();
  run("INSERT INTO users(id,name,email,password_hash,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,'ACTIVE',datetime('now'),datetime('now'),datetime('now'))", id, 'Adm', 'adm@example.com', await hashPassword('Admin-Passw0rd1'));
  const secret = newTotpSecret();
  run("INSERT INTO admin_users(id,user_id,role,mfa_enabled,totp_secret_encrypted,created_at) VALUES (?,?,'SUPER_ADMIN',0,?,datetime('now'))", uuid(), id, encrypt(secret));

  const a = new Client();
  const l = await a.post('/auth/login', { email: 'adm@example.com', password: 'Admin-Passw0rd1' });
  assert.equal(l.body.mfa_required, true); assert.ok(l.body.mfa_setup.qr_svg); assert.equal(a.cookie, '', 'belum ada sesi sebelum MFA');
  assert.equal((await a.post('/auth/mfa/verify', { mfa_token: l.body.mfa_token, code: '000000' })).status, 401);
  const v = await a.post('/auth/mfa/verify', { mfa_token: l.body.mfa_token, code: totpNow(l.body.mfa_setup.secret) });
  assert.equal(v.status, 200); assert.equal(v.body.user.is_admin, true);
  assert.equal((await a.get('/admin/metrics')).status, 200);
  assert.ok((await a.get('/admin/users')).body.total >= 1);
  assert.equal((await a.get('/admin/integrations')).body.integrations.find((i: any) => i.key === 'telephony').configured, true);

  const regular = await signup('regular@example.com');
  assert.equal((await regular.get('/admin/metrics')).status, 403);
  assert.equal((await new Client().get('/admin/metrics')).status, 401);

  const target = get<any>("SELECT id FROM users WHERE email='regular@example.com'")!.id;
  assert.equal((await a.patch(`/admin/users/${target}/status`, { status: 'SUSPENDED' })).status, 200);
  assert.equal((await regular.get('/auth/me')).status, 401, 'sesi dicabut saat ditangguhkan');
  const logs = (await a.get('/admin/audit-logs')).body.logs.map((x: any) => x.action);
  assert.ok(logs.includes('admin.user_status') && logs.includes('auth.login'));
});
