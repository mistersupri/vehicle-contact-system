import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, Inbox, Phone, Plus, QrCode, Pencil } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import type { Vehicle } from '../../lib/types';
import { cx } from '../../lib/utils';
import { Button, Empty, ErrorNote, Field, Input, PageLoader, Plate, Select, Sheet, StatusBadge, VehicleTile } from '../../components/ui';

export const vehicleSchema = z.object({
  name: z.string().max(100).optional(),
  plate_number: z.string().trim().min(2, 'Pelat nomor wajib diisi').max(30),
  vehicle_type: z.enum(['Mobil', 'Motor', 'Truk', 'Bus', 'Lainnya']),
  brand: z.string().max(100).optional(), model: z.string().max(100).optional(), color: z.string().max(50).optional(),
  owner_display_name: z.string().trim().min(2, 'Nama tampilan wajib diisi').max(150),
});
type FormV = z.infer<typeof vehicleSchema>;
export const VSTATUS: Record<string, string> = { ACTIVE: 'Aktif', INACTIVE: 'Nonaktif', SUSPENDED: 'Ditangguhkan' };
export const vehicleTitle = (v: Vehicle) => v.name || [v.brand, v.model].filter(Boolean).join(' ') || v.vehicle_type;

export default function Vehicles() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['vehicles'], queryFn: () => api<{ vehicles: Vehicle[] }>('/vehicles') });
  const [edit, setEdit] = useState<Vehicle | 'new' | null>(null);
  const inv = () => { void qc.invalidateQueries({ queryKey: ['vehicles'] }); void qc.invalidateQueries({ queryKey: ['summary'] }); };
  const add = <Button className="shrink-0" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Tambah<span className="hidden lg:inline"> Kendaraan</span></Button>;
  const vs = q.data?.vehicles ?? [];

  return (
    <div className="px-4 pt-5 lg:px-0 lg:pt-0">
      <div className="mb-5 flex items-center justify-between"><h1 className="font-display text-[30px] font-bold lg:hidden">Kendaraan</h1><div className="lg:ml-auto">{add}</div></div>
      {q.isLoading ? <PageLoader /> : vs.length === 0 ? <Empty icon={<Car />} title="Belum ada kendaraan" action={<Button size="lg" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Tambah kendaraan</Button>}>Tambahkan kendaraan pertama Anda untuk mendapatkan QR Code unik.</Empty> : (<>
        {/* mobile: daftar */}
        <div className="space-y-3 lg:hidden">
          {vs.map((v) => (
            <article key={v.id} className={cx('overflow-hidden rounded-3xl border border-line/70 shadow-card', v.status === 'ACTIVE' ? 'bg-white' : 'bg-white opacity-90')}>
              <Link to={`/app/vehicles/${v.id}`} className={cx('flex items-center gap-3.5 p-4', v.status === 'ACTIVE' ? 'bg-gradient-to-r from-brand-soft to-white' : 'bg-[#F1F4F9]')}>
                <VehicleTile type={v.vehicle_type} tone={v.status === 'ACTIVE' ? 'brand' : 'muted'} />
                <div className="min-w-0 flex-1"><p className="truncate font-display text-[17px] font-bold">{vehicleTitle(v)}</p><p className="truncate text-sm text-muted">{[v.brand && v.model ? `${v.brand} ${v.model}` : v.brand || v.model, v.color].filter(Boolean).join(' · ') || v.vehicle_type}</p></div>
                <StatusBadge status={v.status} label={VSTATUS[v.status]} />
              </Link>
              <div className="flex items-center gap-2 px-4 py-3"><Plate value={v.plate_number} /><span className="flex-1" />
                <Link to={`/app/vehicles/${v.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-deep px-3.5 text-[13px] font-bold text-white"><QrCode className="h-4 w-4" />QR</Link>
                <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#F1F4F9] px-3 text-[13px] font-bold text-ink-3"><Inbox className="h-4 w-4 text-muted" />{v.report_count}</span></div>
            </article>))}
        </div>
        {/* desktop: grid kartu */}
        <div className="hidden gap-5 lg:grid lg:grid-cols-3">
          {vs.map((v) => (
            <article key={v.id} className="card overflow-hidden">
              <div className={cx('flex flex-col items-center px-6 pb-6 pt-7 text-center', v.status === 'ACTIVE' ? 'hero' : 'bg-[#F1F4F9] text-ink')}>
                <VehicleTile type={v.vehicle_type} size="lg" tone={v.status === 'ACTIVE' ? 'dark' : 'muted'} />
                <h2 className="mt-4 font-display text-xl font-bold">{vehicleTitle(v)}</h2>
                <Plate value={v.plate_number} tone={v.status === 'ACTIVE' ? 'dark' : 'light'} className="mt-3" />
                <span className={cx('mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', v.status === 'ACTIVE' ? 'bg-[#13B77D]/20 text-[#4ADE9F]' : 'bg-[#E4EAF3] text-muted')}><span className="h-1.5 w-1.5 rounded-full bg-current" />{VSTATUS[v.status]}</span>
              </div>
              <div className="p-5">
                <dl className="grid grid-cols-3 gap-3 text-sm">{[['Jenis', v.vehicle_type], ['Merek', [v.brand, v.model].filter(Boolean).join(' ') || '—'], ['Warna', v.color || '—']].map(([l, x]) => <div key={l}><dt className="text-xs text-muted">{l}</dt><dd className="font-semibold">{x}</dd></div>)}</dl>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <span className="flex items-center gap-2 rounded-xl bg-[#F4F7FB] px-3 py-2.5 text-sm font-semibold"><Inbox className="h-4 w-4 text-brand" />{v.report_count} laporan</span>
                  <span className="flex items-center gap-2 rounded-xl bg-[#F4F7FB] px-3 py-2.5 text-sm font-semibold"><Phone className="h-4 w-4 text-amber" />{v.call_count} panggilan</span></div>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <Link to={`/app/vehicles/${v.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-deep text-sm font-bold text-white"><QrCode className="h-4 w-4" />Lihat QR</Link>
                  <Button variant="light" onClick={() => setEdit(v)}><Pencil className="h-4 w-4" />Edit</Button></div>
              </div>
            </article>))}
        </div>
      </>)}
      <VehicleForm key={typeof edit === 'object' && edit ? edit.id : edit ?? 'x'} vehicle={edit} onClose={() => setEdit(null)} onSaved={() => { inv(); setEdit(null); }} />
    </div>
  );
}

export function VehicleForm({ vehicle, onClose, onSaved }: { vehicle: Vehicle | 'new' | null; onClose: () => void; onSaved: (v: Vehicle, created: boolean) => void }) {
  const ed = vehicle && vehicle !== 'new' ? vehicle : null;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormV>({ resolver: zodResolver(vehicleSchema), defaultValues: ed ? { name: ed.name ?? '', plate_number: ed.plate_number, vehicle_type: ed.vehicle_type as any, brand: ed.brand ?? '', model: ed.model ?? '', color: ed.color ?? '', owner_display_name: ed.owner_display_name } : { vehicle_type: 'Mobil' } });
  const [error, setError] = useState('');
  return (
    <Sheet open={!!vehicle} onClose={onClose} title={ed ? 'Ubah kendaraan' : 'Tambah kendaraan'}>
      <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => { setError(''); try { const r = ed ? await api<{ vehicle: Vehicle }>(`/vehicles/${ed.id}`, { method: 'PATCH', body: v }) : await api<{ vehicle: Vehicle }>('/vehicles', { body: v }); onSaved(r.vehicle, !ed); } catch (e) { setError(errMsg(e)); } })}>
        <Field label="Nama kendaraan" hint="Hanya terlihat oleh Anda, mis. “Mobil Harian”."><Input placeholder="Mobil Harian" {...register('name')} /></Field>
        <Field label="Pelat nomor" error={errors.plate_number?.message}><Input placeholder="B 1234 ABC" className="uppercase" invalid={!!errors.plate_number} {...register('plate_number')} /></Field>
        <Field label="Jenis kendaraan"><Select {...register('vehicle_type')}>{['Mobil', 'Motor', 'Truk', 'Bus', 'Lainnya'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Merek"><Input placeholder="Toyota" {...register('brand')} /></Field><Field label="Model"><Input placeholder="Avanza" {...register('model')} /></Field></div>
        <Field label="Warna"><Input placeholder="Putih" {...register('color')} /></Field>
        <Field label="Nama yang ditampilkan ke publik" error={errors.owner_display_name?.message} hint="Judul halaman publik, mis. “Mobil Andri”. Jangan isi nomor telepon."><Input invalid={!!errors.owner_display_name} {...register('owner_display_name')} /></Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" block size="lg" loading={isSubmitting}>{ed ? 'Simpan perubahan' : 'Tambah & buat QR'}</Button>
      </form>
    </Sheet>
  );
}
