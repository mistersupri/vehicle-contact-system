import { useState, type ReactNode } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Car, FileText, LayoutGrid, LogOut, PhoneCall, ScrollText, Search, Server, Settings, ShieldAlert, Users } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { CALL_STATUS_LABEL, cx, fmtDateTime, fmtDuration, STATUS_LABEL } from '../../lib/utils';
import { Logo } from '../../components/Logo';
import { Badge, Button, ErrorNote, Field, Input, Notice, PageHeader, PageLoader, Pills, Select, StatusBadge, Toggle } from '../../components/ui';

const NAV = [
  { to: '/admin', end: true, label: 'Ringkasan', icon: LayoutGrid }, { to: '/admin/users', label: 'Pengguna', icon: Users }, { to: '/admin/vehicles', label: 'Kendaraan', icon: Car },
  { to: '/admin/reports', label: 'Laporan', icon: FileText }, { to: '/admin/calls', label: 'Panggilan', icon: PhoneCall }, { to: '/admin/integrations', label: 'Integrasi', icon: Server },
  { to: '/admin/abuse', label: 'Penyalahgunaan', icon: ShieldAlert }, { to: '/admin/audit', label: 'Audit log', icon: ScrollText }, { to: '/admin/settings', label: 'Pengaturan', icon: Settings },
];

export default function AdminLayout() {
  const { user, logout } = useAuth(); const nav = useNavigate();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh lg:block"><div className="sidebar-bg flex h-full flex-col p-5 text-white">
        <Logo to="/admin" light /><span className="mt-3 inline-block w-fit rounded-full bg-brand/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#9CC4FF]">Admin · {user?.admin_role?.replace('_', ' ')}</span>
        <nav className="mt-6 flex-1 space-y-1 overflow-y-auto">{NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex items-center gap-3 rounded-full px-4 py-2.5 text-[14.5px] font-semibold transition', isActive ? 'bg-brand text-white' : 'text-white/65 hover:bg-white/10 hover:text-white')}><n.icon className="h-[18px] w-[18px]" />{n.label}</NavLink>)}</nav>
        <NavLink to="/app" className="mb-2 rounded-full bg-white/10 px-4 py-2.5 text-center text-sm font-semibold">Dashboard pemilik</NavLink>
        <button onClick={async () => { await logout(); nav('/', { replace: true }); }} className="flex items-center justify-center gap-2 rounded-full bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/20"><LogOut className="h-4 w-4" />Keluar</button>
      </div></aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between px-4 pt-4 lg:hidden"><Logo to="/admin" /><button onClick={async () => { await logout(); nav('/', { replace: true }); }} aria-label="Keluar" className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-card"><LogOut className="h-4 w-4" /></button></header>
        <nav className="scroll-hide flex gap-1.5 overflow-x-auto px-4 pt-3 lg:hidden" aria-label="Navigasi admin">{NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold', isActive ? 'btn-primary' : 'bg-white')}>{n.label}</NavLink>)}</nav>
        <main className="mx-auto max-w-6xl px-4 pb-12 pt-5 lg:px-10 lg:pt-10">
          <Routes><Route index element={<Overview />} /><Route path="users" element={<UsersPage />} /><Route path="vehicles" element={<VehiclesPage />} /><Route path="reports" element={<ReportsPage />} /><Route path="calls" element={<CallsPage />} /><Route path="integrations" element={<Integrations />} /><Route path="abuse" element={<Abuse />} /><Route path="audit" element={<Audit />} /><Route path="settings" element={<SettingsPage />} /></Routes>
        </main>
      </div>
    </div>
  );
}

function Table<T extends { id: string }>({ rows, cols, empty = 'Tidak ada data' }: { rows: T[]; cols: { h: string; c: (r: T) => ReactNode; cls?: string }[]; empty?: string }) {
  return (
    <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
      <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-muted">{cols.map((c) => <th key={c.h} className={cx('px-5 py-3.5 font-semibold', c.cls)}>{c.h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{rows.length === 0 ? <tr><td colSpan={cols.length} className="px-5 py-12 text-center text-muted">{empty}</td></tr> : rows.map((r) => <tr key={r.id} className="hover:bg-paper/60">{cols.map((c) => <td key={c.h} className={cx('px-5 py-3.5', c.cls)}>{c.c(r)}</td>)}</tr>)}</tbody></table></div>
  );
}
const SearchBar = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="!bg-white pl-11" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></div>
);

