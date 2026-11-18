import { Link } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
import type { Report } from '../lib/types';
import { CAT_DOT, CAT_LABEL, STATUS_LABEL, cx, timeAgo } from '../lib/utils';
import { StatusBadge } from './ui';

export const CatDot = ({ code, className }: { code: string; className?: string }) => <span className={cx('h-2 w-2 shrink-0 rounded-full', CAT_DOT[code] ?? 'bg-muted', className)} aria-hidden />;
export const UrgentTag = () => <span className="rounded-md bg-coral px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Mendesak</span>;

/** Kartu laporan (mobile): titik kategori, status, cuplikan pesan, pelat · waktu, jumlah foto. */
export function ReportRow({ r, to }: { r: Report; to?: string }) {
  return (
    <Link to={to ?? `/app/reports/${r.id}`} className="block rounded-3xl border border-line/70 bg-white p-4 shadow-card transition active:scale-[.99]">
      <div className="flex items-center gap-2.5">
        <CatDot code={r.category} className="h-2.5 w-2.5" />
        <span className="font-display text-[16px] font-bold">{CAT_LABEL[r.category] ?? r.category}</span>
        {r.urgent && <UrgentTag />}
        <span className="ml-auto"><StatusBadge status={r.status} label={STATUS_LABEL[r.status]} /></span>
      </div>
      <p className="mt-2 line-clamp-2 text-[14px] leading-snug text-muted">{r.message}</p>
      <div className="mt-3 flex items-center text-xs text-muted">
        <span>{r.plate_number}</span><span className="mx-1.5">·</span><span className={r.status === 'NEW' ? 'font-semibold text-ink-3' : ''}>{timeAgo(r.created_at)}</span>
        {r.photo_count > 0 && <span className="ml-auto inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{r.photo_count} foto</span>}
      </div>
    </Link>
  );
}
