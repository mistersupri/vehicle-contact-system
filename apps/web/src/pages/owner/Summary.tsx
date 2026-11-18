import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, BellRing, Car, CheckCircle2, Download, Inbox, MessageCircle, Phone, PhoneMissed, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useOwnerCall } from '../../lib/ownerCall';
import { CAT_LABEL, STATUS_LABEL, cx, timeAgo } from '../../lib/utils';
import { Avatar, Button, Empty, IconTile, LinkButton, PageLoader, StatusBadge } from '../../components/ui';
import { CatDot, ReportRow, UrgentTag } from '../../components/ReportRow';
import type { Report } from '../../lib/types';

function greeting() { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'; }

function InstallCard() {
  const [ev, setEv] = useState<any>(null);
  useEffect(() => { const h = (e: Event) => { e.preventDefault(); setEv(e); }; window.addEventListener('beforeinstallprompt', h); return () => window.removeEventListener('beforeinstallprompt', h); }, []);
  if (!ev) return null;
  return <div className="card flex items-center gap-4 p-4"><IconTile tone="blue"><Download /></IconTile><div className="flex-1"><p className="font-bold">Pasang aplikasi</p><p className="text-sm text-muted">Akses cepat dari layar utama.</p></div><Button size="sm" onClick={() => { ev.prompt(); setEv(null); }}>Pasang</Button></div>;
}

const ACT_ICON: Record<string, { tone: 'blue' | 'green' | 'amber' | 'violet' | 'red'; icon: typeof Inbox }> = {
  report: { tone: 'blue', icon: Inbox }, alert: { tone: 'red', icon: BellRing }, missed_call: { tone: 'red', icon: PhoneMissed },
  notification: { tone: 'green', icon: MessageCircle }, resolved: { tone: 'green', icon: CheckCircle2 }, vehicle: { tone: 'amber', icon: Car },
};

function Stat({ icon, tone, value, label, sub }: { icon: React.ReactNode; tone: 'blue' | 'green' | 'amber' | 'violet'; value: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <IconTile tone={tone} className="h-14 w-14 !rounded-2xl">{icon}</IconTile>
      <div className="min-w-0"><p className="font-display text-[30px] font-bold leading-none">{value}</p><p className="mt-1.5 text-sm font-semibold text-ink-3">{label}</p><p className="text-xs text-muted">{sub}</p></div>
    </div>
  );
}

export default function Summary() {
  const { user } = useAuth(); const { socket } = useOwnerCall(); const nav = useNavigate();
  const q = useQuery({ queryKey: ['summary'], queryFn: () => api<any>('/dashboard/summary') });
  if (q.isLoading) return <PageLoader />;
  const d = q.data; const r = d.reports as Record<string, number>; const recent: Report[] = d.recent_reports;
  const first = user?.name.split(' ')[0] ?? '';
  const dot = { online: 'bg-[#13B77D]', connecting: 'bg-amber', offline: 'bg-coral' }[socket];

  return (
    <div>
      {/* ---------- Mobile: hero gradien ---------- */}
      <section className="hero rounded-b-[32px] px-5 pb-6 safe-top lg:hidden">
        <div className="flex items-start justify-between">
          <div><p className="text-sm text-white/65">{greeting()}</p><h1 className="mt-0.5 font-display text-[28px] font-bold leading-tight">{user?.name}</h1>
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-white/55"><span className={cx('h-1.5 w-1.5 rounded-full', dot)} />{socket === 'online' ? 'Siap menerima panggilan' : socket === 'connecting' ? 'Menyambung…' : 'Offline'}</p></div>
          <Link to="/app/settings" aria-label="Akun" className="rounded-full ring-2 ring-white/30"><Avatar name={user?.name ?? '?'} size={46} /></Link>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2.5">
          {[['bg-[#FF5C61]', r.NEW ?? 0, 'Laporan Baru'], ['bg-[#13B77D]', d.vehicles.active, 'Kendaraan'], ['bg-[#F5A524]', d.calls.missed, 'Tak Terjawab']].map(([c, v, l]) => (
            <div key={l as string} className="glass rounded-2xl p-3.5"><span className={cx('block h-2 w-2 rounded-full', c as string)} /><p className="mt-3 font-display text-[30px] font-bold leading-none">{v as number}</p><p className="mt-1 text-xs text-white/60">{l as string}</p></div>))}
        </div>
      </section>

      <div className="space-y-5 px-4 pt-5 lg:px-0 lg:pt-0">
        <InstallCard />
        {d.vehicles.total === 0 ? (
          <Empty icon={<Car />} title="Mulai dengan menambahkan kendaraan" action={<LinkButton to="/app/vehicles" size="lg"><Plus className="h-4 w-4" />Tambah kendaraan</LinkButton>}>Setelah ditambahkan, Anda mendapat QR unik untuk dicetak dan ditempel pada kendaraan.</Empty>
        ) : (<>
          {/* ---------- Desktop: 4 kartu statistik ---------- */}
          <div className="hidden gap-4 lg:grid lg:grid-cols-4">
            <Stat tone="blue" icon={<Inbox />} value={d.reports_total} label="Total Laporan" sub={`+${d.reports_today} hari ini`} />
            <Stat tone="green" icon={<Car />} value={d.vehicles.active} label="Kendaraan Aktif" sub={`dari ${d.vehicles.total} terdaftar`} />
            <Stat tone="amber" icon={<Phone />} value={d.calls.total} label="Panggilan Masuk" sub={`${d.calls.missed} tak terjawab`} />
            <Stat tone="violet" icon={<Bell />} value={d.notifications.rate == null ? '—' : `${d.notifications.rate}%`} label="Notifikasi Terkirim" sub={`${d.notifications.failed} gagal bulan ini`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <section aria-labelledby="recent">
              <div className="mb-3 flex items-center justify-between"><h2 id="recent" className="font-display text-xl font-bold">Laporan Terbaru</h2><Link to="/app/reports" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">Lihat semua <ArrowRight className="h-4 w-4" /></Link></div>
              {recent.length === 0 ? <Empty icon={<Inbox />} title="Belum ada laporan">Laporan dari pemindai QR akan muncul di sini.</Empty> : <>
                <div className="space-y-3 lg:hidden">{recent.map((x) => <ReportRow key={x.id} r={x} />)}</div>
                <div className="card hidden overflow-hidden lg:block">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="text-xs font-semibold text-muted"><th className="px-5 py-4">Kategori</th><th className="py-4">Kendaraan</th><th className="py-4">Waktu</th><th className="px-5 py-4">Status</th></tr></thead>
                    <tbody className="px-2">{recent.map((x) => (
                      <tr key={x.id} onClick={() => nav(`/app/reports/${x.id}`)} className="cursor-pointer border-t border-line/60 transition hover:bg-brand-soft/50">
                        <td className="px-5 py-3.5"><span className="inline-flex items-center gap-2.5 font-semibold"><CatDot code={x.category} />{CAT_LABEL[x.category] ?? x.category}{x.urgent && <UrgentTag />}</span></td>
                        <td className="py-3.5 text-ink-3">{x.plate_number}</td><td className="py-3.5 text-muted">{timeAgo(x.created_at)}</td>
                        <td className="px-5 py-3.5"><StatusBadge status={x.status} label={STATUS_LABEL[x.status]} /></td></tr>))}</tbody>
                  </table>
                </div></>}
            </section>
            <aside className="card hidden self-start p-5 lg:block" aria-labelledby="act">
              <h2 id="act" className="font-display text-xl font-bold">Aktivitas Terkini</h2>
              <ul className="mt-4 space-y-4">
                {d.activity.length === 0 && <li className="text-sm text-muted">Belum ada aktivitas.</li>}
                {d.activity.map((a: any, i: number) => { const m = ACT_ICON[a.type] ?? ACT_ICON.report; return (
                  <li key={i} className="flex gap-3"><IconTile tone={m.tone} className="h-10 w-10 !rounded-full opacity-90"><m.icon /></IconTile>
                    <div className="min-w-0"><p className="text-[14px] font-bold leading-tight">{a.title}</p><p className="truncate text-[13px] text-muted">{a.subtitle}</p><p className="text-xs text-muted/80">{timeAgo(a.at)}</p></div></li>); })}
              </ul>
            </aside>
          </div>
        </>)}
      </div>
    </div>
  );
}