function Stat({ label, value, sub, tone = 'card' }: { label: string; value: ReactNode; sub?: string; tone?: 'card' | 'card-dark' | 'card-mint' }) {
  return <div className={cx(tone === 'card-dark' ? 'hero rounded-3xl' : tone === 'card-mint' ? 'rounded-3xl bg-mint text-mint-deep' : 'card', 'p-5')}><p className={cx('text-sm font-semibold', tone === 'card-dark' ? 'text-white/55' : 'text-muted')}>{label}</p><p className="mt-4 font-display text-5xl font-bold leading-none tracking-tight">{value ?? 0}</p>{sub && <p className={cx('mt-2 text-sm', tone === 'card-dark' ? 'text-white/55' : 'text-muted')}>{sub}</p>}</div>;
}

function Overview() {
  const q = useQuery({ queryKey: ['a-metrics'], queryFn: () => api<any>('/admin/metrics'), refetchInterval: 20_000 });
  if (q.isLoading) return <PageLoader />;
  const m = q.data; const days = m.reports_per_day as { d: string; c: number }[]; const max = Math.max(1, ...days.map((x) => x.c));
  return (
    <div className="space-y-4"><PageHeader eyebrow="Operasional" title="Ringkasan" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pengguna" value={m.users.total} sub={`${m.users.active ?? 0} aktif · ${m.users.suspended ?? 0} ditangguhkan`} tone="card-dark" />
        <Stat label="Kendaraan" value={m.vehicles.total} sub={`${m.vehicles.active ?? 0} aktif`} />
        <Stat label="Laporan" value={m.reports.total} sub={`${m.reports.last7 ?? 0} dalam 7 hari · ${m.reports.new_count ?? 0} baru`} tone="card-mint" />
        <Stat label="Panggilan" value={m.calls.total} sub={`${m.calls.missed ?? 0} tak terjawab · ${m.calls.pstn ?? 0} PSTN`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6"><h2 className="font-bold">Antrean notifikasi</h2>
          <dl className="mt-4 grid grid-cols-4 gap-2 text-center">{[['Menunggu', m.queue.pending], ['Retry', m.queue.retrying], ['Gagal', m.queue.failed], ['Terkirim', m.queue.sent]].map(([l, v]) => <div key={l as string} className="rounded-2xl bg-paper p-3"><dd className="text-2xl font-semibold">{v ?? 0}</dd><dt className="text-xs text-muted">{l}</dt></div>)}</dl>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Activity className="h-4 w-4" />{m.abuse_last7} kejadian penyalahgunaan terdeteksi (7 hari)</p></div>
        <div className="card p-6"><h2 className="font-bold">Laporan 7 hari</h2><div className="mt-4 flex h-28 items-end gap-2" role="img" aria-label="Grafik laporan per hari">{days.length === 0 ? <p className="m-auto text-sm text-muted">Belum ada data</p> : days.map((x) => <div key={x.d} className="flex flex-1 flex-col items-center gap-1"><span className="text-[11px] font-bold">{x.c}</span><div className="w-full rounded-full bg-ink" style={{ height: `${Math.max(12, (x.c / max) * 72)}px` }} /><span className="text-[10px] text-muted">{x.d.slice(5)}</span></div>)}</div></div>
      </div>
    </div>
  );
}

function usePaged(path: string, key: string, extra: Record<string, string>) {
  const p = new URLSearchParams({ limit: '25', ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) });
  return useQuery({ queryKey: [key, p.toString()], queryFn: () => api<any>(`${path}?${p}`), placeholderData: (x) => x });
}

