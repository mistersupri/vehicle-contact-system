import { Link } from 'react-router-dom';
import { Camera, ChevronRight, DoorClosed, Lightbulb, MessageCircle, ParkingCircle, Siren, CarFront } from 'lucide-react';
import type { Report } from '../lib/types';
import { CAT_LABEL, cx, STATUS_LABEL, timeAgo } from '../lib/utils';
import { StatusBadge } from './ui';

export const CAT_ICON: Record<string, typeof Siren> = { PARKING: ParkingCircle, ACCESS: DoorClosed, LIGHT: Lightbulb, EMERGENCY: Siren, DAMAGE: CarFront, OTHER: MessageCircle };

/** Laporan baru memakai kartu mint seperti pada referensi; yang lain putih. */
export function ReportRow({ r }: { r: Report }) {
  const I = CAT_ICON[r.category] ?? MessageCircle; const isNew = r.status === 'NEW';
  return (
    <Link to={`/app/reports/${r.id}`} className={cx('group flex items-center gap-4 rounded-3xl p-4 transition hover:-translate-y-0.5', isNew ? 'bg-mint' : 'bg-white shadow-card')}>
      <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-full', isNew ? 'bg-white/70' : 'bg-paper', r.category === 'EMERGENCY' && 'text-coral-deep')}><I className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-bold">{CAT_LABEL[r.category] ?? r.category}</span><span className="rounded-md bg-ink/8 px-1.5 py-0.5 text-xs font-bold tracking-wide">{r.plate_number}</span></div>
        <p className={cx('mt-0.5 truncate text-sm', isNew ? 'text-ink/70' : 'text-muted')}>{r.message}</p>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted"><span className={isNew ? 'font-bold text-coral-deep' : ''}>{timeAgo(r.created_at)}</span>{r.photo_count > 0 && <span className="inline-flex items-center gap-1"><Camera className="h-3.5 w-3.5" />{r.photo_count}</span>}</div>
      </div>
      <div className="flex flex-col items-end gap-2"><StatusBadge status={r.status} label={STATUS_LABEL[r.status]} /><ChevronRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5" /></div>
    </Link>
  );
}
