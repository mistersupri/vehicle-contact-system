import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Laptop, LogOut, Smartphone } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/utils';
import { Button, Confirm, ErrorNote, Field, Input, Notice, PageHeader, PageLoader, Pills, Toggle } from '../../components/ui';

interface CS { webrtc_enabled: boolean; pstn_enabled: boolean; call_availability: 'ONLINE' | 'ALWAYS' | 'OFFLINE'; max_call_duration_seconds: number; ring_timeout_seconds: number; allow_anonymous_webrtc: boolean; quiet_hours: { enabled: boolean; start: string; end: string; timezone: string }; owner_phone_set: boolean; pstn_provider_ready: boolean }

const Row = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-4"><div><p className="font-semibold">{title}</p>{desc && <p className="mt-0.5 text-sm text-muted">{desc}</p>}</div>{children}</div>
);

export default function Settings() {
  const { user, refresh, logout } = useAuth(); const qc = useQueryClient(); const nav = useNavigate();
  const q = useQuery({ queryKey: ['call-settings'], queryFn: () => api<{ settings: CS }>('/call-settings') });
  const sess = useQuery({ queryKey: ['sessions'], queryFn: () => api<{ sessions: { id: string; user_agent: string | null; created_at: string; current: boolean }[] }>('/auth/sessions') });
  const [cs, setCs] = useState<CS | null>(null); const [phone, setPhone] = useState(''); const [saved, setSaved] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (q.data) setCs(q.data.settings); }, [q.data]);
  const [name, setName] = useState(user?.name ?? ''); const [pw, setPw] = useState({ cur: '', next: '' }); const [pwMsg, setPwMsg] = useState(''); const [pwErr, setPwErr] = useState('');
  const [delOpen, setDelOpen] = useState(false); const [delPw, setDelPw] = useState(''); const [delErr, setDelErr] = useState('');

  const save = useMutation({
    mutationFn: () => api('/call-settings', { method: 'PATCH', body: { ...cs, owner_phone: phone ? phone.replace(/[\s-]/g, '') : undefined, owner_phone_set: undefined, pstn_provider_ready: undefined } }),
    onSuccess: () => { setSaved(true); setError(''); setPhone(''); void qc.invalidateQueries({ queryKey: ['call-settings'] }); setTimeout(() => setSaved(false), 2000); }, onError: (e) => setError(errMsg(e)),
  });
  const saveName = useMutation({ mutationFn: () => api('/auth/me', { method: 'PATCH', body: { name } }), onSuccess: () => void refresh() });
  const changePw = useMutation({ mutationFn: () => api('/auth/change-password', { body: { current_password: pw.cur, new_password: pw.next } }), onSuccess: () => { setPwMsg('Kata sandi diperbarui. Perangkat lain dikeluarkan.'); setPwErr(''); setPw({ cur: '', next: '' }); }, onError: (e) => { setPwErr(errMsg(e)); setPwMsg(''); } });
  const revoke = useMutation({ mutationFn: () => api('/auth/sessions/revoke-others', { body: {} }), onSuccess: () => void sess.refetch() });
  const del = useMutation({ mutationFn: () => api('/auth/delete-account', { body: { password: delPw } }), onSuccess: async () => { await logout(); nav('/', { replace: true }); }, onError: (e) => setDelErr(errMsg(e)) });

  if (!cs) return <PageLoader />;
  const set = <K extends keyof CS>(k: K, v: CS[K]) => setCs({ ...cs, [k]: v });
  const ua = (s: string | null) => (/mobile|android|iphone/i.test(s ?? '') ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={user?.email} title="Pengaturan" />

      <section className="card p-6"><h2 className="text-lg font-bold">Pengaturan panggilan</h2>
        <div className="divide-y divide-line">
          <Row title="Panggilan internet (WebRTC)" desc="Izinkan pemindai QR menelepon Anda lewat browser."><Toggle checked={cs.webrtc_enabled} onChange={(v) => set('webrtc_enabled', v)} label="Panggilan internet" /></Row>
          <div className="py-4"><p className="font-semibold">Ketersediaan</p><p className="mb-3 mt-0.5 text-sm text-muted">Kapan panggilan boleh berdering.</p>
            <Pills value={cs.call_availability} onChange={(v) => set('call_availability', v)} options={[{ value: 'ONLINE', label: 'Saat saya online' }, { value: 'ALWAYS', label: 'Selalu' }, { value: 'OFFLINE', label: 'Tidak tersedia' }]} />
            <p className="mt-2 text-xs text-muted">{{ ONLINE: 'Tombol panggil hanya aktif bila aplikasi ini sedang terbuka.', ALWAYS: 'Tombol selalu aktif; jika Anda tidak membuka aplikasi panggilan akan tak terjawab.', OFFLINE: 'Tombol panggil dimatikan; pengunjung hanya bisa mengirim pesan.' }[cs.call_availability]}</p></div>
          <Row title="Terima panggilan anonim" desc="Pengunjung tak perlu mengisi identitas."><Toggle checked={cs.allow_anonymous_webrtc} onChange={(v) => set('allow_anonymous_webrtc', v)} label="Panggilan anonim" /></Row>
          <div className="py-4"><Row title="Jam tenang" desc="Panggilan tidak berdering pada rentang ini. Laporan tetap diterima."><Toggle checked={cs.quiet_hours.enabled} onChange={(v) => set('quiet_hours', { ...cs.quiet_hours, enabled: v })} label="Jam tenang" /></Row>
            {cs.quiet_hours.enabled && <div className="grid grid-cols-2 gap-3"><Field label="Mulai"><Input type="time" value={cs.quiet_hours.start} onChange={(e) => set('quiet_hours', { ...cs.quiet_hours, start: e.target.value })} /></Field><Field label="Selesai"><Input type="time" value={cs.quiet_hours.end} onChange={(e) => set('quiet_hours', { ...cs.quiet_hours, end: e.target.value })} /></Field></div>}</div>
          <div className="grid grid-cols-2 gap-3 py-4"><Field label="Batas dering (detik)"><Input type="number" min={15} max={90} value={cs.ring_timeout_seconds} onChange={(e) => set('ring_timeout_seconds', Number(e.target.value))} /></Field><Field label="Durasi maksimum (detik)"><Input type="number" min={60} max={600} value={cs.max_call_duration_seconds} onChange={(e) => set('max_call_duration_seconds', Number(e.target.value))} /></Field></div>
          <div className="py-4"><Row title="Telepon biasa (PSTN)" desc={cs.pstn_provider_ready ? 'Pengunjung dapat menelepon lewat jaringan seluler; penelepon mungkin dikenai biaya.' : 'Belum tersedia: penyedia telephony belum dikonfigurasi administrator.'}><Toggle checked={cs.pstn_enabled} disabled={!cs.pstn_provider_ready} onChange={(v) => set('pstn_enabled', v)} label="Telepon biasa" /></Row>
            {cs.pstn_provider_ready && <Field label="Nomor Anda untuk disambungkan" hint={cs.owner_phone_set ? 'Sudah tersimpan terenkripsi. Isi untuk mengganti.' : 'Tidak pernah ditampilkan ke penelepon.'}><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+628…" /></Field>}</div>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate()}>{saved ? <><Check className="h-4 w-4" />Tersimpan</> : 'Simpan pengaturan'}</Button></section>

      <section className="card p-6"><h2 className="text-lg font-bold">Profil</h2>
        <div className="mt-4 flex gap-3"><div className="flex-1"><Field label="Nama"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field></div><Button className="mt-[26px]" loading={saveName.isPending} disabled={name.trim().length < 2 || name === user?.name} onClick={() => saveName.mutate()}>Simpan</Button></div></section>

      <section className="card p-6"><h2 className="text-lg font-bold">Keamanan</h2>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); changePw.mutate(); }}>
          <Field label="Kata sandi saat ini"><Input type="password" autoComplete="current-password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} /></Field>
          <Field label="Kata sandi baru" hint="Min. 10 karakter, huruf & angka"><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <div className="sm:col-span-2 space-y-3">{pwMsg && <Notice>{pwMsg}</Notice>}<ErrorNote>{pwErr}</ErrorNote><Button type="submit" variant="dark" loading={changePw.isPending} disabled={!pw.cur || pw.next.length < 10}>Ganti kata sandi</Button></div></form></section>

      <section className="card p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Perangkat yang masuk</h2><Button variant="light" size="sm" onClick={() => revoke.mutate()} disabled={(sess.data?.sessions.length ?? 0) < 2} loading={revoke.isPending}><LogOut className="h-4 w-4" />Keluarkan lainnya</Button></div>
        <ul className="mt-3 divide-y divide-line">{sess.data?.sessions.map((s) => <li key={s.id} className="flex items-center gap-3 py-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-paper">{ua(s.user_agent)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{(s.user_agent ?? 'Perangkat tidak dikenal').replace(/\(.*?\)/, '').slice(0, 60)}</p><p className="text-xs text-muted">Masuk {fmtDateTime(s.created_at)}</p></div>{s.current && <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-mint-deep">Perangkat ini</span>}</li>)}</ul></section>

      <section className="rounded-3xl border border-coral/30 p-6"><h2 className="text-lg font-bold text-coral-deep">Hapus akun</h2><p className="mt-1 text-sm text-muted">Akun dinonaktifkan dan semua QR berhenti berfungsi. Laporan dan log audit dapat dipertahankan sesuai kebijakan retensi.</p><Button variant="danger" className="mt-4" onClick={() => setDelOpen(true)}>Ajukan penghapusan akun</Button></section>
      <Confirm open={delOpen} onClose={() => setDelOpen(false)} title="Hapus akun?" confirmLabel="Hapus akun" danger loading={del.isPending} onConfirm={() => del.mutate()}>
        <p className="mb-3">Masukkan kata sandi untuk mengonfirmasi. Tindakan ini tidak dapat dibatalkan sendiri.</p><Input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder="Kata sandi" /><div className="mt-2"><ErrorNote>{delErr}</ErrorNote></div></Confirm>
    </div>
  );
}
