import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Laptop, Lock, LogOut, Mail, MessageCircle, Pencil, Send, Smartphone, Trash2 } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cx, fmtDateTime } from '../../lib/utils';
import { Avatar, Button, ErrorNote, Field, Input, Notice, PageLoader, Pills, Sheet, StatusBadge, Toggle } from '../../components/ui';

interface CS { webrtc_enabled: boolean; pstn_enabled: boolean; call_availability: 'ONLINE' | 'ALWAYS' | 'OFFLINE'; max_call_duration_seconds: number; ring_timeout_seconds: number; allow_anonymous_webrtc: boolean; allow_urgent_alerts: boolean; quiet_hours: { enabled: boolean; start: string; end: string; timezone: string }; owner_phone_set: boolean; pstn_provider_ready: boolean }
interface Channel { id: string; channel: string; destination_masked: string; enabled: boolean }
const MODE: Record<string, string> = { ONLINE: 'Saat saya online', ALWAYS: 'Selalu tersedia', OFFLINE: 'Tidak tersedia' };
const KIND: Record<string, string> = { 'report.created': 'Laporan baru', 'call.missed': 'Panggilan tak terjawab', test: 'Pesan tes' };
const CH: Record<string, string> = { TELEGRAM: 'Telegram', WHATSAPP: 'WhatsApp', EMAIL: 'Email' };

