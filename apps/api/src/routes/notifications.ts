import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { all, audit, get, now, run } from '../db.ts';
import { config, isProd } from '../config.ts';
import { AppError, notFound, paging, parse, requireUser } from '../lib/http.ts';
import { decrypt, encrypt, hmac, isoPlus, randomToken, uuid } from '../lib/security.ts';
import { enqueue, tick } from '../lib/notify.ts';
import { senders, telegramConfigured, whatsappConfigured } from '../lib/providers.ts';

const mask = (c: string, d: string) => (c === 'WHATSAPP' ? d.replace(/\d(?=\d{3})/g, '•') : d.length > 4 ? `ID ••••${d.slice(-3)}` : '••••');

function upsertChannel(userId: string, channel: string, destination: string, verified: boolean, ref: string | null = null) {
  const ex = get<any>('SELECT id FROM notification_channels WHERE user_id=? AND channel=?', userId, channel);
  if (ex) run('UPDATE notification_channels SET destination_encrypted=?, provider_reference=?, verified=?, enabled=1, updated_at=? WHERE id=?', encrypt(destination), ref, verified ? 1 : 0, now(), ex.id);
  else run('INSERT INTO notification_channels(id,user_id,channel,destination_encrypted,provider_reference,verified,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)', uuid(), userId, channel, encrypt(destination), ref, verified ? 1 : 0, now(), now());
}

/** Dipakai webhook Telegram dan simulasi dev: tautkan chat ke akun dengan token sekali pakai. */
export function consumeTelegramToken(token: string, chatId: string): boolean {
  const row = get<any>("SELECT * FROM channel_link_tokens WHERE token_hash=? AND channel='TELEGRAM' AND used_at IS NULL AND expires_at>?", hmac(token, 'tg'), now());
  if (!row) return false;
  run('UPDATE channel_link_tokens SET used_at=? WHERE id=?', now(), row.id);
  upsertChannel(row.user_id, 'TELEGRAM', chatId, true);
  audit(row.user_id, 'notification.telegram_linked', 'user', row.user_id);
  return true;
}

