import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.ts';

const file = config.dbFile ?? `${config.dataDir}/vcs.db`;
if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

type P = SQLInputValue[];
export const get = <T = any>(sql: string, ...p: P) => db.prepare(sql).get(...p) as T | undefined;
export const all = <T = any>(sql: string, ...p: P) => db.prepare(sql).all(...p) as T[];
export const run = (sql: string, ...p: P) => db.prepare(sql).run(...p);

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const now = () => new Date().toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', email_verified_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT, ip_hash TEXT, expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL, last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mfa_challenges (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), plate_number TEXT NOT NULL,
  vehicle_type TEXT NOT NULL, brand TEXT, model TEXT, color TEXT, owner_display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate_number);
CREATE TABLE IF NOT EXISTS qr_codes (
  id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), token_hash TEXT NOT NULL UNIQUE,
  token_encrypted TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, replaced_by_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_qr_vehicle ON qr_codes(vehicle_id);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, public_reference TEXT NOT NULL UNIQUE, vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  category TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'NEW',
  reporter_name TEXT, reporter_phone_encrypted TEXT, source_ip_hash TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_vehicle ON reports(vehicle_id, created_at);
CREATE TABLE IF NOT EXISTS report_attachments (
  id TEXT PRIMARY KEY, report_id TEXT REFERENCES reports(id), vehicle_id TEXT NOT NULL,
  storage_key TEXT NOT NULL, thumb_key TEXT NOT NULL, mime_type TEXT NOT NULL, file_size INTEGER NOT NULL,
  width INTEGER, height INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS report_status_histories (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id), old_status TEXT, new_status TEXT NOT NULL,
  changed_by_user_id TEXT, note TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS report_categories (
  code TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS blocked_sources (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_hash TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL,
  UNIQUE(user_id, source_hash)
);
CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), channel TEXT NOT NULL,
  destination_encrypted TEXT NOT NULL, provider_reference TEXT, verified INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, channel)
);
CREATE TABLE IF NOT EXISTS channel_link_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, channel TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  payload_encrypted TEXT, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, processed_at TEXT
);
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, report_id TEXT, call_id TEXT, channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, provider_message_id TEXT,
  last_error_code TEXT, next_attempt_at TEXT, idempotency_key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL,
  sent_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliveries_due ON notification_deliveries(status, next_attempt_at);
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY, public_reference TEXT NOT NULL UNIQUE, vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  owner_id TEXT NOT NULL REFERENCES users(id), call_type TEXT NOT NULL, status TEXT NOT NULL,
  caller_session_hash TEXT, started_at TEXT NOT NULL, answered_at TEXT, ended_at TEXT,
  duration_seconds INTEGER, end_reason TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calls_vehicle ON calls(vehicle_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_owner ON calls(owner_id, created_at);
CREATE TABLE IF NOT EXISTS call_events (
  id TEXT PRIMARY KEY, call_id TEXT NOT NULL REFERENCES calls(id), event_type TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS call_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id), webrtc_enabled INTEGER NOT NULL DEFAULT 1, pstn_enabled INTEGER NOT NULL DEFAULT 0,
  call_availability TEXT NOT NULL DEFAULT 'ONLINE', max_call_duration_seconds INTEGER NOT NULL DEFAULT 600,
  ring_timeout_seconds INTEGER NOT NULL DEFAULT 45, allow_anonymous_webrtc INTEGER NOT NULL DEFAULT 1,
  quiet_hours TEXT, owner_phone_encrypted TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telephony_sessions (
  id TEXT PRIMARY KEY, call_id TEXT NOT NULL REFERENCES calls(id), provider TEXT NOT NULL, provider_call_id TEXT,
  virtual_number TEXT, caller_leg_id TEXT, owner_leg_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id), role TEXT NOT NULL DEFAULT 'ADMIN',
  mfa_enabled INTEGER NOT NULL DEFAULT 0, totp_secret_encrypted TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE TABLE IF NOT EXISTS abuse_events (
  id TEXT PRIMARY KEY, vehicle_id TEXT, event_type TEXT NOT NULL, source_hash TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// Kategori bawaan (PRD 5.4)
const cats: [string, string, string][] = [
  ['PARKING', 'Menghalangi parkir', 'Kendaraan menghalangi tempat parkir'],
  ['ACCESS', 'Menghalangi akses', 'Kendaraan menghalangi jalan atau akses keluar-masuk'],
  ['LIGHT', 'Lampu menyala', 'Lampu kendaraan tertinggal menyala'],
  ['EMERGENCY', 'Darurat', 'Kondisi mendesak terkait kendaraan'],
  ['DAMAGE', 'Dugaan kerusakan', 'Informasi dugaan kerusakan atau insiden'],
  ['OTHER', 'Lainnya', 'Keperluan lain'],
];
cats.forEach(([code, label, desc], i) =>
  run('INSERT OR IGNORE INTO report_categories(code,label,description,active,sort) VALUES (?,?,?,1,?)', code, label, desc, i),
);

export const DEFAULT_SETTINGS = {
  report_rate_limit: 5, // laporan per kendaraan
  report_rate_window_minutes: 10,
  call_cooldown_seconds: 30,
  pstn_daily_limit_per_vehicle: 5,
  pstn_allowed_prefixes: '+62',
};
export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export function getSetting<K extends SettingKey>(key: K): (typeof DEFAULT_SETTINGS)[K] {
  const row = get<{ value: string }>('SELECT value FROM system_settings WHERE key=?', key);
  if (!row) return DEFAULT_SETTINGS[key];
  const d = DEFAULT_SETTINGS[key];
  return (typeof d === 'number' ? Number(row.value) : row.value) as any;
}
export function setSetting(key: SettingKey, value: string | number) {
  run('INSERT INTO system_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value));
}

export function audit(actor: string | null, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  run(
    'INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)',
    crypto.randomUUID(), actor, action, entityType, entityId, JSON.stringify(metadata), now(),
  );
}
