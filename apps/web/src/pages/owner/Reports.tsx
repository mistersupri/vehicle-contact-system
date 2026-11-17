import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, SlidersHorizontal } from 'lucide-react';
import { api } from '../../lib/api';
import type { Report, Vehicle } from '../../lib/types';
import { CAT_LABEL } from '../../lib/utils';
import { Button, Empty, Input, PageHeader, PageLoader, Pills, Select } from '../../components/ui';
import { ReportRow } from '../../components/ReportRow';

const TABS = [{ value: '', label: 'Aktif' }, { value: 'NEW', label: 'Baru' }, { value: 'IN_PROGRESS', label: 'Diproses' }, { value: 'RESOLVED', label: 'Selesai' }, { value: 'ARCHIVED', label: 'Arsip' }];
const PER = 15;

export default function Reports() {
  const [status, setStatus] = useState(''); const [vehicle, setVehicle] = useState(''); const [category, setCategory] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [open, setOpen] = useState(false); const [page, setPage] = useState(1);
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: () => api<{ vehicles: Vehicle[] }>('/vehicles') });
  const p = new URLSearchParams({ limit: String(PER), page: String(page) });
  if (status) p.set('status', status); if (vehicle) p.set('vehicle_id', vehicle); if (category) p.set('category', category); if (from) p.set('from', from); if (to) p.set('to', to);
  const q = useQuery({ queryKey: ['reports', p.toString()], queryFn: () => api<{ reports: Report[]; total: number }>(`/reports?${p}`), placeholderData: (x) => x });
  const reset = (fn: () => void) => { fn(); setPage(1); };
  const filtered = !!(vehicle || category || from || to);

  return (
    <div>
      <PageHeader eyebrow="Pesan dari pemindai QR" title="Laporan" action={<Button variant="light" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}><SlidersHorizontal className="h-4 w-4" />Filter{filtered ? ' •' : ''}</Button>} />
      <Pills value={status} onChange={(v) => reset(() => setStatus(v))} options={TABS} />
      {open && (
        <div className="card mt-3 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className="label">Kendaraan</span><Select value={vehicle} onChange={(e) => reset(() => setVehicle(e.target.value))}><option value="">Semua</option>{vehicles.data?.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}</Select></label>
          <label><span className="label">Kategori</span><Select value={category} onChange={(e) => reset(() => setCategory(e.target.value))}><option value="">Semua</option>{Object.entries(CAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
          <label><span className="label">Dari tanggal</span><Input type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} /></label>
          <label><span className="label">Sampai</span><Input type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} /></label>
          {filtered && <Button variant="ghost" size="sm" className="sm:col-span-2 lg:col-span-4" onClick={() => { setVehicle(''); setCategory(''); setFrom(''); setTo(''); setPage(1); }}>Hapus filter</Button>}
        </div>)}
      <div className="mt-4 space-y-2.5">
        {q.isLoading ? <PageLoader /> : q.data!.reports.length === 0 ? <Empty icon={<FileText />} title="Tidak ada laporan">{filtered || status ? 'Coba ubah filter.' : 'Laporan dari pemindai QR kendaraan Anda akan muncul di sini.'}</Empty> : q.data!.reports.map((r) => <ReportRow key={r.id} r={r} />)}
      </div>
      {q.data && q.data.total > PER && (
        <div className="mt-6 flex items-center justify-between"><Button variant="light" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelumnya</Button><span className="text-sm text-muted">Halaman {page} dari {Math.ceil(q.data.total / PER)}</span><Button variant="light" size="sm" disabled={page * PER >= q.data.total} onClick={() => setPage(page + 1)}>Berikutnya</Button></div>)}
    </div>
  );
}
