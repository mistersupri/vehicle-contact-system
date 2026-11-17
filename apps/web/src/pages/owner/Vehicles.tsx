import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, Check, Copy, Download, Pencil, Plus, Power, Printer, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import type { Vehicle } from '../../lib/types';
import { Badge, Button, Confirm, Empty, ErrorNote, Field, Input, Notice, PageHeader, PageLoader, Plate, Select, Sheet, StatusBadge } from '../../components/ui';

const schema = z.object({
  plate_number: z.string().trim().min(2, 'Pelat nomor wajib diisi').max(30),
  vehicle_type: z.enum(['Mobil', 'Motor', 'Truk', 'Bus', 'Lainnya']),
  brand: z.string().max(100).optional(), model: z.string().max(100).optional(), color: z.string().max(50).optional(),
  owner_display_name: z.string().trim().min(2, 'Nama tampilan wajib diisi').max(150),
});
type FormV = z.infer<typeof schema>;
const VSTATUS: Record<string, string> = { ACTIVE: 'Aktif', INACTIVE: 'Nonaktif', SUSPENDED: 'Ditangguhkan' };

export default function Vehicles() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['vehicles'], queryFn: () => api<{ vehicles: Vehicle[] }>('/vehicles') });
  const [edit, setEdit] = useState<Vehicle | 'new' | null>(null); const [qr, setQr] = useState<string | null>(null);
  const [del, setDel] = useState<Vehicle | null>(null);
  const inv = () => { void qc.invalidateQueries({ queryKey: ['vehicles'] }); void qc.invalidateQueries({ queryKey: ['summary'] }); };
  const toggle = useMutation({ mutationFn: (v: Vehicle) => api(`/vehicles/${v.id}/${v.status === 'ACTIVE' ? 'deactivate' : 'activate'}`, { method: 'POST', body: {} }), onSuccess: inv });
  const remove = useMutation({ mutationFn: (v: Vehicle) => api(`/vehicles/${v.id}`, { method: 'DELETE' }), onSuccess: () => { setDel(null); inv(); } });
  const qrVehicle = q.data?.vehicles.find((v) => v.id === qr) ?? null;

  return (
    <div>
      <PageHeader eyebrow="Satu akun, banyak kendaraan" title="Kendaraan" action={<Button size="sm" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Tambah</Button>} />
      {q.isLoading ? <PageLoader /> : q.data!.vehicles.length === 0 ? <Empty icon={<Car />} title="Belum ada kendaraan" action={<Button size="lg" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Tambah kendaraan</Button>}>Tambahkan kendaraan pertama Anda untuk mendapatkan QR Code unik.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data!.vehicles.map((v) => (
            <article key={v.id} className={v.status === 'ACTIVE' ? 'card p-5' : 'card p-5 opacity-80'}>
              <div className="flex items-start justify-between gap-3"><Plate value={v.plate_number} className="!text-xl" /><StatusBadge status={v.status} label={VSTATUS[v.status]} /></div>
              <p className="mt-4 font-bold">{[v.brand, v.model].filter(Boolean).join(' ') || v.vehicle_type}</p>
              <p className="text-sm text-muted">{[v.vehicle_type, v.color].filter(Boolean).join(' · ')} · tampil sebagai “{v.owner_display_name}”</p>
              <div className="mt-3 flex gap-2 text-xs">{v.new_report_count > 0 ? <Badge tone="coral">{v.new_report_count} laporan baru</Badge> : <Badge>{v.report_count} laporan</Badge>}{!v.qr && <Badge tone="amber">QR dicabut</Badge>}</div>
              <div className="mt-5 grid grid-cols-[1fr_auto_auto_auto] gap-2">
                <Button variant="dark" size="sm" onClick={() => setQr(v.id)}><QrCode className="h-4 w-4" />QR Code</Button>
                <Button variant="light" size="sm" aria-label="Ubah kendaraan" onClick={() => setEdit(v)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="light" size="sm" aria-label={v.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'} title={v.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'} disabled={v.status === 'SUSPENDED'} loading={toggle.isPending && toggle.variables?.id === v.id} onClick={() => toggle.mutate(v)}><Power className="h-4 w-4" /></Button>
                <Button variant="light" size="sm" aria-label="Hapus kendaraan" onClick={() => setDel(v)}><Trash2 className="h-4 w-4 text-coral-deep" /></Button>
              </div>
            </article>))}
        </div>)}
      <VehicleForm key={typeof edit === 'object' && edit ? edit.id : edit ?? 'x'} vehicle={edit} onClose={() => setEdit(null)} onSaved={(v, created) => { inv(); setEdit(null); if (created) setQr(v.id); }} />
      <QrSheet vehicle={qrVehicle} onClose={() => setQr(null)} onChanged={inv} />
      <Confirm open={!!del} onClose={() => setDel(null)} title="Hapus kendaraan?" confirmLabel="Hapus" danger loading={remove.isPending} onConfirm={() => del && remove.mutate(del)}>QR akan dicabut dan kendaraan tidak lagi menerima laporan atau panggilan. Riwayat laporan lama tetap tersimpan.</Confirm>
    </div>
  );
}

