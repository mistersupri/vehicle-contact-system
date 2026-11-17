import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import { all, audit, get, now, run, tx } from '../db.ts';
import { config, isProd } from '../config.ts';
import { AppError, ipHash, parse, requireUser, SESSION_COOKIE, userFromSessionToken } from '../lib/http.ts';
import { decrypt, encrypt, hashPassword, hmac, isoPlus, newTotpSecret, randomToken, uuid, verifyPassword, verifyTotp } from '../lib/security.ts';
import { appLink, devLinks, sendMail } from '../lib/mail.ts';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(150),
  email: z.string().trim().toLowerCase().email('Email tidak valid').max(255),
  password: z.string().min(10, 'Kata sandi minimal 10 karakter').max(200)
    .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Kata sandi harus memuat huruf dan angka'),
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

// hash tiruan agar waktu respons login tidak membocorkan keberadaan email
let dummyHash: Promise<string> | null = null;

function startSession(req: any, reply: any, userId: string) {
  const token = randomToken(32);
  const days = config.sessionTtlDays;
  run('INSERT INTO sessions(id,user_id,token_hash,user_agent,ip_hash,expires_at,created_at,last_used_at) VALUES (?,?,?,?,?,?,?,?)',
    uuid(), userId, hmac(token, 'session'), String(req.headers['user-agent'] ?? '').slice(0, 300), ipHash(req), isoPlus(days * 86400), now(), now());
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: days * 86400 });
}

function publicUser(userId: string) {
  const u = get<any>(`SELECT u.id,u.name,u.email,u.email_verified_at,u.created_at,a.role AS admin_role,a.mfa_enabled FROM users u LEFT JOIN admin_users a ON a.user_id=u.id WHERE u.id=?`, userId)!;
  return { id: u.id, name: u.name, email: u.email, email_verified: !!u.email_verified_at, created_at: u.created_at, is_admin: !!u.admin_role && !!u.mfa_enabled, admin_role: u.admin_role && u.mfa_enabled ? u.admin_role : null };
}

function issueEmailToken(table: 'email_verifications' | 'password_resets', userId: string, ttlSec: number) {
  const token = randomToken(32);
  run(`INSERT INTO ${table}(id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)`, uuid(), userId, hmac(token, table), isoPlus(ttlSec), now());
  return token;
}

