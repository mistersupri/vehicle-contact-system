import clsx, { type ClassValue } from 'clsx';
export const cx = (...a: ClassValue[]) => clsx(a);

export function timeAgo(iso: string): string {
  const a = Math.abs(Math.round((new Date(iso).getTime() - Date.now()) / 1000));
  if (a < 45) return 'baru saja';
  if (a < 3600) return `${Math.max(1, Math.round(a / 60))}m lalu`;
  if (a < 86400) return `${Math.round(a / 3600)}j lalu`;
  if (a < 86400 * 7) return `${Math.round(a / 86400)}h lalu`;
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

export const STATUS_LABEL: Record<string, string> = { NEW: 'Baru', READ: 'Dibaca', IN_PROGRESS: 'Proses', RESOLVED: 'Selesai', ARCHIVED: 'Arsip' };
export const CALL_STATUS_LABEL: Record<string, string> = { RINGING: 'Berdering', ACCEPTED: 'Berlangsung', COMPLETED: 'Selesai', MISSED: 'Tak terjawab', REJECTED: 'Ditolak', FAILED: 'Gagal' };
export const CAT_LABEL: Record<string, string> = { PARKING: 'Parkir Menghalangi', ACCESS: 'Akses Terblokir', LIGHT: 'Lampu Menyala', EMERGENCY: 'Darurat', DAMAGE: 'Kerusakan', OTHER: 'Lainnya' };
/** Label pendek untuk tombol kategori pada formulir. */
export const CAT_SHORT: Record<string, string> = { PARKING: 'Parkir', ACCESS: 'Akses', LIGHT: 'Lampu', EMERGENCY: 'Darurat', DAMAGE: 'Kerusakan', OTHER: 'Lainnya' };
/** Titik warna kategori pada daftar laporan. */
export const CAT_DOT: Record<string, string> = { PARKING: 'bg-coral', ACCESS: 'bg-coral', LIGHT: 'bg-amber', EMERGENCY: 'bg-brand', DAMAGE: 'bg-mint-deep', OTHER: 'bg-muted' };