function VehicleForm({ vehicle, onClose, onSaved }: { vehicle: Vehicle | 'new' | null; onClose: () => void; onSaved: (v: Vehicle, created: boolean) => void }) {
  const ed = vehicle && vehicle !== 'new' ? vehicle : null;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormV>({ resolver: zodResolver(schema), defaultValues: ed ? { plate_number: ed.plate_number, vehicle_type: ed.vehicle_type as any, brand: ed.brand ?? '', model: ed.model ?? '', color: ed.color ?? '', owner_display_name: ed.owner_display_name } : { vehicle_type: 'Mobil' } });
  const [error, setError] = useState('');
  return (
    <Sheet open={!!vehicle} onClose={onClose} title={ed ? 'Ubah kendaraan' : 'Tambah kendaraan'}>
      <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => { setError(''); try { const r = ed ? await api<{ vehicle: Vehicle }>(`/vehicles/${ed.id}`, { method: 'PATCH', body: v }) : await api<{ vehicle: Vehicle }>('/vehicles', { body: v }); onSaved(r.vehicle, !ed); } catch (e) { setError(errMsg(e)); } })}>
        <Field label="Pelat nomor" error={errors.plate_number?.message}><Input placeholder="B 1234 XYZ" className="uppercase" invalid={!!errors.plate_number} {...register('plate_number')} /></Field>
        <Field label="Jenis kendaraan"><Select {...register('vehicle_type')}>{['Mobil', 'Motor', 'Truk', 'Bus', 'Lainnya'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Merek"><Input placeholder="Toyota" {...register('brand')} /></Field><Field label="Model"><Input placeholder="Avanza" {...register('model')} /></Field></div>
        <Field label="Warna"><Input placeholder="Putih" {...register('color')} /></Field>
        <Field label="Nama yang ditampilkan ke publik" error={errors.owner_display_name?.message} hint="Cukup nama panggilan, mis. “Budi S.”. Jangan isi nomor telepon."><Input invalid={!!errors.owner_display_name} {...register('owner_display_name')} /></Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" block size="lg" loading={isSubmitting}>{ed ? 'Simpan perubahan' : 'Tambah & buat QR'}</Button>
      </form>
    </Sheet>
  );
}

function QrSheet({ vehicle: v, onClose, onChanged }: { vehicle: Vehicle | null; onClose: () => void; onChanged: () => void }) {
  const [confirm, setConfirm] = useState<'regen' | 'revoke' | null>(null); const [copied, setCopied] = useState(false); const [ver, setVer] = useState(0); const [error, setError] = useState('');
  const act = useMutation({ mutationFn: (k: 'regen' | 'revoke') => api(`/vehicles/${v!.id}/qr/${k === 'regen' ? 'regenerate' : 'revoke'}`, { method: 'POST', body: {} }), onSuccess: () => { setConfirm(null); setVer((x) => x + 1); onChanged(); }, onError: (e) => { setError(errMsg(e)); setConfirm(null); } });
  if (!v) return null;
  const src = `/api/v1/vehicles/${v.id}/qr?format=svg&v=${ver}-${v.qr?.id ?? 'none'}`;
  return (
    <Sheet open onClose={onClose} title="QR Code kendaraan">
      {v.qr ? <>
        <div className="print-area"><div className="mx-auto w-full max-w-[320px] rounded-4xl bg-white p-6 text-center shadow-card print:shadow-none">
          <p className="text-sm font-semibold text-muted">Pindai untuk menghubungi pemilik</p>
          <img src={src} alt={`QR Code untuk ${v.plate_number}`} className="mx-auto my-3 aspect-square w-full" />
          <Plate value={v.plate_number} className="!text-lg" /><p className="mt-3 text-xs text-muted">Tanpa aplikasi · Nomor pemilik dirahasiakan</p></div></div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <a href={`/api/v1/vehicles/${v.id}/qr?format=png&download=1`} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-white"><Download className="h-4 w-4" />PNG</a>
          <a href={`/api/v1/vehicles/${v.id}/qr?format=svg&download=1`} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-white"><Download className="h-4 w-4" />SVG</a>
          <Button variant="light" onClick={() => window.print()}><Printer className="h-4 w-4" />Cetak stiker</Button>
          <Button variant="light" onClick={() => { void navigator.clipboard?.writeText(v.qr!.public_url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Salin tautan</Button>
        </div>
        <a href={v.qr.public_url} target="_blank" rel="noreferrer" className="mt-4 block truncate rounded-2xl bg-white/70 px-4 py-3 text-center text-xs text-muted underline">{v.qr.public_url}</a>
        <div className="mt-5"><Notice tone="sky">Cetak pada bahan tahan air dan tempel di kaca depan/belakang atau bodi. Jika QR tersalin atau disalahgunakan, ganti kapan saja — QR lama langsung tidak berlaku.</Notice></div>
        <ErrorNote>{error}</ErrorNote>
        <div className="mt-4 flex gap-2.5"><Button variant="outline" block onClick={() => setConfirm('regen')}><RefreshCw className="h-4 w-4" />Ganti QR</Button><Button variant="outline" block onClick={() => setConfirm('revoke')}>Cabut QR</Button></div>
      </> : <div className="text-center"><p className="text-muted">QR untuk kendaraan ini telah dicabut. Buat QR baru agar kendaraan dapat dihubungi kembali.</p><Button className="mt-5" size="lg" loading={act.isPending} onClick={() => act.mutate('regen')}>Buat QR baru</Button></div>}
      <Confirm open={confirm === 'regen'} onClose={() => setConfirm(null)} title="Ganti QR Code?" confirmLabel="Ganti QR" loading={act.isPending} onConfirm={() => act.mutate('regen')}>QR lama akan langsung tidak berlaku. Anda perlu mencetak dan menempel QR yang baru.</Confirm>
      <Confirm open={confirm === 'revoke'} onClose={() => setConfirm(null)} title="Cabut QR Code?" confirmLabel="Cabut" danger loading={act.isPending} onConfirm={() => act.mutate('revoke')}>Kendaraan tidak akan bisa dihubungi sampai Anda membuat QR baru.</Confirm>
    </Sheet>
  );
}
