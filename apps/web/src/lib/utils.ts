import clsx, { type ClassValue } from 'clsx';
export const cx = (...a: ClassValue[]) => clsx(a);

const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
export function timeAgo(iso: string): string {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const a = Math.abs(s);
  if (a < 45) return 'baru saja';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return fmtDate(iso);
}
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDuration = (sec: number | null | undefined) => {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
export const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');

export const STATUS_LABEL: Record<string, string> = { NEW: 'Baru', READ: 'Dibaca', IN_PROGRESS: 'Diproses', RESOLVED: 'Selesai', ARCHIVED: 'Arsip' };
export const CALL_STATUS_LABEL: Record<string, string> = { RINGING: 'Berdering', ACCEPTED: 'Berlangsung', COMPLETED: 'Selesai', MISSED: 'Tak terjawab', REJECTED: 'Ditolak', FAILED: 'Gagal' };
export const CAT_LABEL: Record<string, string> = { PARKING: 'Menghalangi parkir', ACCESS: 'Menghalangi akses', LIGHT: 'Lampu menyala', EMERGENCY: 'Darurat', DAMAGE: 'Dugaan kerusakan', OTHER: 'Lainnya' };