export default async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } };

  app.post('/auth/register', strict, async (req, reply) => {
    const body = parse(registerSchema, req.body);
    const exists = get('SELECT id FROM users WHERE email=?', body.email);
    // respons sama untuk email yang sudah ada (anti-enumerasi)
    if (!exists) {
      const id = uuid(); const hash = await hashPassword(body.password);
      tx(() => run('INSERT INTO users(id,name,email,password_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', id, body.name, body.email, hash, 'PENDING', now(), now()));
      const token = issueEmailToken('email_verifications', id, 86400);
      const link = appLink(`/verify-email?token=${token}`);
      sendMail(body.email, 'Verifikasi email Vehicle Contact System', `Halo ${body.name}, buka tautan berikut untuk memverifikasi email Anda:\n${link}`);
      audit(id, 'user.registered', 'user', id);
      return reply.status(201).send({ ok: true, ...(devLinks ? { dev_verify_url: link } : {}) });
    }
    return reply.status(201).send({ ok: true });
  });

  app.post('/auth/verify-email', strict, async (req) => {
    const { token } = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
    const row = get<any>('SELECT * FROM email_verifications WHERE token_hash=? AND used_at IS NULL AND expires_at>?', hmac(token, 'email_verifications'), now());
    if (!row) throw new AppError(400, 'INVALID_TOKEN', 'Tautan verifikasi tidak valid atau sudah kedaluwarsa');
    tx(() => {
      run('UPDATE email_verifications SET used_at=? WHERE id=?', now(), row.id);
      run("UPDATE users SET email_verified_at=?, status='ACTIVE', updated_at=? WHERE id=? AND status='PENDING'", now(), now(), row.user_id);
    });
    audit(row.user_id, 'user.email_verified', 'user', row.user_id);
    return { ok: true };
  });

  app.post('/auth/resend-verification', strict, async (req) => {
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
    const u = get<any>("SELECT * FROM users WHERE email=? AND status='PENDING'", email);
    if (u) {
      const link = appLink(`/verify-email?token=${issueEmailToken('email_verifications', u.id, 86400)}`);
      sendMail(email, 'Verifikasi email Vehicle Contact System', link);
      return { ok: true, ...(devLinks ? { dev_verify_url: link } : {}) };
    }
    return { ok: true };
  });

  app.post('/auth/login', strict, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const u = get<any>('SELECT * FROM users WHERE email=? AND deleted_at IS NULL', body.email);
    dummyHash ??= hashPassword('dummy-password-0');
    const ok = u ? await verifyPassword(u.password_hash, body.password) : (await verifyPassword(await dummyHash, body.password), false);
    if (!u || !ok) { audit(u?.id ?? null, 'auth.login_failed', 'user', u?.id ?? null); throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah'); }
    if (u.status === 'PENDING') throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Email belum diverifikasi. Periksa kotak masuk Anda.');
    if (u.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'Akun Anda tidak aktif. Hubungi dukungan.');

    // Administrator wajib MFA (AUTH-07)
    const admin = get<any>('SELECT * FROM admin_users WHERE user_id=?', u.id);
    if (admin) {
      const token = randomToken(24);
      run('INSERT INTO mfa_challenges(id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)', uuid(), u.id, hmac(token, 'mfa'), isoPlus(300), now());
      let setup: any = null;
      if (!admin.mfa_enabled) {
        const secret = admin.totp_secret_encrypted ? decrypt(admin.totp_secret_encrypted) : newTotpSecret();
        if (!admin.totp_secret_encrypted) run('UPDATE admin_users SET totp_secret_encrypted=? WHERE id=?', encrypt(secret), admin.id);
        const uri = `otpauth://totp/Vehicle%20Contact%20System:${encodeURIComponent(u.email)}?secret=${secret}&issuer=Vehicle%20Contact%20System`;
        setup = { secret, otpauth_uri: uri, qr_svg: await QRCode.toString(uri, { type: 'svg', margin: 1 }) };
      }
      return { mfa_required: true, mfa_token: token, mfa_setup: setup };
    }
    startSession(req, reply, u.id);
    audit(u.id, 'auth.login', 'user', u.id);
    return { user: publicUser(u.id) };
  });

  app.post('/auth/mfa/verify', strict, async (req, reply) => {
    const body = parse(z.object({ mfa_token: z.string().min(10), code: z.string().regex(/^\d{6}$/, 'Kode harus 6 digit') }), req.body);
    const ch = get<any>('SELECT * FROM mfa_challenges WHERE token_hash=? AND used_at IS NULL AND expires_at>?', hmac(body.mfa_token, 'mfa'), now());
    if (!ch || ch.attempts >= 5) throw new AppError(401, 'MFA_EXPIRED', 'Sesi verifikasi berakhir. Masuk ulang.');
    run('UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=?', ch.id);
    const admin = get<any>('SELECT * FROM admin_users WHERE user_id=?', ch.user_id);
    if (!admin?.totp_secret_encrypted || !verifyTotp(decrypt(admin.totp_secret_encrypted), body.code)) throw new AppError(401, 'INVALID_MFA_CODE', 'Kode MFA salah');
    run('UPDATE mfa_challenges SET used_at=? WHERE id=?', now(), ch.id);
    if (!admin.mfa_enabled) { run('UPDATE admin_users SET mfa_enabled=1 WHERE id=?', admin.id); audit(ch.user_id, 'admin.mfa_enrolled', 'user', ch.user_id); }
    startSession(req, reply, ch.user_id);
    audit(ch.user_id, 'auth.login', 'user', ch.user_id, { mfa: true });
    return { user: publicUser(ch.user_id) };
  });

  app.post('/auth/logout', async (req, reply) => {
    const u = userFromSessionToken(req.cookies[SESSION_COOKIE]);
    if (u) { run('UPDATE sessions SET revoked_at=? WHERE id=?', now(), u.session_id); audit(u.id, 'auth.logout', 'user', u.id); }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  /** Perpanjang sesi dan rotasi token. */
  app.post('/auth/refresh', async (req, reply) => {
    const u = requireUser(req);
    const token = randomToken(32);
    run('UPDATE sessions SET token_hash=?, expires_at=?, last_used_at=? WHERE id=?', hmac(token, 'session'), isoPlus(config.sessionTtlDays * 86400), now(), u.session_id);
    reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: config.sessionTtlDays * 86400 });
    return { ok: true };
  });

  app.get('/auth/me', async (req) => ({ user: publicUser(requireUser(req).id) }));

  app.patch('/auth/me', async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ name: z.string().trim().min(2).max(150) }), req.body);
    run('UPDATE users SET name=?, updated_at=? WHERE id=?', body.name, now(), u.id);
    audit(u.id, 'user.profile_updated', 'user', u.id);
    return { user: publicUser(u.id) };
  });

  app.post('/auth/change-password', strict, async (req) => {
    const u = requireUser(req);
    const body = parse(z.object({ current_password: z.string().min(1), new_password: registerSchema.shape.password }), req.body);
    const row = get<any>('SELECT password_hash FROM users WHERE id=?', u.id)!;
    if (!(await verifyPassword(row.password_hash, body.current_password))) throw new AppError(400, 'INVALID_CREDENTIALS', 'Kata sandi saat ini salah');
    run('UPDATE users SET password_hash=?, updated_at=? WHERE id=?', await hashPassword(body.new_password), now(), u.id);
    run('UPDATE sessions SET revoked_at=? WHERE user_id=? AND id<>? AND revoked_at IS NULL', now(), u.id, u.session_id);
    audit(u.id, 'auth.password_changed', 'user', u.id);
    return { ok: true };
  });

  app.post('/auth/forgot-password', strict, async (req) => {
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
    const u = get<any>("SELECT * FROM users WHERE email=? AND status='ACTIVE'", email);
    if (u) {
      const link = appLink(`/reset-password?token=${issueEmailToken('password_resets', u.id, 3600)}`);
      sendMail(email, 'Reset kata sandi Vehicle Contact System', `Buka tautan berikut (berlaku 1 jam):\n${link}`);
      audit(u.id, 'auth.reset_requested', 'user', u.id);
      return { ok: true, ...(devLinks ? { dev_reset_url: link } : {}) };
    }
    return { ok: true }; // respons sama agar tidak membocorkan email terdaftar
  });

  app.post('/auth/reset-password', strict, async (req) => {
    const body = parse(z.object({ token: z.string().min(10).max(200), password: registerSchema.shape.password }), req.body);
    const row = get<any>('SELECT * FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?', hmac(body.token, 'password_resets'), now());
    if (!row) throw new AppError(400, 'INVALID_TOKEN', 'Tautan reset tidak valid atau sudah kedaluwarsa');
    const hash = await hashPassword(body.password);
    tx(() => {
      run('UPDATE password_resets SET used_at=? WHERE id=?', now(), row.id);
      run('UPDATE users SET password_hash=?, updated_at=? WHERE id=?', hash, now(), row.user_id);
      run('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now(), row.user_id);
    });
    audit(row.user_id, 'auth.password_reset', 'user', row.user_id);
    return { ok: true };
  });

  // Sesi/perangkat (AUTH-06)
  app.get('/auth/sessions', async (req) => {
    const u = requireUser(req);
    const rows = all<any>('SELECT id,user_agent,created_at,last_used_at,expires_at FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC', u.id, now());
    return { sessions: rows.map((r) => ({ ...r, current: r.id === u.session_id })) };
  });
  app.post('/auth/sessions/revoke-others', async (req) => {
    const u = requireUser(req);
    run('UPDATE sessions SET revoked_at=? WHERE user_id=? AND id<>? AND revoked_at IS NULL', now(), u.id, u.session_id);
    audit(u.id, 'auth.sessions_revoked', 'user', u.id);
    return { ok: true };
  });

  // Permintaan penghapusan akun (AUTH-08): soft delete; laporan & audit dipertahankan sesuai retensi.
  app.post('/auth/delete-account', strict, async (req, reply) => {
    const u = requireUser(req);
    const { password } = parse(z.object({ password: z.string().min(1) }), req.body);
    const row = get<any>('SELECT password_hash FROM users WHERE id=?', u.id)!;
    if (!(await verifyPassword(row.password_hash, password))) throw new AppError(400, 'INVALID_CREDENTIALS', 'Kata sandi salah');
    tx(() => {
      run("UPDATE users SET status='DELETED', deleted_at=?, updated_at=? WHERE id=?", now(), now(), u.id);
      run("UPDATE vehicles SET status='INACTIVE', updated_at=? WHERE user_id=?", now(), u.id);
      run('UPDATE sessions SET revoked_at=? WHERE user_id=?', now(), u.id);
      run('UPDATE notification_channels SET enabled=0 WHERE user_id=?', u.id);
    });
    audit(u.id, 'user.deletion_requested', 'user', u.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
