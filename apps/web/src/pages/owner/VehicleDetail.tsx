import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Car, Check, Copy, Download, FileImage, Pencil, Palette, Power, Printer, RefreshCw, Share2, Tag, Trash2, XCircle } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import type { Vehicle } from '../../lib/types';
import { Button, Confirm, ErrorNote, Notice, PageLoader, Plate, StatusBadge, VehicleTile } from '../../components/ui';
import { VSTATUS, VehicleForm, vehicleTitle } from './Vehicles';

export default function VehicleDetail() {
  const { id = '' } = useParams(); const nav = useNavigate(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['vehicle', id], queryFn: () => api<{ vehicle: Vehicle }>(`/vehicles/${id}`) });
  const [confirm, setConfirm] = useState<'regen' | 'revoke' | 'delete' | null>(null); const [edit, setEdit] = useState(false); const [copied, setCopied] = useState(false); const [ver, setVer] = useState(0); const [error, setError] = useState('');
  const inv = () => { for (const k of [['vehicle', id], ['vehicles'], ['summary']]) void qc.invalidateQueries({ queryKey: k }); };
  const act = useMutation({
    mutationFn: async (k: 'regen' | 'revoke' | 'delete' | 'toggle') => {
      if (k === 'regen') return api(`/vehicles/${id}/qr/regenerate`, { method: 'POST', body: {} });
      if (k === 'revoke') return api(`/vehicles/${id}/qr/revoke`, { method: 'POST', body: {} });
      if (k === 'delete') return api(`/vehicles/${id}`, { method: 'DELETE' });
      return api(`/vehicles/${id}/${q.data!.vehicle.status === 'ACTIVE' ? 'deactivate' : 'activate'}`, { method: 'POST', body: {} });
    },
    onSuccess: (_d, k) => { setConfirm(null); setVer((x) => x + 1); inv(); if (k === 'delete') nav('/app/vehicles', { replace: true }); },
    onError: (e) => { setError(errMsg(e)); setConfirm(null); },
  });
  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <div className="p-4"><ErrorNote>{errMsg(q.error)}</ErrorNote></div>;
  const v = q.data.vehicle; const active = v.status === 'ACTIVE';
  const share = async () => { if (!v.qr) return; try { if (navigator.share) await navigator.share({ title: `QR ${v.plate_number}`, url: v.qr.public_url }); else { await navigator.clipboard.writeText(v.qr.public_url); setCopied(true); setTimeout(() => setCopied(false), 1500); } } catch { /* dibatalkan */ } };
  const src = `/api/v1/vehicles/${v.id}/qr?format=svg&v=${ver}-${v.qr?.id ?? 'none'}`;
  const info = [{ i: Car, l: 'Jenis', x: v.vehicle_type }, { i: Tag, l: 'Merek', x: [v.brand, v.model].filter(Boolean).join(' ') || '—' }, { i: Palette, l: 'Warna', x: v.color || '—' }];

  return (
    <div className="pb-6">
      <section className="hero rounded-b-[32px] px-5 pb-7 safe-top lg:mb-5 lg:rounded-3xl lg:px-6 lg:pt-6">
        <div className="flex items-center justify-between"><Link to="/app/vehicles" aria-label="Kembali" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="font-display text-[17px] font-bold lg:hidden">Detail Kendaraan</span><button aria-label="Ubah kendaraan" onClick={() => setEdit(true)} className="grid h-10 w-10 place-items-center rounded-full text-white/70 hover:bg-white/10"><Pencil className="h-[18px] w-[18px]" /></button></div>
        <div className="mt-2 flex flex-col items-center text-center"><VehicleTile type={v.vehicle_type} size="lg" /><h1 className="mt-4 font-display text-[28px] font-bold leading-tight">{vehicleTitle(v)}</h1>
          <Plate value={v.plate_number} tone="dark" className="mt-3 !text-base" /><div className="mt-3"><span className={active ? 'inline-flex items-center gap-1.5 rounded-full bg-[#13B77D]/20 px-3 py-1 text-xs font-bold text-[#4ADE9F]' : 'inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/70'}><span className="h-1.5 w-1.5 rounded-full bg-current" />{VSTATUS[v.status]}</span></div></div>
      </section>

      <div className="mx-auto max-w-xl space-y-4 px-4 pt-4 lg:px-0 lg:pt-0">
        <div className="grid grid-cols-3 gap-3">{info.map((x) => <div key={x.l} className="card p-3.5"><x.i className="h-4 w-4 text-brand" /><p className="mt-2 text-xs text-muted">{x.l}</p><p className="mt-0.5 text-[14px] font-bold leading-tight">{x.x}</p></div>)}</div>
        <section className="card p-5">
          <h2 className="text-center font-display text-lg font-bold">QR Code</h2>
          {v.qr ? <>
            <div className="print-area"><div className="mx-auto mt-4 w-full max-w-[280px] rounded-3xl border border-line bg-[#F7F9FC] p-5 text-center">
              <img src={src} alt={`QR Code untuk ${v.plate_number}`} className="mx-auto aspect-square w-full" />
              <p className="mt-2 truncate text-xs text-muted">{v.qr.public_url.replace(/^https?:\/\//, '')}</p><Plate value={v.plate_number} className="mt-2" /></div></div>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <a href={`/api/v1/vehicles/${v.id}/qr?format=png&download=1`} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-brand-deep text-sm font-bold text-white"><Download className="h-4 w-4" />PNG</a>
              <a href={`/api/v1/vehicles/${v.id}/qr?format=svg&download=1`} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-line bg-white text-sm font-bold"><FileImage className="h-4 w-4 text-muted" />SVG</a>
              <button onClick={share} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-line bg-white text-sm font-bold">{copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4 text-muted" />}{copied ? 'Disalin' : 'Bagikan'}</button></div>
            <div className="mt-2.5 flex gap-2.5"><Button variant="ghost" size="sm" className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4" />Cetak stiker</Button>
              <Button variant="ghost" size="sm" className="flex-1" onClick={async () => { await navigator.clipboard?.writeText(v.qr!.public_url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy className="h-4 w-4" />Salin tautan</Button></div>
          </> : <div className="mt-4 text-center"><p className="text-muted">QR untuk kendaraan ini telah dicabut. Buat QR baru agar kendaraan dapat dihubungi kembali.</p><Button className="mt-4" loading={act.isPending} onClick={() => act.mutate('regen')}>Buat QR baru</Button></div>}
        </section>
        {v.qr && <><Notice tone="sky">Cetak pada bahan tahan air dan tempel di kaca/bodi. Jika QR tersalin atau disalahgunakan, ganti kapan saja — QR lama langsung tidak berlaku.</Notice>
          <div className="grid grid-cols-2 gap-3"><Button variant="light" size="lg" onClick={() => setConfirm('regen')}><RefreshCw className="h-4 w-4" />Ganti QR</Button><Button variant="soft" size="lg" onClick={() => setConfirm('revoke')}><XCircle className="h-4 w-4" />Cabut QR</Button></div></>}
        {error && <ErrorNote>{error}</ErrorNote>}
        <section className="card divide-y divide-line/70">
          <button onClick={() => act.mutate('toggle')} disabled={v.status === 'SUSPENDED'} className="flex w-full items-center gap-3 p-4 text-left disabled:opacity-50"><Power className="h-5 w-5 text-muted" /><span className="flex-1"><span className="block font-semibold">{active ? 'Nonaktifkan kendaraan' : 'Aktifkan kendaraan'}</span><span className="text-sm text-muted">{active ? 'Berhenti menerima laporan & panggilan' : 'Mulai menerima laporan & panggilan lagi'}</span></span><StatusBadge status={v.status} label={VSTATUS[v.status]} /></button>
          <button onClick={() => setConfirm('delete')} className="flex w-full items-center gap-3 p-4 text-left text-coral-deep"><Trash2 className="h-5 w-5" /><span className="font-semibold">Hapus kendaraan</span></button>
        </section>
      </div>

      <VehicleForm vehicle={edit ? v : null} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); inv(); }} />
      <Confirm open={confirm === 'regen'} onClose={() => setConfirm(null)} title="Ganti QR Code?" confirmLabel="Ganti QR" loading={act.isPending} onConfirm={() => act.mutate('regen')}>QR lama akan langsung tidak berlaku. Anda perlu mencetak dan menempel QR yang baru.</Confirm>
      <Confirm open={confirm === 'revoke'} onClose={() => setConfirm(null)} title="Cabut QR Code?" confirmLabel="Cabut" danger loading={act.isPending} onConfirm={() => act.mutate('revoke')}>Kendaraan tidak akan bisa dihubungi sampai Anda membuat QR baru.</Confirm>
      <Confirm open={confirm === 'delete'} onClose={() => setConfirm(null)} title="Hapus kendaraan?" confirmLabel="Hapus" danger loading={act.isPending} onConfirm={() => act.mutate('delete')}>QR akan dicabut dan kendaraan tidak lagi menerima laporan atau panggilan. Riwayat laporan lama tetap tersimpan.</Confirm>
    </div>
  );
}
