import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Car, FileText, LayoutGrid, LogOut, Mic, MicOff, PhoneCall, PhoneOff, Settings, ShieldCheck, X, Check } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { OwnerCallProvider, useOwnerCall } from '../../lib/ownerCall';
import { cx, fmtDuration, initials } from '../../lib/utils';
import { Logo } from '../../components/Logo';
import { Plate } from '../../components/ui';

const NAV = [
  { to: '/app', end: true, label: 'Ringkasan', icon: LayoutGrid },
  { to: '/app/vehicles', label: 'Kendaraan', icon: Car },
  { to: '/app/reports', label: 'Laporan', icon: FileText },
  { to: '/app/calls', label: 'Panggilan', icon: PhoneCall },
  { to: '/app/notifications', label: 'Notifikasi', icon: Bell },
  { to: '/app/settings', label: 'Pengaturan', icon: Settings },
];

function CallOverlay() {
  const c = useOwnerCall();
  if (c.active) return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink text-white" role="dialog" aria-modal="true" aria-label="Panggilan berlangsung">
      <div className="flex items-center justify-between px-5 pt-5 safe-top"><Plate value={c.active.plate} className="!text-sm !px-3 !py-1 !border-2" /><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">Panggilan internet</span></div>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className={cx('grid h-32 w-32 place-items-center rounded-full text-4xl font-bold', c.active.state === 'connected' ? 'bg-mint text-ink' : 'bg-white/15')}>P</span>
        <h2 className="mt-8 text-3xl font-semibold">Pengunjung</h2>
        <p className="mt-2 text-lg text-white/70" aria-live="polite">{c.active.state === 'connected' ? <span className="font-mono tabular-nums">{fmtDuration(c.seconds)}</span> : 'Menyambungkan audio…'}</p>
      </div>
      <div className="flex items-center justify-center gap-5 pb-10 safe-bottom">
        <button onClick={c.toggleMute} aria-pressed={c.muted} aria-label={c.muted ? 'Aktifkan mikrofon' : 'Matikan mikrofon'} className={cx('grid h-16 w-16 place-items-center rounded-full', c.muted ? 'bg-white text-ink' : 'bg-white/15')}>{c.muted ? <MicOff /> : <Mic />}</button>
        <button onClick={c.hangup} aria-label="Akhiri panggilan" className="grid h-20 w-20 place-items-center rounded-full bg-coral shadow-float"><PhoneOff className="h-8 w-8" /></button>
      </div>
    </div>
  );
  if (c.incoming) return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink text-white" role="alertdialog" aria-modal="true" aria-label="Panggilan masuk" aria-live="assertive">
      <div className="flex-1 flex-col items-center justify-center text-center flex">
        <p className="text-sm font-semibold text-white/60">Panggilan masuk dari QR kendaraan</p>
        <div className="relative my-10 grid h-40 w-40 place-items-center"><span className="absolute inset-0 animate-ring rounded-full bg-mint/40" /><span className="absolute inset-0 animate-ring rounded-full bg-mint/40 [animation-delay:.9s]" /><span className="relative grid h-28 w-28 place-items-center rounded-full bg-mint text-ink"><PhoneCall className="h-12 w-12" /></span></div>
        <Plate value={c.incoming.plate} className="text-3xl" />
        <p className="mt-5 max-w-xs text-white/60">Seseorang di dekat kendaraan Anda ingin berbicara. Nomor Anda tidak terlihat olehnya.</p>
      </div>
      <div className="mx-auto flex w-full max-w-xs justify-between px-8 pb-14 safe-bottom">
        <div className="text-center"><button onClick={c.reject} aria-label="Tolak panggilan" className="grid h-20 w-20 place-items-center rounded-full bg-coral"><X className="h-9 w-9" /></button><p className="mt-2 text-sm font-semibold">Tolak</p></div>
        <div className="text-center"><button onClick={() => void c.accept()} aria-label="Terima panggilan" className="grid h-20 w-20 place-items-center rounded-full bg-white text-ink"><Check className="h-9 w-9" /></button><p className="mt-2 text-sm font-semibold">Terima</p></div>
      </div>
    </div>
  );
  if (c.notice) return <div role="status" className="fixed inset-x-4 top-4 z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-float">{c.notice}<button onClick={c.dismissNotice} aria-label="Tutup" className="shrink-0 rounded-full bg-white/15 p-1"><X className="h-4 w-4" /></button></div>;
  return null;
}

