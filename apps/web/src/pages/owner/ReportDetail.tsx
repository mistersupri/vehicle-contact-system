import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Check, Phone, Smartphone, User } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import type { ReportDetail, ReportStatus } from '../../lib/types';
import { CAT_LABEL, STATUS_LABEL, cx, fmtDateTime, timeAgo } from '../../lib/utils';
import { Button, Confirm, ErrorNote, Field, PageLoader, Plate, Sheet, StatusBadge, Textarea } from '../../components/ui';
import { UrgentTag } from '../../components/ReportRow';

/** Detail laporan: dipakai sebagai halaman penuh (mobile) dan panel kanan (desktop). */
export function ReportPanel({ id, onBack }: { id: string; onBack?: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['report', id], queryFn: () => api<{ report: ReportDetail }>(`/reports/${id}`) });
  const h = useQuery({ queryKey: ['report-history', id], queryFn: () => api<{ history: { old_status: string | null; new_status: string; note: string | null; created_at: string; system: number }[] }>(`/reports/${id}/history`), enabled: !!q.data });
  const [note, setNote] = useState(''); const [photo, setPhoto] = useState<string | null>(null); const [block, setBlock] = useState(false); const [error, setError] = useState('');
  const refresh = () => { for (const k of [['report', id], ['report-history', id], ['reports'], ['summary']]) void qc.invalidateQueries({ queryKey: k }); };
  const setStatus = useMutation({ mutationFn: (status: ReportStatus) => api(`/reports/${id}/status`, { method: 'PATCH', body: { status, note: note || null } }), onSuccess: () => { setNote(''); setError(''); refresh(); }, onError: (e) => setError(errMsg(e)) });
  const blockM = useMutation({ mutationFn: () => api(`/reports/${id}/block-source`, { method: q.data?.report.source_blocked ? 'DELETE' : 'POST' }), onSuccess: () => { setBlock(false); refresh(); }, onError: (e) => { setError(errMsg(e)); setBlock(false); } });

  if (q.isLoading) return <PageLoader />;
  if (q.error) return <div className="p-4"><ErrorNote>{errMsg(q.error)}</ErrorNote></div>;
  const r = q.data!.report;
  const next: { s: ReportStatus; label: string } | null = r.status === 'NEW' || r.status === 'READ' ? { s: 'IN_PROGRESS', label: 'Tandai Proses' } : r.status === 'IN_PROGRESS' ? { s: 'RESOLVED', label: 'Tandai Selesai' } : null;

  return (
    <div className="pb-6 lg:pb-0">
      {onBack && <button onClick={onBack} className="flex items-center gap-2 px-4 py-4 text-[15px] font-semibold safe-top lg:hidden"><ArrowLeft className="h-5 w-5" />Laporan</button>}
      <div className="space-y-4 px-4 lg:px-0">
        <section className="hero rounded-3xl p-5">
          <div className="flex items-center justify-between"><span className="font-mono text-[11px] tracking-wider text-white/50">{r.reference}</span>
            <span className="flex items-center gap-2">{r.urgent && <UrgentTag />}<StatusBadge status={r.status} label={STATUS_LABEL[r.status]} /></span></div>
          <h2 className="mt-4 font-display text-[26px] font-bold leading-tight">{CAT_LABEL[r.category] ?? r.category}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2.5"><Plate value={r.plate_number} tone="dark" className="!text-[13px]" />{r.vehicle_name && <span className="text-sm text-white/70">{r.vehicle_name}</span>}<span className="text-sm text-white/55">{timeAgo(r.created_at)}</span></div>
        </section>

        <section className="card p-5"><h3 className="font-display text-[15px] font-bold">Pesan</h3><p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{r.message}</p></section>

        {r.attachments.length > 0 && <section className="card p-5"><h3 className="font-display text-[15px] font-bold">Foto ({r.attachments.length})</h3>
          <div className="mt-3 grid grid-cols-3 gap-2.5">{r.attachments.map((a) => <button key={a.id} onClick={() => setPhoto(a.id)} className="aspect-[4/3] overflow-hidden rounded-2xl bg-[#E4EAF3]"><img src={`/api/v1/attachments/${a.id}?thumb=1`} alt="Lampiran laporan" loading="lazy" className="h-full w-full object-cover transition hover:scale-105" /></button>)}</div></section>}

        <section className="card p-5"><h3 className="font-display text-[15px] font-bold">Pelapor</h3>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex items-center gap-3"><User className="h-4 w-4 text-muted" /><dt className="w-16 text-muted">Nama</dt><dd className="font-semibold">{r.reporter_name || <span className="font-normal text-muted">Anonim</span>}</dd></div>
            <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-muted" /><dt className="w-16 text-muted">Telepon</dt><dd className="font-semibold">{r.reporter_phone ? <a className="text-brand-deep underline-offset-2 hover:underline" href={`tel:${r.reporter_phone}`}>{r.reporter_phone}</a> : <span className="font-normal text-muted">Tidak dicantumkan</span>}</dd></div>
            <div className="flex items-center gap-3"><Smartphone className="h-4 w-4 text-muted" /><dt className="w-16 text-muted">Sumber</dt><dd className="font-semibold">{r.source_blocked ? <span className="text-coral-deep">Diblokir</span> : <span className="font-normal text-muted">Tidak diblokir</span>}</dd></div>
          </dl></section>

        {r.status !== 'ARCHIVED' && (
          <section className="card space-y-3 p-5"><Field label="Catatan tindak lanjut (opsional)"><Textarea className="!min-h-[72px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Mis. sudah dipindahkan pukul 10.15" /></Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex gap-3">
              {next && <Button className="flex-1" loading={setStatus.isPending && setStatus.variables === next.s} onClick={() => setStatus.mutate(next.s)}><Check className="h-4 w-4" />{next.label}</Button>}
              <Button variant="soft" className={cx(next ? 'flex-1' : 'w-full')} onClick={() => setBlock(true)}><Ban className="h-4 w-4" />{r.source_blocked ? 'Buka Blokir' : 'Blokir Sumber'}</Button>
            </div>
            <div className="flex gap-2">
              {r.status !== 'RESOLVED' && next?.s !== 'RESOLVED' && <Button variant="light" size="sm" onClick={() => setStatus.mutate('RESOLVED')}>Tandai selesai</Button>}
              <Button variant="light" size="sm" onClick={() => setStatus.mutate('ARCHIVED')}>Arsipkan</Button>
            </div></section>)}

        {h.data && h.data.history.length > 0 && <section className="card p-5"><h3 className="font-display text-[15px] font-bold">Riwayat status</h3>
          <ol className="mt-3 space-y-3">{h.data.history.map((x, i) => <li key={i} className="flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" /><div className="text-sm"><p className="font-bold">{STATUS_LABEL[x.new_status]}{x.old_status && <span className="font-normal text-muted"> ← {STATUS_LABEL[x.old_status]}</span>}</p><p className="text-xs text-muted">{fmtDateTime(x.created_at)}{x.system ? ' · sistem' : ''}</p>{x.note && <p className="mt-0.5 text-muted">“{x.note}”</p>}</div></li>)}</ol></section>}
      </div>
      <Sheet open={!!photo} onClose={() => setPhoto(null)} title="Foto laporan">{photo && <img src={`/api/v1/attachments/${photo}`} alt="Foto laporan" className="w-full rounded-3xl" />}</Sheet>
      <Confirm open={block} onClose={() => setBlock(false)} title={r.source_blocked ? 'Buka blokir?' : 'Blokir sumber ini?'} confirmLabel={r.source_blocked ? 'Buka blokir' : 'Blokir'} danger={!r.source_blocked} loading={blockM.isPending} onConfirm={() => blockM.mutate()}>
        {r.source_blocked ? 'Perangkat/jaringan ini akan dapat mengirim laporan dan menelepon kendaraan Anda kembali.' : 'Perangkat/jaringan yang mengirim laporan ini tidak akan bisa mengirim laporan atau menelepon kendaraan Anda lagi. Gunakan untuk spam atau pelecehan.'}</Confirm>
    </div>
  );
}
