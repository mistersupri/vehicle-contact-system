import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon, ArrowLeft, Ban, Check, Clock, Hammer, Phone, User } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import type { ReportDetail, ReportStatus } from '../../lib/types';
import { CAT_LABEL, fmtDateTime, STATUS_LABEL } from '../../lib/utils';
import { Button, Confirm, ErrorNote, Field, PageLoader, Plate, Sheet, StatusBadge, Textarea } from '../../components/ui';

export default function ReportDetailPage() {
  const { id } = useParams(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['report', id], queryFn: () => api<{ report: ReportDetail }>(`/reports/${id}`) });
  const h = useQuery({ queryKey: ['report-history', id], queryFn: () => api<{ history: { old_status: string | null; new_status: string; note: string | null; created_at: string; system: number }[] }>(`/reports/${id}/history`), enabled: !!q.data });
  const [note, setNote] = useState(''); const [photo, setPhoto] = useState<string | null>(null); const [block, setBlock] = useState(false); const [error, setError] = useState('');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['report', id] }); void qc.invalidateQueries({ queryKey: ['report-history', id] }); void qc.invalidateQueries({ queryKey: ['reports'] }); void qc.invalidateQueries({ queryKey: ['summary'] }); };
  const setStatus = useMutation({ mutationFn: (status: ReportStatus) => api(`/reports/${id}/status`, { method: 'PATCH', body: { status, note: note || null } }), onSuccess: () => { setNote(''); setError(''); refresh(); }, onError: (e) => setError(errMsg(e)) });
  const blockM = useMutation({ mutationFn: () => api(`/reports/${id}/block-source`, { method: q.data?.report.source_blocked ? 'DELETE' : 'POST' }), onSuccess: () => { setBlock(false); refresh(); }, onError: (e) => { setError(errMsg(e)); setBlock(false); } });

  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorNote>{errMsg(q.error)}</ErrorNote>;
  const r = q.data!.report;
  const actions: { s: ReportStatus; label: string; icon: any; variant: any }[] = [
    { s: 'IN_PROGRESS', label: 'Sedang ditangani', icon: Hammer, variant: 'light' }, { s: 'RESOLVED', label: 'Tandai selesai', icon: Check, variant: 'dark' }, { s: 'ARCHIVED', label: 'Arsipkan', icon: ArchiveIcon, variant: 'light' },
  ];
  return (
    <div className="space-y-4">
      <Link to="/app/reports" className="inline-flex items-center gap-1.5 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />Laporan</Link>
      <div className="card-dark p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge status={r.status} label={STATUS_LABEL[r.status]} /><span className="font-mono text-xs text-white/50">{r.reference}</span></div>
        <h1 className="mt-5 text-3xl font-semibold sm:text-4xl">{CAT_LABEL[r.category] ?? r.category}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Plate value={r.plate_number} className="!text-base" /><span className="inline-flex items-center gap-1.5 text-sm text-white/60"><Clock className="h-4 w-4" />{fmtDateTime(r.created_at)}</span></div>
      </div>
      <div className="card p-6"><h2 className="eyebrow">Pesan</h2><p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed">{r.message}</p></div>

      {r.attachments.length > 0 && <div className="card p-6"><h2 className="eyebrow">Foto ({r.attachments.length})</h2>
        <div className="mt-3 grid grid-cols-3 gap-2.5">{r.attachments.map((a) => <button key={a.id} onClick={() => setPhoto(a.id)} className="aspect-square overflow-hidden rounded-2xl bg-paper"><img src={`/api/v1/attachments/${a.id}?thumb=1`} alt="Lampiran laporan" loading="lazy" className="h-full w-full object-cover transition hover:scale-105" /></button>)}</div></div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-6"><h2 className="eyebrow">Pelapor</h2>
          <p className="mt-3 flex items-center gap-2.5 font-semibold"><User className="h-4 w-4 text-muted" />{r.reporter_name || <span className="font-normal text-muted">Anonim</span>}</p>
          <p className="mt-2 flex items-center gap-2.5 font-semibold"><Phone className="h-4 w-4 text-muted" />{r.reporter_phone ? <a className="underline" href={`tel:${r.reporter_phone}`}>{r.reporter_phone}</a> : <span className="font-normal text-muted">Tidak dicantumkan</span>}</p>
          <Button variant={r.source_blocked ? 'light' : 'outline'} size="sm" className="mt-5" onClick={() => setBlock(true)}><Ban className="h-4 w-4" />{r.source_blocked ? 'Buka blokir sumber' : 'Blokir sumber ini'}</Button></div>
        <div className="card p-6"><h2 className="eyebrow">Riwayat status</h2>
          <ol className="mt-3 space-y-3">{h.data?.history.map((x, i) => <li key={i} className="flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-ink" /><div className="text-sm"><p className="font-bold">{STATUS_LABEL[x.new_status]}{x.old_status && <span className="font-normal text-muted"> ← {STATUS_LABEL[x.old_status]}</span>}</p><p className="text-xs text-muted">{fmtDateTime(x.created_at)}{x.system ? ' · sistem' : ''}</p>{x.note && <p className="mt-0.5 text-muted">“{x.note}”</p>}</div></li>)}</ol></div>
      </div>

      {r.status !== 'ARCHIVED' && (
        <div className="card-mint p-6"><h2 className="font-bold">Tindak lanjut</h2>
          <Field label="Catatan (opsional)"><Textarea className="!min-h-[72px] !bg-white/70" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Mis. sudah dipindahkan pukul 10.15" /></Field>
          <div className="mt-4 flex flex-wrap gap-2.5">{actions.filter((a) => a.s !== r.status).map((a) => <Button key={a.s} variant={a.variant} loading={setStatus.isPending && setStatus.variables === a.s} onClick={() => setStatus.mutate(a.s)}><a.icon className="h-4 w-4" />{a.label}</Button>)}</div>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}</div>)}
      <Sheet open={!!photo} onClose={() => setPhoto(null)} title="Foto laporan">{photo && <img src={`/api/v1/attachments/${photo}`} alt="Foto laporan" className="w-full rounded-3xl" />}</Sheet>
      <Confirm open={block} onClose={() => setBlock(false)} title={r.source_blocked ? 'Buka blokir?' : 'Blokir sumber ini?'} confirmLabel={r.source_blocked ? 'Buka blokir' : 'Blokir'} danger={!r.source_blocked} loading={blockM.isPending} onConfirm={() => blockM.mutate()}>
        {r.source_blocked ? 'Perangkat/jaringan ini akan dapat mengirim laporan dan menelepon kendaraan Anda kembali.' : 'Perangkat/jaringan yang mengirim laporan ini tidak akan bisa mengirim laporan atau menelepon kendaraan Anda lagi. Gunakan untuk spam atau pelecehan.'}</Confirm>
    </div>
  );
}