function UsersPage() {
  const qc = useQueryClient(); const [s, setS] = useState(''); const [st, setSt] = useState(''); const [err, setErr] = useState('');
  const q = usePaged('/admin/users', 'a-users', { q: s, status: st });
  const m = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } }), onSuccess: () => { setErr(''); void qc.invalidateQueries({ queryKey: ['a-users'] }); }, onError: (e) => setErr(errMsg(e)) });
  const L: Record<string, string> = { ACTIVE: 'Aktif', PENDING: 'Menunggu verifikasi', SUSPENDED: 'Ditangguhkan' };
  return (
    <div className="space-y-4"><PageHeader eyebrow={`${q.data?.total ?? '…'} pengguna`} title="Pengguna" />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><SearchBar value={s} onChange={setS} placeholder="Cari nama atau email" /><Pills value={st} onChange={setSt} options={[{ value: '', label: 'Semua' }, { value: 'ACTIVE', label: 'Aktif' }, { value: 'PENDING', label: 'Menunggu' }, { value: 'SUSPENDED', label: 'Ditangguhkan' }]} /></div>
      <ErrorNote>{err}</ErrorNote>
      <Table rows={q.data?.users ?? []} cols={[
        { h: 'Pengguna', c: (u: any) => <><p className="font-semibold">{u.name}</p><p className="text-xs text-muted">{u.email}</p></> }, { h: 'Kendaraan', c: (u: any) => u.vehicle_count }, { h: 'Status', c: (u: any) => <StatusBadge status={u.status} label={L[u.status] ?? u.status} /> }, { h: 'Daftar', c: (u: any) => fmtDateTime(u.created_at) },
        { h: '', cls: 'text-right', c: (u: any) => <Button size="sm" variant={u.status === 'ACTIVE' ? 'light' : 'dark'} loading={m.isPending && m.variables?.id === u.id} onClick={() => m.mutate({ id: u.id, status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{u.status === 'ACTIVE' ? 'Tangguhkan' : u.status === 'PENDING' ? 'Verifikasi manual' : 'Aktifkan'}</Button> },
      ]} /></div>
  );
}

function VehiclesPage() {
  const qc = useQueryClient(); const [s, setS] = useState('');
  const q = usePaged('/admin/vehicles', 'a-vehicles', { q: s });
  const m = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api(`/admin/vehicles/${id}/status`, { method: 'PATCH', body: { status } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['a-vehicles'] }) });
  const L: Record<string, string> = { ACTIVE: 'Aktif', INACTIVE: 'Nonaktif', SUSPENDED: 'Ditangguhkan' };
  return (
    <div className="space-y-4"><PageHeader eyebrow={`${q.data?.total ?? '…'} kendaraan`} title="Kendaraan" /><SearchBar value={s} onChange={setS} placeholder="Cari pelat atau email pemilik" />
      <Table rows={q.data?.vehicles ?? []} cols={[
        { h: 'Pelat', c: (v: any) => <span className="font-bold tracking-wide">{v.plate_number}</span> }, { h: 'Kendaraan', c: (v: any) => [v.vehicle_type, v.brand, v.model].filter(Boolean).join(' · ') }, { h: 'Pemilik', c: (v: any) => <span className="text-muted">{v.owner_email}</span> }, { h: 'Laporan', c: (v: any) => v.report_count },
        { h: 'Status', c: (v: any) => <StatusBadge status={v.status} label={L[v.status]} /> },
        { h: '', cls: 'text-right', c: (v: any) => <Button size="sm" variant="light" onClick={() => m.mutate({ id: v.id, status: v.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' })}>{v.status === 'SUSPENDED' ? 'Pulihkan' : 'Tangguhkan'}</Button> },
      ]} /></div>
  );
}

function ReportsPage() {
  const [s, setS] = useState(''); const [st, setSt] = useState('');
  const q = usePaged('/admin/reports', 'a-reports', { q: s, status: st });
  return (
    <div className="space-y-4"><PageHeader eyebrow={`${q.data?.total ?? '…'} laporan`} title="Laporan" />
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]"><SearchBar value={s} onChange={setS} placeholder="Cari pelat atau referensi" /><Select value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status"><option value="">Semua status</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
      <Table rows={q.data?.reports ?? []} cols={[{ h: 'Referensi', c: (r: any) => <span className="font-mono text-xs">{r.reference}</span> }, { h: 'Pelat', c: (r: any) => <b>{r.plate_number}</b> }, { h: 'Kategori', c: (r: any) => r.category }, { h: 'Isi', c: (r: any) => <span className="text-muted">{r.excerpt}</span> }, { h: 'Status', c: (r: any) => <StatusBadge status={r.status} label={STATUS_LABEL[r.status]} /> }, { h: 'Waktu', c: (r: any) => fmtDateTime(r.created_at) }]} /></div>
  );
}

function CallsPage() {
  const q = usePaged('/admin/calls', 'a-calls', {});
  return (
    <div className="space-y-4"><PageHeader eyebrow="Metadata saja — tidak ada rekaman" title="Panggilan" />
      <Table rows={q.data?.calls ?? []} cols={[{ h: 'Referensi', c: (r: any) => <span className="font-mono text-xs">{r.reference}</span> }, { h: 'Pelat', c: (r: any) => <b>{r.plate_number}</b> }, { h: 'Jenis', c: (r: any) => (r.call_type === 'PSTN' ? 'Telepon biasa' : 'Internet') }, { h: 'Status', c: (r: any) => <StatusBadge status={r.status} label={CALL_STATUS_LABEL[r.status]} /> }, { h: 'Durasi', c: (r: any) => fmtDuration(r.duration_seconds) }, { h: 'Alasan', c: (r: any) => <span className="text-muted">{r.end_reason ?? '—'}</span> }, { h: 'Mulai', c: (r: any) => fmtDateTime(r.started_at) }]} /></div>
  );
}

function Integrations() {
  const q = useQuery({ queryKey: ['a-int'], queryFn: () => api<any>('/admin/integrations'), refetchInterval: 15_000 });
  if (q.isLoading) return <PageLoader />;
  return (
    <div className="space-y-4"><PageHeader eyebrow="Status penyedia eksternal" title="Integrasi" />
      <div className="grid gap-3 md:grid-cols-2">{q.data.integrations.map((i: any) => (
        <div key={i.key} className="card p-5"><div className="flex items-center justify-between"><h2 className="font-bold">{i.name}</h2><Badge tone={i.configured ? 'mint' : 'amber'}>{i.configured ? 'Terkonfigurasi' : 'Belum dikonfigurasi'}</Badge></div>
          <p className="mt-2 text-sm text-muted">Mode: <b className="text-ink">{i.mode}</b></p>
          <p className="mt-1 text-sm text-muted">{Object.entries(i.stats ?? {}).map(([k, v]) => `${k}: ${v ?? 0}`).join(' · ')}</p></div>))}</div>
      <h2 className="mt-6 text-xl font-bold">Antrean & kegagalan terbaru</h2>
      <Table rows={q.data.failures} empty="Tidak ada kegagalan 🎉" cols={[{ h: 'Kanal', c: (r: any) => r.channel }, { h: 'Kode galat', c: (r: any) => <code>{r.last_error_code}</code> }, { h: 'Percobaan', c: (r: any) => r.attempts }, { h: 'Diperbarui', c: (r: any) => fmtDateTime(r.updated_at) }]} />
    </div>
  );
}

function Abuse() {
  const q = usePaged('/admin/abuse', 'a-abuse', {});
  return (
    <div className="space-y-4"><PageHeader eyebrow="Rate limit, cooldown, dan laporan warga" title="Penyalahgunaan" />
      <Table rows={q.data?.events ?? []} empty="Belum ada kejadian" cols={[{ h: 'Jenis', c: (e: any) => <Badge tone={e.event_type === 'abuse.reported' ? 'coral' : 'amber'}>{e.event_type}</Badge> }, { h: 'Kendaraan', c: (e: any) => e.plate_number ?? '—' }, { h: 'Sumber (hash)', c: (e: any) => <code className="text-xs">{e.source}…</code> }, { h: 'Detail', c: (e: any) => <span className="text-muted">{e.details?.message ?? ''}</span> }, { h: 'Waktu', c: (e: any) => fmtDateTime(e.created_at) }]} /></div>
  );
}

function Audit() {
  const [a, setA] = useState('');
  const q = usePaged('/admin/audit-logs', 'a-audit', { action: a, limit: '50' });
  return (
    <div className="space-y-4"><PageHeader eyebrow="Catatan aktivitas penting" title="Audit log" /><SearchBar value={a} onChange={setA} placeholder="Filter aksi, mis. report atau qr" />
      <Table rows={q.data?.logs ?? []} cols={[{ h: 'Waktu', c: (l: any) => fmtDateTime(l.created_at) }, { h: 'Aktor', c: (l: any) => l.actor ?? <span className="text-muted">sistem</span> }, { h: 'Aksi', c: (l: any) => <code className="rounded bg-paper px-1.5 py-0.5 text-xs font-bold">{l.action}</code> }, { h: 'Entitas', c: (l: any) => <span className="text-muted">{l.entity_type}</span> }, { h: 'Metadata', c: (l: any) => <span className="font-mono text-xs text-muted">{Object.keys(l.metadata).length ? JSON.stringify(l.metadata).slice(0, 80) : ''}</span> }]} /></div>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ['a-settings'], queryFn: () => api<{ settings: Record<string, any> }>('/admin/settings') });
  const cats = useQuery({ queryKey: ['a-cats'], queryFn: () => api<{ categories: { code: string; label: string; description: string; active: number }[] }>('/admin/categories') });
  const [f, setF] = useState<Record<string, any> | null>(null); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [nc, setNc] = useState({ code: '', label: '', description: '' });
  const form = f ?? s.data?.settings;
  const save = useMutation({ mutationFn: () => api('/admin/settings', { method: 'PATCH', body: Object.fromEntries(Object.entries(form!).map(([k, v]) => [k, typeof s.data!.settings[k] === 'number' ? Number(v) : v])) }), onSuccess: () => { setMsg('Pengaturan disimpan.'); setErr(''); }, onError: (e) => { setErr(errMsg(e)); setMsg(''); } });
  const saveCat = useMutation({ mutationFn: (c: { code: string; label: string; description: string; active: boolean }) => api(`/admin/categories/${c.code}`, { method: 'PUT', body: { label: c.label, description: c.description, active: c.active } }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['a-cats'] }); setNc({ code: '', label: '', description: '' }); }, onError: (e) => setErr(errMsg(e)) });
  if (!form) return <PageLoader />;
  const labels: Record<string, string> = { report_rate_limit: 'Maks. laporan per kendaraan', report_rate_window_minutes: 'Jendela waktu (menit)', call_cooldown_seconds: 'Jeda antar panggilan (detik)', alert_cooldown_seconds: 'Jeda antar notifikasi mendesak (detik)', pstn_daily_limit_per_vehicle: 'Batas PSTN harian per kendaraan', pstn_allowed_prefixes: 'Kode negara PSTN yang diizinkan (pisahkan koma)' };
  return (
    <div className="space-y-4"><PageHeader eyebrow="Parameter sistem" title="Pengaturan" />
      <section className="card p-6"><h2 className="text-lg font-bold">Anti-penyalahgunaan & batas</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{Object.keys(labels).map((k) => <Field key={k} label={labels[k]}><Input value={form[k]} type={typeof s.data!.settings[k] === 'number' ? 'number' : 'text'} onChange={(e) => setF({ ...form, [k]: e.target.value })} /></Field>)}</div>
        {msg && <div className="mt-4"><Notice>{msg}</Notice></div>}<div className="mt-4"><ErrorNote>{err}</ErrorNote></div>
        <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate()}>Simpan</Button>
        <p className="mt-3 text-xs text-muted">Batas ukuran foto (5 MB) dan jumlah foto (3) ditetapkan di kode sesuai PRD; ubah lewat rilis.</p></section>
      <section className="card p-6"><h2 className="text-lg font-bold">Kategori laporan</h2>
        <ul className="mt-3 divide-y divide-line">{cats.data?.categories.map((c) => <li key={c.code} className="flex items-center gap-3 py-3"><code className="w-24 shrink-0 text-xs font-bold">{c.code}</code><div className="min-w-0 flex-1"><p className="font-semibold">{c.label}</p><p className="truncate text-xs text-muted">{c.description}</p></div><Toggle checked={!!c.active} label={`Aktifkan ${c.label}`} onChange={(v) => saveCat.mutate({ ...c, active: v })} /></li>)}</ul>
        <div className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr_1fr_auto]"><Input placeholder="KODE" value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value.toUpperCase() })} aria-label="Kode" /><Input placeholder="Label" value={nc.label} onChange={(e) => setNc({ ...nc, label: e.target.value })} aria-label="Label" /><Input placeholder="Deskripsi" value={nc.description} onChange={(e) => setNc({ ...nc, description: e.target.value })} aria-label="Deskripsi" /><Button disabled={!nc.code || !nc.label} loading={saveCat.isPending} onClick={() => saveCat.mutate({ ...nc, active: true })}>Tambah</Button></div></section>
    </div>
  );
}
