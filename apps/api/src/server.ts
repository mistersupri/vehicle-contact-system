import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import fstatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { config, isProd, isTest } from './config.ts';
import { AppError, zodToApp } from './lib/http.ts';
import { get } from './db.ts';
import authRoutes from './routes/auth.ts';
import vehicleRoutes from './routes/vehicles.ts';
import publicRoutes from './routes/public.ts';
import reportRoutes from './routes/reports.ts';
import notificationRoutes from './routes/notifications.ts';
import callRoutes from './routes/calls.ts';
import adminRoutes from './routes/admin.ts';
import webhookRoutes from './routes/webhooks.ts';

export async function buildApp() {
  const app = Fastify({
    logger: isTest ? false : { level: isProd ? 'info' : 'warn', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    trustProxy: config.trustProxy, genReqId: () => crypto.randomUUID(), bodyLimit: 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute', allowList: isTest ? ['127.0.0.1'] : [] });
  await app.register(multipart);
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-content-type-options', 'nosniff').header('referrer-policy', 'no-referrer').header('x-frame-options', 'DENY');
    reply.header('x-request-id', req.id);
  });

  // Perlindungan CSRF: cookie SameSite=Lax + header kustom wajib untuk request yang mengubah data
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.url.startsWith('/api/v1/webhooks/')) return;
    if (req.headers['x-requested-with'] !== 'vcs') throw new AppError(403, 'CSRF', 'Permintaan tidak valid');
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof ZodError) err = zodToApp(err);
    if (err instanceof AppError) return reply.status(err.status).send({ error: { code: err.code, message: err.message, request_id: req.id, ...err.extra } });
    if (err.statusCode === 429) return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.', request_id: req.id } });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.status(400).send({ error: { code: 'FILE_TOO_LARGE', message: 'Ukuran foto maksimal 5 MB', request_id: req.id } });
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: { code: 'BAD_REQUEST', message: 'Permintaan tidak valid', request_id: req.id } });
    req.log.error({ err: { message: err.message, stack: err.stack }, request_id: req.id });
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Terjadi kesalahan pada server', request_id: req.id } });
  });
  await app.register(async (api) => {
    api.get('/health', async () => { get('SELECT 1'); return { status: 'ok', time: new Date().toISOString() }; });
    await api.register(authRoutes);
    await api.register(vehicleRoutes);
    await api.register(publicRoutes);
    await api.register(reportRoutes);
    await api.register(notificationRoutes);
    await api.register(callRoutes);
    await api.register(adminRoutes);
    await api.register(webhookRoutes);
  }, { prefix: '/api/v1' });

  // Hasil build frontend (SPA fallback) bila tersedia; satu-satunya handler "not found"
  const dist = resolve(import.meta.dirname, '../../web/dist');
  const hasWeb = existsSync(dist);
  if (hasWeb) await app.register(fstatic, { root: dist, wildcard: false, setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('index.html')) res.setHeader('cache-control', 'no-cache'); } });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || !hasWeb || req.method !== 'GET')
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan', request_id: req.id } });
    return reply.header('cache-control', 'no-cache').sendFile('index.html');
  });
  return app;
}