const Section = ({ title, children, className }: { title: string; children: ReactNode; className?: string }) => (
  <section className={cx('card p-5', className)}><h2 className="font-display text-[17px] font-bold">{title}</h2><div className="mt-2 divide-y divide-line/60">{children}</div></section>
);
const Row = ({ title, desc, children, onClick, danger, icon }: { title: string; desc?: string; children?: ReactNode; onClick?: () => void; danger?: boolean; icon?: ReactNode }) => {
  const inner = (<><span className={cx('flex min-w-0 flex-1 items-center gap-3.5', danger && 'text-coral-deep')}>{icon && <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl [&>svg]:h-[18px] [&>svg]:w-[18px]', danger ? 'bg-coral-soft' : 'bg-[#F1F4F9] text-ink-3')}>{icon}</span>}<span className="min-w-0"><span className="block font-semibold">{title}</span>{desc && <span className="block truncate text-[13px] text-muted">{desc}</span>}</span></span>{children ?? (onClick && <ChevronRight className="h-4 w-4 text-muted" />)}</>);
  return onClick ? <button onClick={onClick} className="flex w-full items-center justify-between gap-4 py-3.5 text-left">{inner}</button> : <div className="flex items-center justify-between gap-4 py-3.5">{inner}</div>;
};

export default function Settings() {
  const { user, refresh, logout } = useAuth(); const qc = useQueryClient(); const nav = useNavigate();
  const q = useQuery({ queryKey: ['call-settings'], queryFn: () => api<{ settings: CS }>('/call-settings') });
  const chs = useQuery({ queryKey: ['channels'], queryFn: () => api<{ channels: Channel[] }>('/notifications/channels') });
  const del = useQuery({ queryKey: ['deliveries'], queryFn: () => api<{ deliveries: { id: string; channel: string; status: string; created_at: string; kind: string; plate: string | null }[] }>('/notifications/deliveries?limit=5') });
  const sess = useQuery({ queryKey: ['sessions'], queryFn: () => api<{ sessions: { id: string; user_agent: string | null; created_at: string; current: boolean }[] }>('/auth/sessions') });
  const [sheet, setSheet] = useState<'profile' | 'password' | 'devices' | 'advanced' | 'delete' | null>(null);
  const [msg, setMsg] = useState(''); const [error, setError] = useState('');
  const [name, setName] = useState(user?.name ?? ''); const [pw, setPw] = useState({ cur: '', next: '' }); const [pwErr, setPwErr] = useState('');
  const [delPw, setDelPw] = useState(''); const [delErr, setDelErr] = useState(''); const [phone, setPhone] = useState('');

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/call-settings', { method: 'PATCH', body }),
    onMutate: async (body) => { await qc.cancelQueries({ queryKey: ['call-settings'] }); const prev = qc.getQueryData<{ settings: CS }>(['call-settings']); if (prev) qc.setQueryData(['call-settings'], { settings: { ...prev.settings, ...body } }); return { prev }; },
    onError: (e, _b, ctx) => { if (ctx?.prev) qc.setQueryData(['call-settings'], ctx.prev); setError(errMsg(e)); },
    onSuccess: () => { setError(''); setPhone(''); },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['call-settings'] }),
  });
  const toggleCh = useMutation({
    mutationFn: ({ c, enabled }: { c: Channel | undefined; enabled: boolean }) => c ? api(`/notifications/channels/${c.id}`, { method: 'PATCH', body: { enabled } }) : api('/notifications/email', { method: 'PUT', body: { enabled } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['channels'] }), onError: (e) => setError(errMsg(e)),
  });
  const testAll = useMutation({ mutationFn: async () => { for (const c of chs.data?.channels.filter((x) => x.enabled) ?? []) await api('/notifications/test', { body: { channel: c.channel } }); }, onSuccess: () => { setMsg('Pesan tes dikirim ke kanal aktif.'); void qc.invalidateQueries({ queryKey: ['deliveries'] }); }, onError: (e) => setError(errMsg(e)) });
  const saveName = useMutation({ mutationFn: () => api('/auth/me', { method: 'PATCH', body: { name } }), onSuccess: () => { void refresh(); setSheet(null); } });
  const changePw = useMutation({ mutationFn: () => api('/auth/change-password', { body: { current_password: pw.cur, new_password: pw.next } }), onSuccess: () => { setMsg('Kata sandi diperbarui. Perangkat lain dikeluarkan.'); setPwErr(''); setPw({ cur: '', next: '' }); setSheet(null); }, onError: (e) => setPwErr(errMsg(e)) });
  const revoke = useMutation({ mutationFn: () => api('/auth/sessions/revoke-others', { body: {} }), onSuccess: () => { setMsg('Perangkat lain telah dikeluarkan.'); void sess.refetch(); } });
  const delAcc = useMutation({ mutationFn: () => api('/auth/delete-account', { body: { password: delPw } }), onSuccess: async () => { await logout(); nav('/', { replace: true }); }, onError: (e) => setDelErr(errMsg(e)) });
  const out = async () => { await logout(); nav('/', { replace: true }); };

  const cs = q.data?.settings;
  if (!cs || !user) return <PageLoader />;
  const ch = (k: string) => chs.data?.channels.find((c) => c.channel === k);
  const quiet = cs.quiet_hours.enabled ? `${cs.quiet_hours.start} — ${cs.quiet_hours.end} WIB` : 'Nonaktif';
  const ua = (s: string | null) => (/mobile|android|iphone/i.test(s ?? '') ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />);
  const channelRows: [string, ReactNode][] = [['WHATSAPP', <MessageCircle key="w" />], ['TELEGRAM', <Send key="t" />], ['EMAIL', <Mail key="e" />]];
  const chTone: Record<string, string> = { WHATSAPP: 'bg-mint-soft text-mint-deep', TELEGRAM: 'bg-sky-soft text-sky-deep', EMAIL: 'bg-violet-soft text-violet-deep' };

  return (
    <div className="px-4 pt-5 lg:px-0 lg:pt-0">
      <h1 className="mb-4 font-display text-[30px] font-bold lg:hidden">Pengaturan</h1>
      <div className="space-y-4">{msg && <Notice>{msg}</Notice>}<ErrorNote>{error}</ErrorNote></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <section className="card flex items-center gap-4 p-5">
            <Avatar name={user.name} size={64} /><div className="min-w-0 flex-1"><p className="truncate font-display text-xl font-bold">{user.name}</p><p className="truncate text-sm text-muted">{user.email}</p><p className="mt-0.5 hidden text-xs text-muted/80 sm:block">Bergabung {new Date(user.created_at).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</p></div>
            <Button variant="light" size="sm" onClick={() => { setName(user.name); setSheet('profile'); }}><Pencil className="h-4 w-4" /><span className="hidden sm:inline">Edit Profil</span></Button>
          </section>

          <Section title="Pengaturan Panggilan">
            <Row title="Terima panggilan WebRTC" desc={`Mode: ${MODE[cs.call_availability]}`}><Toggle checked={cs.webrtc_enabled} onChange={(v) => patch.mutate({ webrtc_enabled: v })} label="Panggilan WebRTC" /></Row>
            <Row title="Terima panggilan anonim" desc="Izinkan penelepon tanpa identitas"><Toggle checked={cs.allow_anonymous_webrtc} onChange={(v) => patch.mutate({ allow_anonymous_webrtc: v })} label="Panggilan anonim" /></Row>
            <Row title="Terima notifikasi mendesak" desc="Alert layar penuh tanpa suara panggilan"><Toggle checked={cs.allow_urgent_alerts} onChange={(v) => patch.mutate({ allow_urgent_alerts: v })} label="Notifikasi mendesak" /></Row>
            <Row title="Jam tenang" desc={quiet}><Toggle checked={cs.quiet_hours.enabled} onChange={(v) => patch.mutate({ quiet_hours: { ...cs.quiet_hours, enabled: v } })} label="Jam tenang" /></Row>
            <Row title="Pengaturan lanjutan" desc="Ketersediaan, batas dering, durasi, telepon biasa" onClick={() => setSheet('advanced')} />
          </Section>

          <Section title="Akun & Keamanan">
            <Row title="Ganti kata sandi" icon={<Lock />} onClick={() => setSheet('password')} />
            <Row title="Perangkat aktif" desc={`${sess.data?.sessions.length ?? 0} perangkat masuk`} icon={<Smartphone />} onClick={() => setSheet('devices')} />
            <Row title="Keluarkan perangkat lain" icon={<LogOut />} onClick={() => revoke.mutate()} />
            <Row title="Hapus akun" icon={<Trash2 />} danger onClick={() => setSheet('delete')} />
          </Section>
          <Button variant="light" size="lg" block className="lg:hidden" onClick={out}><LogOut className="h-4 w-4" />Keluar</Button>
        </div>

        <div className="space-y-4">
          <section className="card p-5"><h2 className="font-display text-[17px] font-bold">Kanal Notifikasi</h2>
            <div className="mt-3 space-y-2.5">
              {channelRows.map(([k, icon]) => { const c = ch(k); return (
                <div key={k} className="flex items-center gap-3.5 rounded-2xl bg-[#F7F9FC] p-3.5">
                  <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5', chTone[k])}>{icon}</span>
                  <div className="min-w-0 flex-1"><p className="font-semibold">{CH[k]}</p><p className="truncate text-[13px] text-muted">{c ? c.destination_masked : k === 'EMAIL' ? user.email.replace(/^(.{1,3}).*(@.+)$/, '$1***$2') : <Link to="/app/notifications" className="font-semibold text-brand">Hubungkan</Link>}</p></div>
                  {(c || k === 'EMAIL') && <Toggle checked={!!c?.enabled} onChange={(v) => toggleCh.mutate({ c, enabled: v })} label={`Aktifkan ${CH[k]}`} />}
                </div>); })}
            </div>
            <Button variant="light" size="lg" block className="mt-3" loading={testAll.isPending} onClick={() => testAll.mutate()}><Send className="h-4 w-4" />Kirim Tes Notifikasi</Button>
            <Link to="/app/notifications" className="mt-3 block text-center text-sm font-semibold text-brand">Kelola kanal →</Link>
          </section>
          <section className="card hidden p-5 lg:block"><h2 className="font-display text-[17px] font-bold">Riwayat Pengiriman</h2>
            <ul className="mt-3 space-y-2">{!del.data?.deliveries.length ? <li className="py-6 text-center text-sm text-muted">Belum ada pengiriman.</li> : del.data.deliveries.map((x) => (
              <li key={x.id} className="flex items-center gap-3 rounded-xl bg-[#F7F9FC] px-3.5 py-3"><span className={cx('h-2 w-2 shrink-0 rounded-full', x.status === 'SENT' ? 'bg-mint-deep' : x.status === 'FAILED' ? 'bg-coral' : 'bg-amber')} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{KIND[x.kind] ?? x.kind}{x.plate ? `: ${x.plate}` : ''}</p><p className="text-xs text-muted">{CH[x.channel] ?? x.channel} · {new Date(x.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p></div>
                <span className={cx('text-xs font-bold', x.status === 'SENT' ? 'text-mint-deep' : x.status === 'FAILED' ? 'text-coral-deep' : 'text-amber-deep')}>{x.status === 'SENT' ? 'Terkirim' : x.status === 'FAILED' ? 'Gagal' : 'Menunggu'}</span></li>))}</ul></section>
        </div>
      </div>

      <Sheet open={sheet === 'profile'} onClose={() => setSheet(null)} title="Edit profil">
        <Field label="Nama"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Button className="mt-4" block size="lg" loading={saveName.isPending} disabled={name.trim().length < 2} onClick={() => saveName.mutate()}>Simpan</Button></Sheet>
      <Sheet open={sheet === 'password'} onClose={() => setSheet(null)} title="Ganti kata sandi">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); changePw.mutate(); }}>
          <Field label="Kata sandi saat ini"><Input type="password" autoComplete="current-password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} /></Field>
          <Field label="Kata sandi baru" hint="Min. 10 karakter, huruf & angka"><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <ErrorNote>{pwErr}</ErrorNote><Button type="submit" block size="lg" loading={changePw.isPending} disabled={!pw.cur || pw.next.length < 10}>Ganti kata sandi</Button></form></Sheet>
      <Sheet open={sheet === 'devices'} onClose={() => setSheet(null)} title="Perangkat aktif">
        <ul className="divide-y divide-line/70 rounded-3xl bg-white px-4">{sess.data?.sessions.map((s) => <li key={s.id} className="flex items-center gap-3 py-3.5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#F1F4F9]">{ua(s.user_agent)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{(s.user_agent ?? 'Perangkat tidak dikenal').replace(/\(.*?\)/, '').slice(0, 60)}</p><p className="text-xs text-muted">Masuk {fmtDateTime(s.created_at)}</p></div>{s.current && <StatusBadge status="ACTIVE" label="Perangkat ini" />}</li>)}</ul>
        <Button className="mt-4" variant="soft" block onClick={() => revoke.mutate()} disabled={(sess.data?.sessions.length ?? 0) < 2}>Keluarkan perangkat lain</Button></Sheet>
      <Sheet open={sheet === 'advanced'} onClose={() => setSheet(null)} title="Pengaturan lanjutan">
        <div className="space-y-5">
          <div><p className="label">Ketersediaan panggilan</p><Pills value={cs.call_availability} onChange={(v) => patch.mutate({ call_availability: v })} options={[{ value: 'ONLINE', label: 'Saat online' }, { value: 'ALWAYS', label: 'Selalu' }, { value: 'OFFLINE', label: 'Tidak tersedia' }]} />
            <p className="mt-1.5 text-xs text-muted">{{ ONLINE: 'Tombol panggil aktif hanya bila aplikasi sedang terbuka.', ALWAYS: 'Tombol selalu aktif; jika tidak terbuka, panggilan tak terjawab.', OFFLINE: 'Tombol panggil dimatikan; pengunjung hanya bisa mengirim pesan.' }[cs.call_availability]}</p></div>
          {cs.quiet_hours.enabled && <div className="grid grid-cols-2 gap-3"><Field label="Jam tenang mulai"><Input type="time" value={cs.quiet_hours.start} onChange={(e) => patch.mutate({ quiet_hours: { ...cs.quiet_hours, start: e.target.value } })} /></Field><Field label="Selesai"><Input type="time" value={cs.quiet_hours.end} onChange={(e) => patch.mutate({ quiet_hours: { ...cs.quiet_hours, end: e.target.value } })} /></Field></div>}
          <div className="grid grid-cols-2 gap-3"><Field label="Batas dering (detik)"><Input type="number" min={15} max={90} defaultValue={cs.ring_timeout_seconds} onBlur={(e) => patch.mutate({ ring_timeout_seconds: Number(e.target.value) })} /></Field><Field label="Durasi maks (detik)"><Input type="number" min={60} max={600} defaultValue={cs.max_call_duration_seconds} onBlur={(e) => patch.mutate({ max_call_duration_seconds: Number(e.target.value) })} /></Field></div>
          <Row title="Telepon biasa (PSTN)" desc={cs.pstn_provider_ready ? 'Penelepon mungkin dikenai biaya operator.' : 'Belum tersedia: provider belum dikonfigurasi.'}><Toggle checked={cs.pstn_enabled} disabled={!cs.pstn_provider_ready} onChange={(v) => patch.mutate({ pstn_enabled: v })} label="Telepon biasa" /></Row>
          {cs.pstn_provider_ready && <Field label="Nomor Anda untuk disambungkan" hint={cs.owner_phone_set ? 'Sudah tersimpan terenkripsi. Isi untuk mengganti.' : 'Tidak pernah ditampilkan ke penelepon.'}><Input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => phone && patch.mutate({ owner_phone: phone.replace(/[\s-]/g, '') })} inputMode="tel" placeholder="+628…" /></Field>}
        </div></Sheet>
      <Sheet open={sheet === 'delete'} onClose={() => setSheet(null)} title="Hapus akun?">
        <p className="mb-4 text-[15px] text-ink-2">Akun dinonaktifkan dan semua QR berhenti berfungsi. Laporan dan log audit dapat dipertahankan sesuai kebijakan retensi. Masukkan kata sandi untuk konfirmasi.</p>
        <Input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder="Kata sandi" /><div className="mt-2"><ErrorNote>{delErr}</ErrorNote></div>
        <Button className="mt-4" variant="danger" block size="lg" loading={delAcc.isPending} disabled={!delPw} onClick={() => delAcc.mutate()}>Hapus akun</Button></Sheet>
    </div>
  );
}