function Shell() {
  const { user, logout } = useAuth(); const nav = useNavigate(); const { socket } = useOwnerCall();
  const sum = useQuery({ queryKey: ['summary'], queryFn: () => api<any>('/dashboard/summary'), refetchInterval: 30_000 });
  const newCount = sum.data?.reports?.NEW ?? 0; const missed = sum.data?.calls?.missed ?? 0;
  useEffect(() => { document.title = newCount ? `(${newCount}) Vehicle Contact` : 'Vehicle Contact System'; return () => { document.title = 'Vehicle Contact System'; }; }, [newCount]);
  const badge = (to: string) => (to === '/app/reports' ? newCount : 0);
  const out = async () => { await logout(); nav('/', { replace: true }); };
  const dot = { online: 'bg-mint-deep', connecting: 'bg-amber-deep', offline: 'bg-coral' }[socket];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col p-3 lg:flex">
        <div className="card-dark flex h-full flex-col p-5">
          <Logo to="/app" light />
          <nav className="mt-8 flex-1 space-y-1" aria-label="Navigasi utama">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex items-center gap-3 rounded-full px-4 py-3 text-[15px] font-semibold transition', isActive ? 'bg-white text-ink' : 'text-white/65 hover:bg-white/10 hover:text-white')}>
                <n.icon className="h-[18px] w-[18px]" />{n.label}
                {badge(n.to) > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold text-white">{badge(n.to)}</span>}
                {n.to === '/app/calls' && missed > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-white/20 px-1.5 text-[11px] font-bold text-white">{missed}</span>}
              </NavLink>))}
          </nav>
          {user?.is_admin && <NavLink to="/admin" className="mb-3 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />Panel admin</NavLink>}
          <div className="rounded-3xl bg-white/10 p-3">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-mint text-sm font-bold text-ink">{initials(user?.name ?? '?')}</span><div className="min-w-0 flex-1 leading-tight"><p className="truncate text-sm font-bold">{user?.name}</p><p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/55"><span className={cx('h-1.5 w-1.5 rounded-full', dot)} />{socket === 'online' ? 'Siap menerima panggilan' : socket === 'connecting' ? 'Menyambung…' : 'Offline'}</p></div></div>
            <button onClick={out} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-white/10 py-2 text-sm font-semibold hover:bg-white/20"><LogOut className="h-4 w-4" />Keluar</button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between px-4 pb-1 pt-4 safe-top lg:hidden">
          <Logo to="/app" />
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow-card"><span className={cx('h-2 w-2 rounded-full', dot)} />{socket === 'online' ? 'Online' : socket === 'connecting' ? '…' : 'Offline'}</span>
            <button onClick={out} aria-label="Keluar" className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-card"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-32 pt-4 lg:px-10 lg:pb-12 lg:pt-10"><Outlet /></main>
      </div>

      <nav aria-label="Navigasi utama" className="fixed inset-x-3 bottom-3 z-40 flex justify-between rounded-full bg-ink p-1.5 shadow-float safe-bottom-nav lg:hidden" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.filter((n) => n.to !== '/app/notifications').map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} aria-label={n.label} className={({ isActive }) => cx('relative flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-[13px] font-bold transition', isActive ? 'bg-white text-ink' : 'text-white/60')}>
            {({ isActive }) => <><n.icon className="h-5 w-5" />{isActive && <span>{n.label}</span>}{badge(n.to) > 0 && !isActive && <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-coral ring-2 ring-ink" />}</>}
          </NavLink>))}
      </nav>
      <CallOverlay />
    </div>
  );
}

export default function OwnerLayout() { return <OwnerCallProvider><Shell /></OwnerCallProvider>; }
