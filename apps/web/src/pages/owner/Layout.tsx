import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Car, Inbox, LayoutDashboard, LogOut, Phone, Search, Settings, ShieldCheck, User, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { OwnerCallProvider, useOwnerCall } from '../../lib/ownerCall';
import { cx } from '../../lib/utils';
import { Logo } from '../../components/Logo';
import { ActiveUi, IncomingUi, UrgentUi } from '../../components/CallUi';
import { Avatar } from '../../components/ui';

const NAV = [
  { to: '/app', end: true, label: 'Beranda', icon: LayoutDashboard },
  { to: '/app/vehicles', label: 'Kendaraan', icon: Car },
  { to: '/app/reports', label: 'Laporan', icon: Inbox },
  { to: '/app/calls', label: 'Panggilan', icon: Phone },
  { to: '/app/notifications', label: 'Notifikasi', icon: Bell },
];
const TABS = [...NAV.slice(0, 4), { to: '/app/settings', label: 'Akun', icon: User }];
const TITLES: [string, string][] = [['/app/vehicles', 'Kendaraan'], ['/app/reports', 'Laporan'], ['/app/calls', 'Panggilan'], ['/app/notifications', 'Notifikasi'], ['/app/settings', 'Pengaturan'], ['/app', 'Dashboard']];

function greeting() { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'; }

function Overlays() {
  const c = useOwnerCall(); const nav = useNavigate();
  const [ringSec, setRingSec] = useState(0);
  useEffect(() => { if (!c.incoming) return; setRingSec(0); const t = setInterval(() => setRingSec((s) => s + 1), 1000); return () => clearInterval(t); }, [c.incoming]);

  if (c.active) return <ActiveUi title="Penelepon Anonim" name={c.active.vehicle_name} plate={c.active.plate} status={c.active.state === 'connected' ? 'Terhubung' : 'Menyambung'} seconds={c.seconds} connected={c.active.state === 'connected'} muted={c.muted} onMute={c.toggleMute} onEnd={c.hangup} />;
  if (c.incoming) return <IncomingUi name={c.incoming.vehicle_name} plate={c.incoming.plate} seconds={ringSec} onAccept={() => void c.accept()} onReject={c.reject} />;
  if (c.alert) return <UrgentUi name={c.alert.vehicle_name} plate={c.alert.plate} label={c.alert.category_label} message={c.alert.message}
    onDismiss={c.dismissAlert} onOpen={() => { const id = c.alert!.report_id; c.dismissAlert(); nav(`/app/reports/${id}`); }} />;
  if (c.notice) return <div role="status" className="fixed inset-x-4 top-4 z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-navy-900 px-5 py-3 text-sm font-semibold text-white shadow-float">{c.notice}<button onClick={c.dismissNotice} aria-label="Tutup" className="shrink-0 rounded-full bg-white/15 p-1"><X className="h-4 w-4" /></button></div>;
  return null;
}

function Shell() {
  const { user, logout } = useAuth(); const nav = useNavigate(); const loc = useLocation(); const { socket } = useOwnerCall();
  const sum = useQuery({ queryKey: ['summary'], queryFn: () => api<any>('/dashboard/summary'), refetchInterval: 30_000 });
  const newCount = sum.data?.reports?.NEW ?? 0; const missed = sum.data?.calls?.missed ?? 0;
  const [q, setQ] = useState('');
  useEffect(() => { document.title = newCount ? `(${newCount}) Vehicle Contact` : 'Vehicle Contact System'; return () => { document.title = 'Vehicle Contact System'; }; }, [newCount]);
  const badge = (to: string) => (to === '/app/reports' ? newCount : 0);
  const out = async () => { await logout(); nav('/', { replace: true }); };
  const title = TITLES.find(([p]) => loc.pathname === p || (p !== '/app' && loc.pathname.startsWith(p)))?.[1] ?? 'Dashboard';
  const isHome = loc.pathname === '/app';
  const dot = { online: 'bg-[#13B77D]', connecting: 'bg-amber', offline: 'bg-coral' }[socket];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar desktop */}
      <aside className="sidebar-bg sticky top-0 hidden h-dvh flex-col p-4 text-white lg:flex">
        <div className="px-2 pt-2"><Logo to="/app" text="VCS" /></div>
        <nav className="mt-8 flex-1 space-y-1" aria-label="Navigasi utama">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-4 py-3 text-[14.5px] font-semibold transition', isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
              <n.icon className="h-[18px] w-[18px]" />{n.label}
              {badge(n.to) > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold text-white">{badge(n.to)}</span>}
              {n.to === '/app/calls' && missed > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-white/15 px-1.5 text-[11px] font-bold text-white">{missed}</span>}
            </NavLink>))}
        </nav>
        {user?.is_admin && <NavLink to="/admin" className="mb-2 flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300"><ShieldCheck className="h-4 w-4" />Panel admin</NavLink>}
        <div className="border-t border-white/10 pt-3">
          <NavLink to="/app/settings" className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-4 py-3 text-[14.5px] font-semibold transition', isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')}><Settings className="h-[18px] w-[18px]" />Pengaturan</NavLink>
          <div className="mt-2 flex items-center gap-3 rounded-xl p-2">
            <Avatar name={user?.name ?? '?'} size={38} />
            <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-sm font-bold">{user?.name}</p><p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-400"><span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />{socket === 'online' ? 'Siap menerima panggilan' : socket === 'connecting' ? 'Menyambung…' : 'Offline'}</p></div>
            <button onClick={out} aria-label="Keluar" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Header desktop */}
        <header className="sticky top-0 z-30 hidden items-center justify-between border-b border-line bg-white/90 px-8 py-4 backdrop-blur lg:flex">
          <div>{isHome && <p className="text-[13px] text-muted">{greeting()} 👋</p>}<h1 className="font-display text-[22px] font-bold leading-tight">{title}</h1></div>
          <div className="flex items-center gap-3">
            <form onSubmit={(e) => { e.preventDefault(); nav(`/app/reports${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); }} className="relative w-[300px]" role="search">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari laporan, kendaraan…" aria-label="Cari laporan atau kendaraan" className="h-11 w-full rounded-2xl border border-line bg-[#F7F9FC] pl-11 pr-4 text-sm placeholder:text-muted/70 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10" />
            </form>
            <NavLink to="/app/notifications" aria-label="Notifikasi" className="relative grid h-11 w-11 place-items-center rounded-2xl border border-line bg-white hover:bg-brand-soft"><Bell className="h-[18px] w-[18px]" />{newCount > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-coral" />}</NavLink>
          </div>
        </header>
        <main className="pb-24 lg:px-8 lg:pb-10 lg:pt-6"><div className="mx-auto max-w-[1160px]"><Outlet /></div></main>
      </div>

      {/* Tab bawah (mobile): Beranda · Kendaraan · Laporan · Panggilan · Akun */}
      <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition', isActive ? 'text-brand-deep' : 'text-muted')}>
            <span className="relative"><n.icon className="h-[22px] w-[22px]" />{badge(n.to) > 0 && <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-coral ring-2 ring-white" />}</span>{n.label}
          </NavLink>))}
      </nav>
      <Overlays />
    </div>
  );
}

export default function OwnerLayout() { return <OwnerCallProvider><Shell /></OwnerCallProvider>; }
