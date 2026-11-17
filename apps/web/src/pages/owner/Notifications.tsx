import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Send, Unlink } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { fmtDateTime } from '../../lib/utils';
import { Badge, Button, ErrorNote, Field, Input, Notice, PageHeader, PageLoader, StatusBadge, Toggle } from '../../components/ui';

interface Channel { id: string; channel: 'WHATSAPP' | 'TELEGRAM'; destination_masked: string; verified: boolean; enabled: boolean }
interface Delivery { id: string; channel: string; status: string; attempts: number; last_error_code: string | null; sent_at: string | null; created_at: string; next_attempt_at: string | null; kind: string; plate: string | null }
const DSTATUS: Record<string, string> = { PENDING: 'Menunggu', PROCESSING: 'Diproses', SENT: 'Terkirim', FAILED: 'Gagal', RETRY_SCHEDULED: 'Dicoba ulang' };
const KIND: Record<string, string> = { 'report.created': 'Laporan baru', 'call.missed': 'Panggilan tak terjawab', test: 'Tes' };

function Card({ title, tone, c, children, live, onOff, onToggle, onTest, testing }: { title: string; tone: string; c?: Channel; children: React.ReactNode; live: boolean; onOff?: () => void; onToggle: (id: string, v: boolean) => void; onTest: (channel: string) => void; testing: boolean }) {
  return (
    <section className="card p-6">
      <div className="flex items-center gap-3"><span className={`grid h-12 w-12 place-items-center rounded-full ${tone} font-bold`}>{title[0]}</span><div className="flex-1"><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-muted">{c ? c.destination_masked : 'Belum terhubung'}</p></div>
        {c && <Toggle checked={c.enabled} label={`Aktifkan ${title}`} onChange={(v) => onToggle(c.id, v)} />}</div>
      {!live && <div className="mt-3"><Badge tone="amber">Mode simulasi — belum ada kredensial provider</Badge></div>}
      <div className="mt-5">{children}</div>
      {c && <div className="mt-4 flex gap-2"><Button variant="light" size="sm" loading={testing} onClick={() => onTest(c.channel)}><Send className="h-4 w-4" />Kirim tes</Button>{onOff && <Button variant="ghost" size="sm" onClick={onOff}><Unlink className="h-4 w-4" />Putuskan</Button>}</div>}
    </section>
  );
}

