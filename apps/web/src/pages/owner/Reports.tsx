import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon, Inbox, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { Report, Vehicle } from '../../lib/types';
import { CAT_LABEL, STATUS_LABEL, cx, timeAgo } from '../../lib/utils';
import { useMedia } from '../../lib/useMedia';
import { Button, Empty, Input, PageLoader, Pills, Select, StatusBadge } from '../../components/ui';
import { CatDot, ReportRow, UrgentTag } from '../../components/ReportRow';
import { ReportPanel } from './ReportDetail';

const PER = 15;

/** Daftar laporan. Desktop: tabel + panel detail di kanan (master-detail). Mobile: daftar kartu → halaman detail. */
export default function Reports() {
  const { id } = useParams(); const nav = useNavigate(); const [sp, setSp] = useSearchParams();
  const desktop = useMedia('(min-width: 1024px)');
  const [status, setStatus] = useState(''); const [vehicle, setVehicle] = useState(''); const [category, setCategory] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [open, setOpen] = useState(false); const [page, setPage] = useState(1);
  const search = sp.get('q') ?? '';
  const sum = useQuery({ queryKey: ['summary'], queryFn: () => api<any>('/dashboard/summary') });
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: () => api<{ vehicles: Vehicle[] }>('/vehicles') });
  const p = new URLSearchParams({ limit: String(PER), page: String(page) });
  if (status) p.set('status', status); if (vehicle) p.set('vehicle_id', vehicle); if (category) p.set('category', category); if (from) p.set('from', from); if (to) p.set('to', to); if (search) p.set('q', search);
  const q = useQuery({ queryKey: ['reports', p.toString()], queryFn: () => api<{ reports: Report[]; total: number }>(`/reports?${p}`), placeholderData: (x) => x });
  const reset = (fn: () => void) => { fn(); setPage(1); };
  const filtered = !!(vehicle || category || from || to);
  const c = sum.data?.reports ?? {};
  const tabs = [{ value: '', label: 'Semua' }, { value: 'NEW', label: 'Baru', count: c.NEW }, { value: 'READ', label: 'Dibaca', count: c.READ }, { value: 'IN_PROGRESS', label: 'Proses', count: c.IN_PROGRESS }, { value: 'RESOLVED', label: 'Selesai' }, { value: 'ARCHIVED', label: 'Arsip' }];
  const list = q.data?.reports ?? [];
  const activeId = id ?? (desktop ? list[0]?.id : undefined);

  const filters = open && (
    <div className="card mt-3 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label><span className="label">Kendaraan</span><Select value={vehicle} onChange={(e) => reset(() => setVehicle(e.target.value))}><option value="">Semua</option>{vehicles.data?.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name ? `${v.name} · ` : ''}{v.plate_number}</option>)}</Select></label>
      <label><span className="label">Kategori</span><Select value={category} onChange={(e) => reset(() => setCategory(e.target.value))}><option value="">Semua</option>{Object.entries(CAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
      <label><span className="label">Dari tanggal</span><Input type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} /></label>
      <label><span className="label">Sampai</span><Input type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} /></label>
      {filtered && <Button variant="ghost" size="sm" className="sm:col-span-2 lg:col-span-4" onClick={() => { setVehicle(''); setCategory(''); setFrom(''); setTo(''); setPage(1); }}>Hapus filter</Button>}
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_430px] lg:items-start">
      <div className={cx('px-4 pt-5 lg:px-0 lg:pt-0', id && 'hidden lg:block')}>
        <div className="mb-4 flex items-center justify-between lg:hidden"><h1 className="font-display text-[30px] font-bold">Laporan</h1>
          <Button variant="light" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}><SlidersHorizontal className="h-4 w-4" />Filter{filtered ? ' •' : ''}</Button></div>
        {search && <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-deep">Pencarian: “{search}”<button aria-label="Hapus pencarian" onClick={() => { sp.delete('q'); setSp(sp); }}><X className="h-4 w-4" /></button></div>}

        <div className="card lg:p-0">
          <div className="hidden items-center justify-between gap-3 p-4 pb-2 lg:flex"><Pills value={status} onChange={(v) => reset(() => setStatus(v))} options={tabs} />
            <Button variant="light" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}><SlidersHorizontal className="h-4 w-4" />Filter{filtered ? ' •' : ''}</Button></div>
          {desktop && filters && <div className="px-4 pb-2">{filters}</div>}

          {/* desktop: tabel */}
          <div className="hidden lg:block">
            {q.isLoading ? <PageLoader /> : list.length === 0 ? <div className="p-6"><Empty icon={<Inbox />} title="Tidak ada laporan">{filtered || status || search ? 'Coba ubah filter.' : 'Laporan dari pemindai QR kendaraan Anda akan muncul di sini.'}</Empty></div> : (
              <table className="w-full text-left text-sm"><thead><tr className="border-b border-line/60 text-xs font-semibold text-muted"><th className="px-5 py-3.5">Kategori</th><th>Kendaraan</th><th>Waktu</th><th>Foto</th><th className="px-5">Status</th></tr></thead>
                <tbody>{list.map((r) => (
                  <tr key={r.id} onClick={() => nav(`/app/reports/${r.id}`)} className={cx('cursor-pointer border-b border-line/50 transition hover:bg-brand-soft/50', activeId === r.id && 'bg-brand-soft/60')}>
                    <td className="px-5 py-3.5"><span className="inline-flex items-center gap-2.5 font-semibold"><CatDot code={r.category} />{CAT_LABEL[r.category] ?? r.category}{r.urgent && <UrgentTag />}</span></td>
                    <td className="text-ink-3">{r.plate_number}</td><td className="text-muted">{timeAgo(r.created_at)}</td>
                    <td className="text-muted">{r.photo_count ? <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{r.photo_count}</span> : '—'}</td>
                    <td className="px-5"><StatusBadge status={r.status} label={STATUS_LABEL[r.status]} /></td></tr>))}</tbody></table>)}
          </div>
        </div>

        {/* mobile: pil + kartu */}
        <div className="lg:hidden"><Pills value={status} onChange={(v) => reset(() => setStatus(v))} options={tabs} />
          {!desktop && filters}
          <div className="mt-3 space-y-3">{q.isLoading ? <PageLoader /> : list.length === 0 ? <Empty icon={<Inbox />} title="Tidak ada laporan">{filtered || status || search ? 'Coba ubah filter.' : 'Laporan dari pemindai QR kendaraan Anda akan muncul di sini.'}</Empty> : list.map((r) => <ReportRow key={r.id} r={r} />)}</div></div>

        {q.data && q.data.total > PER && (
          <div className="mt-5 flex items-center justify-between"><Button variant="light" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelumnya</Button><span className="text-sm text-muted">Halaman {page} dari {Math.ceil(q.data.total / PER)}</span><Button variant="light" size="sm" disabled={page * PER >= q.data.total} onClick={() => setPage(page + 1)}>Berikutnya</Button></div>)}
      </div>

      <div className={cx('lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto', id ? '' : 'hidden lg:block')}>
        {activeId ? <ReportPanel key={activeId} id={activeId} onBack={() => nav('/app/reports')} /> : <div className="card hidden p-10 text-center text-muted lg:block">Pilih laporan untuk melihat detail.</div>}
      </div>
    </div>
  );
}
