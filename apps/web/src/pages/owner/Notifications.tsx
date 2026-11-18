import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Mail, MessageCircle, Send, Unlink } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { cx, fmtDateTime } from '../../lib/utils';
import { Badge, Button, ErrorNote, Field, Input, Notice, PageLoader, StatusBadge, Toggle } from '../../components/ui';

interface Channel { id: string; channel: 'WHATSAPP' | 'TELEGRAM' | 'EMAIL'; destination_masked: string; verified: boolean; enabled: boolean }
interface Delivery { id: string; channel: string; status: string; attempts: number; last_error_code: string | null; sent_at: string | null; created_at: string; next_attempt_at: string | null; kind: string; plate: string | null }
const DSTATUS: Record<string, string> = { PENDING: 'Menunggu', PROCESSING: 'Diproses', SENT: 'Terkirim', FAILED: 'Gagal', RETRY_SCHEDULED: 'Dicoba ulang' };
const KIND: Record<string, string> = { 'report.created': 'Laporan baru', 'call.missed': 'Panggilan tak terjawab', test: 'Pesan tes' };
const CH: Record<string, string> = { TELEGRAM: 'Telegram', WHATSAPP: 'WhatsApp', EMAIL: 'Email' };

function Card({ title, icon, tone, c, children, live, onToggle, onTest, testing, onOff }: { title: string; icon: React.ReactNode; tone: string; c?: Channel; children: React.ReactNode; live: boolean; onToggle: (v: boolean) => void; onTest: () => void; testing: boolean; onOff?: () => void }) {
  return (
    <section className="card p-5">
      <div className="flex items-center gap-3"><span className={cx('grid h-12 w-12 place-items-center rounded-2xl [&>svg]:h-5 [&>svg]:w-5', tone)}>{icon}</span><div className="flex-1"><h2 className="font-display text-lg font-bold">{title}</h2><p className="text-sm text-muted">{c ? c.destination_masked : 'Belum terhubung'}</p></div>
        {c && <Toggle checked={c.enabled} label={`Aktifkan ${title}`} onChange={onToggle} />}</div>
      {!live && <div className="mt-3"><Badge tone="amber" dot={false}>Mode simulasi — belum ada kredensial provider</Badge></div>}
      <div className="mt-4">{children}</div>
      {c && <div className="mt-4 flex gap-2"><Button variant="light" size="sm" loading={testing} onClick={onTest}><Send className="h-4 w-4" />Kirim tes</Button>{onOff && <Button variant="ghost" size="sm" onClick={onOff}><Unlink className="h-4 w-4" />Putuskan</Button>}</div>}
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
  const email = wrap((enabled: boolean) => api('/notifications/email', { method: 'PUT', body: { enabled } }));
  const test = wrap((channel: string) => api('/notifications/test', { body: { channel } }), 'Pesan tes dikirim — periksa riwayat pengiriman di bawah.');
  const tgConnect = wrap(async () => { const r = await api<any>('/notifications/telegram/connect', { body: {} }); setTg({ link: r.deep_link, dev: r.dev_token ?? null }); });
  const tgSim = wrap(async () => { await api('/notifications/telegram/simulate', { body: { token: tg!.dev } }); setTg(null); }, 'Telegram terhubung (simulasi).');
  const tgOff = wrap(() => api('/notifications/telegram/disconnect', { body: {} }));
  const waConnect = wrap(async () => { const r = await api<any>('/notifications/whatsapp/connect', { body: { phone: phone.replace(/[\s-]/g, '') } }); setWaStep({ dev: r.dev_code }); });
  const waVerify = wrap(async () => { await api('/notifications/whatsapp/verify', { body: { code } }); setWaStep(null); setCode(''); }, 'WhatsApp terhubung.');

  if (q.isLoading) return <PageLoader />;
  const ch = (k: string) => q.data!.channels.find((c) => c.channel === k); const p = q.data!.providers;
  const tgC = ch('TELEGRAM'), waC = ch('WHATSAPP'), emC = ch('EMAIL');

  return (
    <div className="space-y-4 px-4 pt-5 lg:px-0 lg:pt-0">
      <h1 className="font-display text-[30px] font-bold lg:hidden">Notifikasi</h1>
      <Notice tone="sky">Laporan baru, notifikasi mendesak, dan panggilan tak terjawab dikirim ke semua kanal yang aktif. Jika satu kanal gagal, kanal lain tetap terkirim dan pengiriman dicoba ulang otomatis.</Notice>
      {msg && <Notice>{msg}</Notice>}<ErrorNote>{error}</ErrorNote>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="WhatsApp" icon={<MessageCircle />} tone="bg-mint text-mint-deep" c={waC} live={p.whatsapp_live} onToggle={(enabled) => toggle.mutate({ id: waC!.id, enabled })} onTest={() => test.mutate('WHATSAPP')} testing={test.isPending && test.variables === 'WHATSAPP'}>
          {!waC && !waStep && <div className="space-y-3"><Field label="Nomor WhatsApp" hint="Format internasional. Kode verifikasi dikirim ke nomor ini."><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field><Button loading={waConnect.isPending} disabled={phone.length < 9} onClick={() => waConnect.mutate(undefined)}>Kirim kode verifikasi</Button></div>}
          {!waC && waStep && <div className="space-y-3"><Field label="Kode 6 digit dari WhatsApp"><Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} placeholder="000000" className="tracking-[.4em]" /></Field>
            {waStep.dev && <p className="rounded-2xl bg-amber-soft p-3 text-sm text-amber-deep">Mode demo — kode: <b className="font-mono">{waStep.dev}</b></p>}
            <div className="flex gap-2"><Button loading={waVerify.isPending} disabled={code.length !== 6} onClick={() => waVerify.mutate(undefined)}>Verifikasi</Button><Button variant="ghost" onClick={() => setWaStep(null)}>Ganti nomor</Button></div></div>}
          {waC && <p className="text-sm text-muted">Terhubung ✓ — satu arah, hanya untuk menerima notifikasi.</p>}
        </Card>
        <Card title="Telegram" icon={<Send />} tone="bg-sky-soft text-sky-deep" c={tgC} live={p.telegram_live} onToggle={(enabled) => toggle.mutate({ id: tgC!.id, enabled })} onTest={() => test.mutate('TELEGRAM')} testing={test.isPending && test.variables === 'TELEGRAM'} onOff={tgC ? () => tgOff.mutate(undefined) : undefined}>
          {!tgC && !tg && <><p className="mb-4 text-sm text-muted">Hubungkan lewat bot kami. Anda harus memulai percakapan dengan bot terlebih dahulu.</p><Button loading={tgConnect.isPending} onClick={() => tgConnect.mutate(undefined)}>Hubungkan Telegram</Button></>}
          {!tgC && tg && <div className="space-y-3"><Notice tone="mint">Token berlaku 15 menit dan hanya bisa dipakai sekali.</Notice>
            {tg.link && <a href={tg.link} target="_blank" rel="noreferrer" className="btn-primary inline-flex h-12 items-center gap-2 rounded-2xl px-6 font-semibold">Buka bot Telegram <ExternalLink className="h-4 w-4" /></a>}
            {tg.dev && <div className="rounded-2xl bg-amber-soft p-4 text-sm text-amber-deep">Mode demo: bot belum dikonfigurasi. Simulasikan pesan <code className="font-bold">/start {tg.dev.slice(0, 6)}…</code> dari Telegram.<Button className="mt-3" size="sm" loading={tgSim.isPending} onClick={() => tgSim.mutate(undefined)}>Simulasikan /start</Button></div>}</div>}
          {tgC && <p className="text-sm text-muted">Terhubung ✓ — notifikasi masuk ke chat Telegram Anda.</p>}
        </Card>
        <Card title="Email" icon={<Mail />} tone="bg-violet-soft text-violet-deep" c={emC} live={p.email_live} onToggle={(enabled) => email.mutate(enabled)} onTest={() => test.mutate('EMAIL')} testing={test.isPending && test.variables === 'EMAIL'}>
          {!emC ? <><p className="mb-4 text-sm text-muted">Kirim notifikasi ke alamat email akun Anda.</p><Button loading={email.isPending} onClick={() => email.mutate(true)}>Aktifkan Email</Button></> : <p className="text-sm text-muted">Dikirim ke email akun Anda.</p>}
        </Card>
      </div>

      <section><h2 className="mb-3 mt-4 font-display text-xl font-bold">Riwayat Pengiriman</h2>
        <div className="card divide-y divide-line/70 overflow-hidden">
          {!d.data?.deliveries.length ? <p className="p-8 text-center text-sm text-muted">Belum ada pengiriman. Kirim tes untuk mencoba.</p> : d.data.deliveries.map((x) => (
            <div key={x.id} className="flex items-center gap-3 p-4"><span className={cx('h-2 w-2 shrink-0 rounded-full', x.status === 'SENT' ? 'bg-mint-deep' : x.status === 'FAILED' ? 'bg-coral' : 'bg-amber')} /><div className="min-w-0 flex-1"><p className="font-semibold">{KIND[x.kind] ?? x.kind}{x.plate && <span className="font-normal text-muted"> · {x.plate}</span>}</p><p className="text-xs text-muted">{CH[x.channel] ?? x.channel} · {fmtDateTime(x.created_at)}{x.attempts > 1 ? ` · ${x.attempts} percobaan` : ''}{x.last_error_code && x.status !== 'SENT' ? ` · ${x.last_error_code}` : ''}</p></div><StatusBadge status={x.status} label={DSTATUS[x.status]} /></div>))}
        </div>
        <p className="mt-2 text-xs text-muted">“Terkirim” berarti provider menerima pesan, bukan jaminan sudah dibaca.</p></section>
    </div>
  );
}
