import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DB_FILE = ':memory:';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'vcs-alert-'));
// Cloudflare TURN diaktifkan; tes memastikan alert TIDAK pernah memintanya
process.env.CLOUDFLARE_TURN_KEY_ID = 'k'; process.env.CLOUDFLARE_TURN_API_TOKEN = 't';

const { buildApp } = await import('../src/server.ts');
const { get, all, run } = await import('../src/db.ts');
const { tick } = await import('../src/lib/notify.ts');
const { WebSocket } = await import('ws');

let turnCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  if (String(url).includes('rtc.live.cloudflare.com')) { turnCalls++; return Response.json({ iceServers: [] }); }
  return realFetch(url, init);
}) as any;

let app: Awaited<ReturnType<typeof buildApp>>; let base = '';
before(async () => { app = await buildApp(); await app.listen({ port: 0, host: '127.0.0.1' }); base = `http://127.0.0.1:${(app.server.address() as any).port}`; });
after(async () => { await app.close(); });

class Client {
  cookie = '';
  async req(method: string, path: string, body?: any) {
    const res = await fetch(`${base}/api/v1${path}`, { method, headers: { 'x-requested-with': 'vcs', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    return { status: res.status, body: (res.headers.get('content-type') ?? '').includes('json') ? await res.json() as any : null };
  }
  get = (p: string) => this.req('GET', p); post = (p: string, b: any = {}) => this.req('POST', p, b); patch = (p: string, b: any) => this.req('PATCH', p, b); put = (p: string, b: any) => this.req('PUT', p, b);
}
async function owner(email: string) {
  const c = new Client(); const pw = 'Passw0rd-Aman1';
  const r = await c.post('/auth/register', { name: 'Budi Santoso', email, password: pw });
  await c.post('/auth/verify-email', { token: new URL(r.body.dev_verify_url).searchParams.get('token') });
  assert.equal((await c.post('/auth/login', { email, password: pw })).status, 200);
  return c;
}
const car = { name: 'Mobil Harian', plate_number: 'B 1234 ABC', vehicle_type: 'Mobil', brand: 'Toyota', model: 'Avanza', color: 'Putih', owner_display_name: 'Mobil Andri' };
const tokenOf = (u: string) => u.split('/v/')[1];

function openWs(cookie: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/api/v1/call-signaling', { headers: { cookie } });
  const msgs: any[] = []; ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
  const waitFor = async (type: string, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const i = msgs.findIndex((m) => m.type === type); if (i >= 0) return msgs.splice(i, 1)[0]; await new Promise((r) => setTimeout(r, 15)); } return null; };
  return new Promise<{ ws: any; msgs: any[]; waitFor: typeof waitFor }>((res, rej) => { ws.on('open', () => res({ ws, msgs, waitFor })); ws.on('error', rej); });
}

test('nama kendaraan, label kategori baru, dan ringkasan dashboard (stat + aktivitas)', async () => {
  const o = await owner('sum@example.com');
  const v = (await o.post('/vehicles', car)).body.vehicle;
  assert.equal(v.name, 'Mobil Harian'); assert.equal(v.call_count, 0);
  assert.equal((await o.patch(`/vehicles/${v.id}`, { name: 'Mobil Kantor' })).body.vehicle.name, 'Mobil Kantor');
  const t = tokenOf(v.qr.public_url);
  const pub = await new Client().get(`/public/vehicles/${t}`);
  assert.deepEqual(pub.body.categories.map((c: any) => c.label), ['Parkir Menghalangi', 'Akses Terblokir', 'Lampu Menyala', 'Darurat', 'Kerusakan', 'Lainnya']);
  assert.ok(!JSON.stringify(pub.body).includes('Mobil Kantor'), 'nama privat kendaraan tidak bocor ke publik');
  await new Client().post(`/public/vehicles/${t}/reports`, { category: 'PARKING', message: 'menghalangi' });
  const s = (await o.get('/dashboard/summary')).body;
  assert.equal(s.reports_total, 1); assert.equal(s.reports_today, 1);
  assert.equal(s.notifications.rate, null); // belum ada pengiriman
  assert.ok(s.activity.some((a: any) => a.type === 'report' && a.subtitle.includes('Parkir Menghalangi')));
  assert.ok(s.activity.some((a: any) => a.type === 'vehicle'));
  assert.equal(s.recent_reports[0].vehicle_name, 'Mobil Kantor');
});

test('pencarian laporan (q) menurut pelat, pesan, referensi, dan nama kendaraan', async () => {
  const o = await owner('q@example.com');
  const t = tokenOf((await o.post('/vehicles', car)).body.vehicle.qr.public_url);
  const a = new Client();
  await a.post(`/public/vehicles/${t}/reports`, { category: 'LIGHT', message: 'lampu depan menyala terus' }); run('UPDATE reports SET source_ip_hash=?', 'x1');
  await a.post(`/public/vehicles/${t}/reports`, { category: 'ACCESS', message: 'pintu keluar terhalang' });
  const n = async (q: string) => (await o.get(`/reports?q=${encodeURIComponent(q)}`)).body.total;
  assert.equal(await n('lampu'), 1); assert.equal(await n('terhalang'), 1); assert.equal(await n('1234'), 2); assert.equal(await n('Harian'), 2); assert.equal(await n('tidak-ada'), 0);
  const ref = (await o.get('/reports')).body.reports[0].reference;
  assert.equal(await n(ref), 1);
});

test('NOTIFIKASI MENDESAK: alert layar penuh ke pemilik tanpa WebRTC/TURN, tersimpan sebagai laporan urgent', async () => {
  const o = await owner('alert@example.com');
  const v = (await o.post('/vehicles', car)).body.vehicle; const t = tokenOf(v.qr.public_url);
  const w = await openWs(o.cookie); assert.ok(await w.waitFor('hello'));

  const r = await new Client().req('POST', `/public/vehicles/${t}/alerts`, { category: 'EMERGENCY', message: 'Alarm mobil berbunyi terus' });
  assert.equal(r.status, 201); assert.equal(r.body.delivered_live, true); assert.match(r.body.reference, /^VCS-/);

  const a = await w.waitFor('alert:urgent'); assert.ok(a, 'pemilik menerima alert lewat WebSocket');
  assert.equal(a.plate, 'B 1234 ABC'); assert.equal(a.vehicle_name, 'Mobil Harian'); assert.equal(a.category_label, 'Darurat'); assert.equal(a.message, 'Alarm mobil berbunyi terus');

  // bukan panggilan: tidak ada sesi panggilan, tidak ada invite, TURN tidak diminta
  assert.equal(get<any>('SELECT COUNT(*) c FROM calls')!.c, 0);
  assert.equal(w.msgs.filter((m) => m.type === 'call:invite').length, 0);
  assert.equal(turnCalls, 0, 'Cloudflare TURN tidak dipakai');

  // tercatat sebagai laporan urgent dengan riwayat
  const rep = (await o.get('/reports')).body.reports[0];
  assert.equal(rep.urgent, true); assert.equal(rep.category, 'EMERGENCY'); assert.equal(rep.status, 'NEW');
  assert.equal((await o.get('/dashboard/summary')).body.activity[0].type, 'alert');

  // pemilik membuka laporan → alert di perangkat lain ditutup
  await o.get(`/reports/${rep.id}`);
  const d = await w.waitFor('alert:dismiss'); assert.equal(d?.report_id, rep.id);

  // jeda antar-alert per kendaraan
  const again = await new Client().req('POST', `/public/vehicles/${t}/alerts`, {});
  assert.equal(again.status, 429); assert.equal(again.body.error.code, 'COOLDOWN');
  w.ws.close();
});

test('alert: dinonaktifkan pemilik → 409 + tawaran pesan; QR cabut → 410; validasi pesan', async () => {
  const o = await owner('alert2@example.com');
  const v = (await o.post('/vehicles', car)).body.vehicle; const t = tokenOf(v.qr.public_url);
  assert.equal((await new Client().get(`/public/vehicles/${t}`)).body.calls.alerts_available, true);
  assert.equal((await o.patch('/call-settings', { allow_urgent_alerts: false })).body.settings.allow_urgent_alerts, false);
  const off = await new Client().req('POST', `/public/vehicles/${t}/alerts`, {});
  assert.equal(off.status, 409); assert.equal(off.body.error.code, 'ALERTS_DISABLED'); assert.equal(off.body.error.fallback, 'message');
  assert.equal((await new Client().get(`/public/vehicles/${t}`)).body.calls.alerts_available, false);
  await o.patch('/call-settings', { allow_urgent_alerts: true });
  assert.equal((await new Client().req('POST', `/public/vehicles/${t}/alerts`, { message: 'x'.repeat(301) })).status, 400);
  await o.post(`/vehicles/${v.id}/qr/revoke`);
  assert.equal((await new Client().req('POST', `/public/vehicles/${t}/alerts`, {})).status, 410);
});

test('alert di jam tenang: tidak ada layar penuh, tapi tetap tercatat; alert tertunda dikirim saat pemilik tersambung', async () => {
  const o = await owner('alert3@example.com');
  const v = (await o.post('/vehicles', car)).body.vehicle; const t = tokenOf(v.qr.public_url);

  // pemilik offline: alert tersimpan, delivered_live=false, lalu muncul saat WebSocket tersambung (<2 menit)
  const off = await new Client().req('POST', `/public/vehicles/${t}/alerts`, { category: 'ACCESS' });
  assert.equal(off.status, 201); assert.equal(off.body.delivered_live, false);
  const w = await openWs(o.cookie);
  const pending = await w.waitFor('alert:urgent'); assert.ok(pending, 'alert tertunda dikirim saat tersambung'); w.ws.close();

  // jam tenang menutup semua jam → tidak ada layar penuh
  await o.patch('/call-settings', { quiet_hours: { enabled: true, start: '00:00', end: '23:59', timezone: 'UTC' } });
  run("UPDATE reports SET created_at=datetime('now','-1 hour') WHERE urgent=1 AND vehicle_id=?", v.id); // lewati cooldown
  const w2 = await openWs(o.cookie); assert.ok(await w2.waitFor('hello'));
  const q = await new Client().req('POST', `/public/vehicles/${t}/alerts`, {});
  assert.equal(q.status, 201); assert.equal(q.body.quiet_hours, true); assert.equal(q.body.delivered_live, false);
  assert.equal(await w2.waitFor('alert:urgent', 600), null); w2.ws.close();
  assert.equal(get<any>('SELECT COUNT(*) c FROM reports WHERE urgent=1 AND vehicle_id=?', v.id)!.c, 2);
});

test('notifikasi teks bertanda MENDESAK; kanal Email (akun pemilik) mengirim laporan dan bisa dimatikan', async () => {
  const o = await owner('mail-ch@example.com');
  const v = (await o.post('/vehicles', car)).body.vehicle; const t = tokenOf(v.qr.public_url);
  assert.equal((await o.put('/notifications/email', { enabled: true })).status, 200);
  const ch = (await o.get('/notifications/channels')).body; const em = ch.channels.find((c: any) => c.channel === 'EMAIL');
  assert.equal(em.destination_masked, 'mai***@example.com'); assert.equal(em.enabled, true); assert.equal(ch.providers.email_live, false);

  const { senders } = await import('../src/lib/providers.ts');
  const sent: { to: string; text: string }[] = []; const orig = senders.EMAIL.send;
  senders.EMAIL.send = async (to, text) => { sent.push({ to, text }); return 'm1'; };
  await new Client().req('POST', `/public/vehicles/${t}/alerts`, { category: 'ACCESS', message: 'Tolong pindahkan' });
  await tick();
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'mail-ch@example.com');
  assert.match(sent[0].text, /^🚨 NOTIFIKASI MENDESAK/); assert.match(sent[0].text, /Mobil Harian · B 1234 ABC/); assert.match(sent[0].text, /Tolong pindahkan/);
  assert.equal(all<any>("SELECT status FROM notification_deliveries WHERE channel='EMAIL'")[0].status, 'SENT');

  assert.equal((await o.put('/notifications/email', { enabled: false })).status, 200);
  run("UPDATE reports SET created_at=datetime('now','-1 hour') WHERE vehicle_id=?", v.id);
  await new Client().req('POST', `/public/vehicles/${t}/alerts`, {}); await tick();
  assert.equal(sent.length, 1, 'email dimatikan → tidak terkirim');
  senders.EMAIL.send = orig;
  assert.equal((await o.post('/notifications/test', { channel: 'EMAIL' })).status, 200);
});