export default function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['channels'], queryFn: () => api<{ channels: Channel[]; telegram_link_pending: boolean; providers: any }>('/notifications/channels') });
  const d = useQuery({ queryKey: ['deliveries'], queryFn: () => api<{ deliveries: Delivery[] }>('/notifications/deliveries?limit=15'), refetchInterval: 8000 });
  const inv = () => { void qc.invalidateQueries({ queryKey: ['channels'] }); void qc.invalidateQueries({ queryKey: ['deliveries'] }); };
  const [msg, setMsg] = useState(''); const [error, setError] = useState('');
  const [tg, setTg] = useState<{ link: string | null; dev: string | null } | null>(null);
  const [phone, setPhone] = useState('+62'); const [code, setCode] = useState(''); const [waStep, setWaStep] = useState<{ dev?: string } | null>(null);

  const wrap = <A,>(fn: (a: A) => Promise<unknown>, ok?: string) => useMutation({ mutationFn: fn, onSuccess: () => { setError(''); if (ok) setMsg(ok); inv(); }, onError: (e) => { setMsg(''); setError(errMsg(e)); } });
  const toggle = wrap(({ id, enabled }: { id: string; enabled: boolean }) => api(`/notifications/channels/${id}`, { method: 'PATCH', body: { enabled } }));
  const test = wrap((channel: string) => api('/notifications/test', { body: { channel } }), 'Pesan tes dikirim — periksa riwayat pengiriman di bawah.');
  const tgConnect = wrap(async () => { const r = await api<any>('/notifications/telegram/connect', { body: {} }); setTg({ link: r.deep_link, dev: r.dev_token ?? null }); });
  const tgSim = wrap(async () => { await api('/notifications/telegram/simulate', { body: { token: tg!.dev } }); setTg(null); }, 'Telegram terhubung (simulasi).');
  const tgOff = wrap(() => api('/notifications/telegram/disconnect', { body: {} }));
  const waConnect = wrap(async () => { const r = await api<any>('/notifications/whatsapp/connect', { body: { phone: phone.replace(/[\s-]/g, '') } }); setWaStep({ dev: r.dev_code }); });
  const waVerify = wrap(async () => { await api('/notifications/whatsapp/verify', { body: { code } }); setWaStep(null); setCode(''); }, 'WhatsApp terhubung.');

  if (q.isLoading) return <PageLoader />;
  const ch = (k: string) => q.data!.channels.find((c) => c.channel === k); const p = q.data!.providers;
  const tgC = ch('TELEGRAM'), waC = ch('WHATSAPP');

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Ke mana laporan dikirim" title="Notifikasi" />
      <Notice tone="sky">Laporan baru dan panggilan tak terjawab dikirim ke semua kanal yang aktif. Jika satu kanal gagal, kanal lain tetap terkirim, dan pengiriman dicoba ulang otomatis.</Notice>
      {msg && <Notice>{msg}</Notice>}<ErrorNote>{error}</ErrorNote>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Telegram" tone="bg-sky-soft text-sky-deep" c={tgC} live={p.telegram_live} onToggle={(id, enabled) => toggle.mutate({ id, enabled })} onTest={(c) => test.mutate(c)} testing={test.isPending && test.variables === 'TELEGRAM'} onOff={tgC ? () => tgOff.mutate(undefined) : undefined}>
          {!tgC && !tg && <><p className="mb-4 text-sm text-muted">Hubungkan lewat bot kami. Anda harus memulai percakapan dengan bot terlebih dahulu.</p><Button loading={tgConnect.isPending} onClick={() => tgConnect.mutate(undefined)}>Hubungkan Telegram</Button></>}
          {!tgC && tg && <div className="space-y-3"><Notice tone="mint">Token berlaku 15 menit dan hanya bisa dipakai sekali.</Notice>
            {tg.link && <a href={tg.link} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-white">Buka bot Telegram <ExternalLink className="h-4 w-4" /></a>}
            {tg.dev && <div className="rounded-2xl bg-amber-soft p-4 text-sm text-amber-deep">Mode demo: bot belum dikonfigurasi. Simulasikan pesan <code className="font-bold">/start {tg.dev.slice(0, 6)}…</code> dari Telegram.<Button className="mt-3" size="sm" loading={tgSim.isPending} onClick={() => tgSim.mutate(undefined)}>Simulasikan /start</Button></div>}</div>}
          {tgC && <p className="text-sm text-muted">Terhubung ✓ — notifikasi akan masuk ke chat Telegram Anda.</p>}
        </Card>
        <Card title="WhatsApp" tone="bg-mint text-mint-deep" c={waC} live={p.whatsapp_live} onToggle={(id, enabled) => toggle.mutate({ id, enabled })} onTest={(c) => test.mutate(c)} testing={test.isPending && test.variables === 'WHATSAPP'}>
          {!waC && !waStep && <div className="space-y-3"><Field label="Nomor WhatsApp" hint="Format internasional. Kode verifikasi dikirim ke nomor ini."><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field><Button loading={waConnect.isPending} disabled={phone.length < 9} onClick={() => waConnect.mutate(undefined)}>Kirim kode verifikasi</Button></div>}
          {!waC && waStep && <div className="space-y-3"><Field label="Kode 6 digit dari WhatsApp"><Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} placeholder="000000" className="tracking-[.4em]" /></Field>
            {waStep.dev && <p className="rounded-2xl bg-amber-soft p-3 text-sm text-amber-deep">Mode demo — kode: <b className="font-mono">{waStep.dev}</b></p>}
            <div className="flex gap-2"><Button loading={waVerify.isPending} disabled={code.length !== 6} onClick={() => waVerify.mutate(undefined)}>Verifikasi</Button><Button variant="ghost" onClick={() => setWaStep(null)}>Ganti nomor</Button></div></div>}
          {waC && <p className="text-sm text-muted">Terhubung ✓ — WhatsApp hanya untuk menerima notifikasi (satu arah).</p>}
        </Card>
      </div>

      <section><h2 className="mb-3 mt-6 text-xl font-bold">Riwayat pengiriman</h2>
        <div className="card divide-y divide-line overflow-hidden">
          {!d.data?.deliveries.length ? <p className="p-8 text-center text-sm text-muted">Belum ada pengiriman. Kirim tes untuk mencoba.</p> : d.data.deliveries.map((x) => (
            <div key={x.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-semibold">{KIND[x.kind] ?? x.kind}{x.plate && <span className="text-muted"> · {x.plate}</span>}</p><p className="text-xs text-muted">{x.channel === 'TELEGRAM' ? 'Telegram' : 'WhatsApp'} · {fmtDateTime(x.created_at)}{x.attempts > 1 ? ` · ${x.attempts} percobaan` : ''}{x.last_error_code && x.status !== 'SENT' ? ` · ${x.last_error_code}` : ''}</p></div><StatusBadge status={x.status} label={DSTATUS[x.status]} /></div>))}
        </div>
        <p className="mt-2 text-xs text-muted">“Terkirim” berarti provider menerima pesan, bukan jaminan sudah dibaca.</p></section>
    </div>
  );
}
