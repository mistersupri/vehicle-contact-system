import type { FastifyInstance } from 'fastify';
import { get, run, now, audit } from '../db.ts';
import { config } from '../config.ts';
import { getTelephony } from '../lib/telephony.ts';
import { verifyMetaSignature } from '../lib/providers.ts';
import { consumeTelegramToken } from './notifications.ts';
import { logEvent } from '../lib/calls.ts';
import { enqueue } from '../lib/notify.ts';
import crypto from 'node:crypto';

const safeEq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default async function webhookRoutes(app: FastifyInstance) {
  // Simpan body mentah agar tanda tangan webhook bisa diverifikasi
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as any).rawBody = body;
    try { done(null, (body as Buffer).length ? JSON.parse(body.toString()) : {}); } catch (e: any) { e.statusCode = 400; done(e, undefined); }
  });

  // WhatsApp (Meta): verifikasi langganan webhook
  app.get('/webhooks/whatsapp', async (req, reply) => {
    const q = req.query as any;
    if (q['hub.mode'] === 'subscribe' && config.whatsappVerifyToken && safeEq(String(q['hub.verify_token'] ?? ''), config.whatsappVerifyToken)) return reply.type('text/plain').send(q['hub.challenge']);
    return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Token verifikasi salah' } });
  });
  app.post('/webhooks/whatsapp', async (req, reply) => {
    if (!verifyMetaSignature((req as any).rawBody ?? '', req.headers['x-hub-signature-256'] as string)) return reply.status(401).send({ error: { code: 'BAD_SIGNATURE', message: 'Tanda tangan tidak valid' } });
    return { ok: true }; // WhatsApp hanya kanal notifikasi satu arah (PRD 2.2)
  });

  // Telegram: pesan "/start <token>" menautkan chat
  app.post('/webhooks/telegram', async (req, reply) => {
    if (!config.telegramWebhookSecret || !safeEq(String(req.headers['x-telegram-bot-api-secret-token'] ?? ''), config.telegramWebhookSecret))
      return reply.status(401).send({ error: { code: 'BAD_SECRET', message: 'Secret tidak valid' } });
    const msg = (req.body as any)?.message;
    const m = /^\/start\s+(\S+)/.exec(msg?.text ?? '');
    if (m && msg.chat?.id) consumeTelegramToken(m[1], String(msg.chat.id));
    return { ok: true };
  });

  // Telephony: wajib tanda tangan valid
  app.post('/webhooks/telephony/events', async (req, reply) => {
    const adapter = getTelephony();
    const raw = ((req as any).rawBody as Buffer | undefined)?.toString() ?? '';
    if (!adapter || !adapter.verifyWebhook(raw, req.headers['x-signature'] as string)) return reply.status(401).send({ error: { code: 'BAD_SIGNATURE', message: 'Tanda tangan tidak valid' } });
    const ev = adapter.normalizeProviderEvent(req.body);
    if (!ev) return reply.status(400).send({ error: { code: 'BAD_EVENT', message: 'Event tidak dikenali' } });
    const s = get<any>('SELECT * FROM telephony_sessions WHERE provider_call_id=?', ev.providerCallId);
    if (!s) return { ok: true };
    run('UPDATE telephony_sessions SET status=?, updated_at=? WHERE id=?', ev.status, now(), s.id);
    const map: Record<string, string> = { RINGING: 'RINGING', ANSWERED: 'ACCEPTED', COMPLETED: 'COMPLETED', FAILED: 'FAILED', NO_ANSWER: 'MISSED' };
    const status = map[ev.status];
    const call = get<any>('SELECT * FROM calls WHERE id=?', s.call_id);
    if (status === 'ACCEPTED') run("UPDATE calls SET status='ACCEPTED', answered_at=COALESCE(answered_at,?) WHERE id=? AND status='RINGING'", now(), call.id);
    else if (['COMPLETED', 'FAILED', 'MISSED'].includes(status)) {
      run('UPDATE calls SET status=?, ended_at=?, duration_seconds=?, end_reason=? WHERE id=? AND status IN (\'RINGING\',\'ACCEPTED\')', status, now(), ev.durationSeconds ?? null, `provider_${ev.status.toLowerCase()}`, call.id);
      if (status === 'MISSED') enqueue('call.missed', { call_id: call.id, owner_id: call.owner_id, plate: get<any>('SELECT plate_number FROM vehicles WHERE id=?', call.vehicle_id)?.plate_number, at: now() });
    }
    logEvent(call.id, `pstn.${ev.status.toLowerCase()}`, { provider: adapter.name });
    audit(null, 'telephony.event', 'call', call.id, { status: ev.status });
    return { ok: true };
  });
}
