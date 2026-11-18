import { all, get, now, run, tx } from '../db.ts';
import { config } from '../config.ts';
import { decrypt } from './security.ts';
import { uuid } from './security.ts';
import { senders, SendError } from './providers.ts';

/** Transactional outbox: dipanggil di dalam transaksi yang sama dengan penyimpanan laporan. */
export function enqueue(eventType: string, payload: Record<string, unknown>) {
  run('INSERT INTO outbox(id,event_type,payload,created_at) VALUES (?,?,?,?)', uuid(), eventType, JSON.stringify(payload), now());
}

const CATEGORY: Record<string, string> = {};
export function composeText(kind: string, p: any): string {
  if (kind === 'report.created') {
    return [
      p.urgent ? '🚨 NOTIFIKASI MENDESAK — seseorang meminta Anda segera ke kendaraan' : '🚗 Laporan baru untuk kendaraan Anda',
      `Kendaraan: ${p.vehicle_name ? `${p.vehicle_name} · ` : ''}${p.plate}`,
      `Kategori: ${p.category_label}`,
      `Pesan: ${p.message.length > 300 ? p.message.slice(0, 300) + '…' : p.message}`,
      `Waktu: ${new Date(p.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })} WIB`,
      `Referensi: ${p.reference}`,
      `Detail (perlu login): ${config.appUrl}/app/reports/${p.report_id}`,
    ].join('\n');
  }
  if (kind === 'call.missed') {
    return `📞 Panggilan tak terjawab untuk ${p.plate ?? 'kendaraan Anda'}\nBuka dashboard: ${config.appUrl}/app/calls`;
  }
  if (kind === 'test') return '✅ Tes notifikasi Vehicle Contact System berhasil.';
  return String(p.text ?? '');
}

/** Ubah event outbox menjadi delivery per kanal aktif & terverifikasi (idempoten). */
function fanOut() {
  for (const ev of all<any>('SELECT * FROM outbox WHERE processed_at IS NULL ORDER BY created_at LIMIT 50')) {
    const p = JSON.parse(ev.payload);
    const ownerId: string | null = p.owner_id ?? null;
    tx(() => {
      if (ownerId) {
        for (const ch of all<any>('SELECT * FROM notification_channels WHERE user_id=? AND enabled=1 AND verified=1', ownerId)) {
          run(`INSERT OR IGNORE INTO notification_deliveries(id,user_id,report_id,call_id,channel,status,attempts,next_attempt_at,idempotency_key,payload,created_at,updated_at)
               VALUES (?,?,?,?,?,'PENDING',0,?,?,?,?,?)`,
            uuid(), ownerId, p.report_id ?? null, p.call_id ?? null, ch.channel, now(), `${ev.id}:${ch.channel}`, JSON.stringify({ kind: ev.event_type, ...p }), now(), now());
        }
      }
      run('UPDATE outbox SET processed_at=? WHERE id=?', now(), ev.id);
    });
  }
}

async function deliverDue() {
  const due = all<any>(`SELECT * FROM notification_deliveries WHERE status IN ('PENDING','RETRY_SCHEDULED') AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT 20`, now());
  for (const d of due) {
    // klaim atomik agar tidak terkirim ganda oleh worker lain
    const claim = run("UPDATE notification_deliveries SET status='PROCESSING', updated_at=? WHERE id=? AND status IN ('PENDING','RETRY_SCHEDULED')", now(), d.id);
    if (!claim.changes) continue;
    const ch = get<any>('SELECT * FROM notification_channels WHERE user_id=? AND channel=?', d.user_id, d.channel);
    const sender = senders[d.channel];
    try {
      if (!ch || !sender) throw new SendError('CHANNEL_MISSING', true);
      const id = await sender.send(decrypt(ch.destination_encrypted), composeText(JSON.parse(d.payload).kind, JSON.parse(d.payload)));
      run("UPDATE notification_deliveries SET status='SENT', attempts=attempts+1, provider_message_id=?, sent_at=?, last_error_code=NULL, updated_at=? WHERE id=?", id, now(), now(), d.id);
    } catch (e: any) {
      const attempts = d.attempts + 1;
      const code = e instanceof SendError ? e.code : 'SEND_FAILED';
      const permanent = e instanceof SendError && e.permanent;
      const wait = config.retryScheduleSeconds[attempts]; // [0] = percobaan pertama
      if (permanent || wait === undefined) {
        run("UPDATE notification_deliveries SET status='FAILED', attempts=?, last_error_code=?, updated_at=? WHERE id=?", attempts, code, now(), d.id);
      } else {
        const jitter = Math.floor(Math.random() * Math.min(wait, 10));
        run("UPDATE notification_deliveries SET status='RETRY_SCHEDULED', attempts=?, last_error_code=?, next_attempt_at=?, updated_at=? WHERE id=?",
          attempts, code, new Date(Date.now() + (wait + jitter) * 1000).toISOString(), now(), d.id);
      }
    }
  }
}

let busy = false;
export async function tick() {
  if (busy) return; busy = true;
  try { fanOut(); await deliverDue(); } catch (e) { console.error('[worker]', e); } finally { busy = false; }
}
export function startWorker() {
  // pulihkan job yang menggantung di PROCESSING setelah crash
  run("UPDATE notification_deliveries SET status='RETRY_SCHEDULED', next_attempt_at=? WHERE status='PROCESSING'", now());
  const t = setInterval(tick, config.workerIntervalMs);
  t.unref();
  return () => clearInterval(t);
}
void CATEGORY;
