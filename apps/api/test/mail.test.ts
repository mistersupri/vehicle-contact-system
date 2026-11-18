import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

// Server SMTP nyata di localhost yang menampung email masuk
const inbox: any[] = [];
const smtp = new SMTPServer({
  authOptional: true, disabledCommands: ['STARTTLS'],
  onData(stream, _s, cb) { simpleParser(stream).then((m) => { inbox.push(m); cb(); }, cb); },
});
await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', r));

process.env.NODE_ENV = 'test';
process.env.DB_FILE = ':memory:';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'vcs-mail-'));
process.env.APP_URL = 'https://vecs.kukode.in';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = String((smtp.server.address() as any).port);
process.env.SMTP_SECURE = 'false';
process.env.MAIL_FROM = 'Vehicle Contact <no-reply@kukode.in>';

const { buildApp } = await import('../src/server.ts');
const { sendMail } = await import('../src/lib/mail.ts');
const { config } = await import('../src/config.ts');
const { get } = await import('../src/db.ts');

let app: Awaited<ReturnType<typeof buildApp>>; let base = '';
before(async () => { app = await buildApp(); await app.listen({ port: 0, host: '127.0.0.1' }); base = `http://127.0.0.1:${(app.server.address() as any).port}`; });
after(async () => { await app.close(); try { smtp.close(); } catch { /* sudah ditutup */ } });

const H = { 'x-requested-with': 'vcs', 'content-type': 'application/json' };
const post = async (p: string, b: any) => { const r = await fetch(`${base}/api/v1${p}`, { method: 'POST', headers: H, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() as any }; };
async function waitMail(to: string, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const m = inbox.find((x) => x.to?.text.includes(to)); if (m) return m; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error(`email ke ${to} tidak tiba; inbox: ${inbox.map((x) => x.to?.text)}`);
}

test('registrasi mengirim email verifikasi lewat SMTP; tautannya benar-benar mengaktifkan akun', async () => {
  const r = await post('/auth/register', { name: 'Siti Rahma', email: 'siti@example.com', password: 'Passw0rd-Aman1' });
  assert.equal(r.status, 201); assert.equal(r.body.email_sent, true);

  const m = await waitMail('siti@example.com');
  assert.equal(m.from.value[0].address, 'no-reply@kukode.in'); assert.equal(m.from.value[0].name, 'Vehicle Contact');
  assert.match(m.subject, /Verifikasi email/);
  assert.match(m.html, /<a href="https:\/\/vecs\.kukode\.in\/verify-email\?token=/); // tombol HTML
  const link = /https:\/\/vecs\.kukode\.in\/verify-email\?token=[\w-]+/.exec(m.text)![0];   // versi teks juga memuat tautan
  assert.ok(!m.text.includes('Passw0rd'), 'kata sandi tidak ada di email');

  // login sebelum verifikasi ditolak, setelah klik tautan berhasil
  assert.equal((await post('/auth/login', { email: 'siti@example.com', password: 'Passw0rd-Aman1' })).body.error.code, 'EMAIL_NOT_VERIFIED');
  assert.equal((await post('/auth/verify-email', { token: new URL(link).searchParams.get('token') })).status, 200);
  assert.equal((await post('/auth/login', { email: 'siti@example.com', password: 'Passw0rd-Aman1' })).status, 200);
});

test('kirim ulang verifikasi & lupa kata sandi juga lewat SMTP; email tak terdaftar tidak dikirimi apa pun', async () => {
  await post('/auth/register', { name: 'Budi', email: 'budi@example.com', password: 'Passw0rd-Aman1' });
  await waitMail('budi@example.com'); inbox.length = 0;
  await post('/auth/resend-verification', { email: 'budi@example.com' });
  assert.match((await waitMail('budi@example.com')).subject, /Verifikasi email/); inbox.length = 0;

  await post('/auth/forgot-password', { email: 'siti@example.com' });
  const m = await waitMail('siti@example.com');
  assert.match(m.subject, /Reset kata sandi/); assert.match(m.text, /reset-password\?token=/);

  inbox.length = 0;
  const r = await post('/auth/forgot-password', { email: 'tidak-ada@example.com' });
  assert.equal(r.status, 200); // respons identik (anti-enumerasi)
  await new Promise((res) => setTimeout(res, 400)); assert.equal(inbox.length, 0);
});

test('SMTP mati: registrasi tetap berhasil, sendMail tidak melempar galat, akun bisa diverifikasi manual admin', async () => {
  await new Promise<void>((r) => smtp.close(() => r())); // server SMTP benar-benar mati
  const sent = await sendMail('x@example.com', 'uji', 'isi').catch(() => 'THROWN');
  assert.equal(sent, false, 'gagal kirim → false, bukan galat');
  void config;

  const { hashPassword, newTotpSecret, encrypt, uuid } = await import('../src/lib/security.ts');
  const { run } = await import('../src/db.ts');
  const id = uuid();
  run("INSERT INTO users(id,name,email,password_hash,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,'ACTIVE',datetime('now'),datetime('now'),datetime('now'))", id, 'Adm', 'adm@example.com', await hashPassword('Admin-Passw0rd1'));
  run("INSERT INTO admin_users(id,user_id,role,mfa_enabled,totp_secret_encrypted,created_at) VALUES (?,?,'SUPER_ADMIN',1,?,datetime('now'))", uuid(), id, encrypt(newTotpSecret()));
  // sesi admin langsung (tanpa MFA) untuk menguji endpoint
  const { randomToken, hmac, isoPlus } = await import('../src/lib/security.ts');
  const tok = randomToken(); run("INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,datetime('now'))", uuid(), id, hmac(tok, 'session'), isoPlus(3600));

  const pend = await post('/auth/register', { name: 'Warga', email: 'warga@example.com', password: 'Passw0rd-Aman1' });
  assert.equal(pend.status, 201); assert.equal(pend.body.email_sent, true); // SMTP terkonfigurasi walau sedang mati; pengguna tetap terdaftar
  const uid = get<any>("SELECT id FROM users WHERE email='warga@example.com'")!.id;
  assert.equal(get<any>('SELECT status FROM users WHERE id=?', uid)!.status, 'PENDING');
  const r = await fetch(`${base}/api/v1/admin/users/${uid}/status`, { method: 'PATCH', headers: { ...H, cookie: `vcs_session=${tok}` }, body: JSON.stringify({ status: 'ACTIVE' }) });
  assert.equal(r.status, 200);
  const u = get<any>('SELECT status,email_verified_at FROM users WHERE id=?', uid)!;
  assert.equal(u.status, 'ACTIVE'); assert.ok(u.email_verified_at);
  assert.equal((await post('/auth/login', { email: 'warga@example.com', password: 'Passw0rd-Aman1' })).status, 200);
});
