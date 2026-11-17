const env = process.env;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

function secret(name: string, devValue: string): string {
  const v = env[name];
  if (v) return v;
  if (isProd) throw new Error(`Environment variable ${name} wajib diisi di production`);
  return devValue;
}
const num = (name: string, d: number) => (env[name] ? Number(env[name]) : d);

export const config = {
  port: num('PORT', 4000),
  host: env.HOST ?? '0.0.0.0',
  appUrl: (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  dataDir: env.DATA_DIR ?? new URL('../../../data', import.meta.url).pathname,
  dbFile: env.DB_FILE, // default: <dataDir>/vcs.db  (":memory:" untuk test)
  trustProxy: env.TRUST_PROXY === '1',

  sessionSecret: secret('SESSION_SECRET', 'dev-session-secret-change-me'),
  tokenHashSecret: secret('TOKEN_HASH_SECRET', 'dev-token-hash-secret-change-me'),
  encryptionKey: secret('ENCRYPTION_KEY', 'dev-encryption-key-change-me'),

  sessionTtlDays: num('SESSION_TTL_DAYS', 30),

  // WebRTC
  stunUrl: env.WEBRTC_STUN_URL ?? 'stun:stun.l.google.com:19302',
  turnUrl: env.WEBRTC_TURN_URL ?? '',
  turnSecret: env.WEBRTC_TURN_SECRET ?? '',

  // Notifikasi
  telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? '',
  telegramBotUsername: env.TELEGRAM_BOT_USERNAME ?? '',
  telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET ?? '',
  whatsappAccessToken: env.WHATSAPP_ACCESS_TOKEN ?? '',
  whatsappPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  whatsappVerifyToken: env.WHATSAPP_VERIFY_TOKEN ?? '',
  whatsappAppSecret: env.WHATSAPP_APP_SECRET ?? '',

  // Telephony (PSTN). "none" = nonaktif, "mock" = simulasi untuk pengembangan
  telephonyProvider: env.TELEPHONY_PROVIDER ?? 'none',
  telephonyWebhookSecret: env.TELEPHONY_WEBHOOK_SECRET ?? 'dev-telephony-secret',

  // Retry notifikasi (detik): segera, 1 menit, 5 menit, 15 menit
  retryScheduleSeconds: (env.RETRY_SCHEDULE ?? '0,60,300,900').split(',').map(Number),
  workerIntervalMs: num('WORKER_INTERVAL_MS', 2000),
};

export const LIMITS = {
  messageMax: 1000,
  photosMax: 3,
  photoBytesMax: 5 * 1024 * 1024,
  ringTimeoutSeconds: 45,
  maxCallSeconds: 600,
};