export default async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications/channels', async (req) => {
    const u = requireUser(req);
    const rows = all<any>('SELECT * FROM notification_channels WHERE user_id=?', u.id);
    const pending = get('SELECT 1 FROM channel_link_tokens WHERE user_id=? AND channel=\'TELEGRAM\' AND used_at IS NULL AND expires_at>?', u.id, now());
    return {
      channels: rows.map((r) => ({ id: r.id, channel: r.channel, destination_masked: mask(r.channel, decrypt(r.destination_encrypted)), verified: !!r.verified, enabled: !!r.enabled, updated_at: r.updated_at })),
      telegram_link_pending: !!pending,
      providers: { telegram_live: telegramConfigured(), whatsapp_live: whatsappConfigured(), telegram_bot_username: config.telegramBotUsername || null, demo_mode: !isProd && (!telegramConfigured() || !whatsappConfigured()) },
    };
  });

  app.post('/notifications/telegram/connect', async (req) => {
    const u = requireUser(req);
    const token = randomToken(18);
    run("UPDATE channel_link_tokens SET used_at=? WHERE user_id=? AND channel='TELEGRAM' AND used_at IS NULL", now(), u.id);
    run('INSERT INTO channel_link_tokens(id,user_id,channel,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)', uuid(), u.id, 'TELEGRAM', hmac(token, 'tg'), isoPlus(900), now());
    return {
      expires_in: 900,
      deep_link: config.telegramBotUsername ? `https://t.me/${config.telegramBotUsername}?start=${token}` : null,
      ...(!telegramConfigured() && !isProd ? { dev_token: token } : {}),
    };
  });

  // Demo (tanpa bot sungguhan): simulasikan pesan /start dari Telegram. Tidak tersedia di production.
  app.post('/notifications/telegram/simulate', async (req) => {
    const u = requireUser(req);
    if (isProd || telegramConfigured()) throw notFound();
    const { token } = parse(z.object({ token: z.string() }), req.body);
    if (!consumeTelegramToken(token, `demo-${u.id.slice(0, 8)}`)) throw new AppError(400, 'INVALID_TOKEN', 'Token tidak valid atau kedaluwarsa');
    return { ok: true };
  });

  app.post('/notifications/telegram/disconnect', async (req) => {
    const u = requireUser(req);
    run("DELETE FROM notification_channels WHERE user_id=? AND channel='TELEGRAM'", u.id);
    audit(u.id, 'notification.telegram_unlinked', 'user', u.id);
    return { ok: true };
  });

  app.post('/notifications/whatsapp/connect', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    const { phone } = parse(z.object({ phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Gunakan format internasional, contoh +628123456789') }), req.body);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    run("UPDATE channel_link_tokens SET used_at=? WHERE user_id=? AND channel='WHATSAPP' AND used_at IS NULL", now(), u.id);
    run('INSERT INTO channel_link_tokens(id,user_id,channel,token_hash,payload_encrypted,expires_at,created_at) VALUES (?,?,?,?,?,?,?)', uuid(), u.id, 'WHATSAPP', hmac(`${u.id}:${code}`, 'wa'), encrypt(phone), isoPlus(600), now());
    try { await senders.WHATSAPP.send(phone, `Kode verifikasi Vehicle Contact System: ${code}. Berlaku 10 menit.`); }
    catch { throw new AppError(502, 'SEND_FAILED', 'Gagal mengirim kode verifikasi WhatsApp'); }
    return { ok: true, expires_in: 600, ...(!whatsappConfigured() && !isProd ? { dev_code: code } : {}) };
  });

  app.post('/notifications/whatsapp/verify', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/, 'Kode harus 6 digit') }), req.body);
    const row = get<any>("SELECT * FROM channel_link_tokens WHERE user_id=? AND channel='WHATSAPP' AND used_at IS NULL AND expires_at>? ORDER BY created_at DESC", u.id, now());
    if (!row || row.attempts >= 5) throw new AppError(400, 'INVALID_CODE', 'Kode kedaluwarsa. Minta kode baru.');
    run('UPDATE channel_link_tokens SET attempts=attempts+1 WHERE id=?', row.id);
    if (row.token_hash !== hmac(`${u.id}:${code}`, 'wa')) throw new AppError(400, 'INVALID_CODE', 'Kode salah');
    run('UPDATE channel_link_tokens SET used_at=? WHERE id=?', now(), row.id);
    upsertChannel(u.id, 'WHATSAPP', decrypt(row.payload_encrypted), true);
    audit(u.id, 'notification.whatsapp_linked', 'user', u.id);
    return { ok: true };
  });

  app.patch('/notifications/channels/:id', async (req) => {
    const u = requireUser(req);
    const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
    const ch = get<any>('SELECT id FROM notification_channels WHERE id=? AND user_id=?', (req.params as any).id, u.id);
    if (!ch) throw notFound('Kanal');
    run('UPDATE notification_channels SET enabled=?, updated_at=? WHERE id=?', enabled ? 1 : 0, now(), ch.id);
    audit(u.id, 'notification.channel_toggled', 'notification_channel', ch.id, { enabled });
    return { ok: true };
  });

  app.post('/notifications/test', { config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } }, async (req) => {
    const u = requireUser(req);
    const { channel } = parse(z.object({ channel: z.enum(['WHATSAPP', 'TELEGRAM']) }), req.body);
    const ch = get<any>('SELECT * FROM notification_channels WHERE user_id=? AND channel=? AND verified=1', u.id, channel);
    if (!ch) throw new AppError(400, 'NOT_CONNECTED', 'Kanal belum terhubung');
    enqueue('test', { owner_id: u.id });
    void tick();
    return { ok: true };
  });

  app.get('/notifications/deliveries', async (req) => {
    const u = requireUser(req);
    const { limit, offset } = paging(req.query);
    const rows = all<any>(`SELECT d.id,d.channel,d.status,d.attempts,d.last_error_code,d.sent_at,d.created_at,d.next_attempt_at,d.payload FROM notification_deliveries d WHERE d.user_id=? ORDER BY d.created_at DESC LIMIT ? OFFSET ?`, u.id, limit, offset);
    return { deliveries: rows.map(({ payload, ...r }) => ({ ...r, kind: JSON.parse(payload).kind, plate: JSON.parse(payload).plate ?? null })) };
  });
}
