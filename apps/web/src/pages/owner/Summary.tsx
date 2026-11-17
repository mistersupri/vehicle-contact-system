import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Car, Download, FileText, PhoneMissed, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDuration } from '../../lib/utils';
import { Button, Empty, LinkButton, PageHeader, PageLoader } from '../../components/ui';
import { ReportRow } from '../../components/ReportRow';
import type { Report } from '../../lib/types';

function greeting() { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'; }

function InstallCard() {
  const [ev, setEv] = useState<any>(null);
  useEffect(() => { const h = (e: Event) => { e.preventDefault(); setEv(e); }; window.addEventListener('beforeinstallprompt', h); return () => window.removeEventListener('beforeinstallprompt', h); }, []);
  if (!ev) return null;
  return <div className="card flex items-center gap-4 p-4"><span className="grid h-12 w-12 place-items-center rounded-full bg-mint"><Download className="h-5 w-5" /></span><div className="flex-1"><p className="font-bold">Pasang aplikasi</p><p className="text-sm text-muted">Akses cepat dari layar utama dan notifikasi lebih andal.</p></div><Button size="sm" onClick={() => { ev.prompt(); setEv(null); }}>Pasang</Button></div>;
}

export default function Summary() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['summary'], queryFn: () => api<any>('/dashboard/summary') });
  if (q.isLoading) return <PageLoader />;
  const d = q.data; const r = d.reports as Record<string, number>;
  const open = r.NEW + r.READ + r.IN_PROGRESS;
  const days = Array.from({ length: 7 }, (_, i) => { const dt = new Date(Date.now() - (6 - i) * 86400000); const key = dt.toISOString().slice(0, 10); return { key, label: dt.toLocaleDateString('id-ID', { weekday: 'short' }), n: d.reports_per_day.find((x: any) => x.d === key)?.c ?? 0 }; });
  const max = Math.max(1, ...days.map((x) => x.n));

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={`${greeting()}, ${user?.name.split(' ')[0]}`} title="Ringkasan" action={<LinkButton to="/app/vehicles" size="sm" className="hidden sm:inline-flex"><Plus className="h-4 w-4" />Kendaraan</LinkButton>} />
      <InstallCard />
      {d.vehicles.total === 0 ? (
        <Empty icon={<Car />} title="Mulai dengan menambahkan kendaraan" action={<LinkButton to="/app/vehicles" size="lg"><Plus className="h-4 w-4" />Tambah kendaraan</LinkButton>}>Setelah ditambahkan, Anda mendapat QR unik untuk dicetak dan ditempel pada kendaraan.</Empty>
      ) : (<>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Link to="/app/reports" className="card-mint relative col-span-2 overflow-hidden p-5 sm:col-span-1 sm:p-6"><p className="text-sm font-semibold text-ink/60">Laporan baru</p><p className="mt-4 text-6xl font-semibold sm:mt-6 sm:text-7xl leading-none tracking-tight">{r.NEW}</p><p className="mt-3 text-sm text-ink/60">{open} masih terbuka</p><ArrowRight className="absolute right-5 top-5 h-5 w-5" /></Link>
          <div className="card-dark p-5 sm:p-6"><p className="text-sm font-semibold text-white/55">Kendaraan aktif</p><p className="mt-4 text-6xl font-semibold sm:mt-6 sm:text-7xl leading-none tracking-tight">{d.vehicles.active}</p><p className="mt-3 text-sm text-white/55">dari {d.vehicles.total} terdaftar</p></div>
          <Link to="/app/calls" className="card p-5 sm:p-6"><p className="flex items-center gap-1.5 text-sm font-semibold text-muted"><PhoneMissed className="h-4 w-4" />Panggilan tak terjawab</p><p className="mt-4 text-6xl font-semibold sm:mt-6 sm:text-7xl leading-none tracking-tight">{d.calls.missed}</p><p className="mt-3 text-sm text-muted">{d.calls.total} panggilan · {fmtDuration(d.calls.seconds)} total</p></Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section aria-labelledby="recent">
            <div className="mb-3 mt-4 flex items-center justify-between"><h2 id="recent" className="text-xl font-bold">Laporan terbaru</h2><Link to="/app/reports" className="text-sm font-semibold underline-offset-4 hover:underline">Lihat semua</Link></div>
            {d.recent_reports.length === 0 ? <Empty icon={<FileText />} title="Belum ada laporan">Laporan dari pemindai QR akan muncul di sini.</Empty> : <div className="space-y-2.5">{d.recent_reports.map((x: Report) => <ReportRow key={x.id} r={x} />)}</div>}
          </section>
          <aside className="space-y-4 lg:pt-[52px]">
            <div className="card p-5"><h3 className="font-bold">7 hari terakhir</h3>
              <div className="mt-5 flex h-28 items-end gap-2" role="img" aria-label={`Laporan 7 hari terakhir: ${days.map((x) => `${x.label} ${x.n}`).join(', ')}`}>
                {days.map((x) => <div key={x.key} className="flex flex-1 flex-col items-center gap-1.5"><span className="text-[11px] font-bold">{x.n || ''}</span><div className="w-full rounded-full bg-ink transition-all" style={{ height: `${Math.max(x.n ? 12 : 4, (x.n / max) * 72)}px`, opacity: x.n ? 1 : 0.12 }} /><span className="text-[10px] text-muted">{x.label}</span></div>)}
              </div></div>
            <div className="card p-5"><h3 className="font-bold">Status laporan</h3>
              <ul className="mt-3 space-y-2.5 text-sm">{([['NEW', 'Baru'], ['READ', 'Dibaca'], ['IN_PROGRESS', 'Diproses'], ['RESOLVED', 'Selesai']] as const).map(([k, l]) => <li key={k} className="flex items-center justify-between"><span className="text-muted">{l}</span><span className="font-bold">{r[k]}</span></li>)}</ul></div>
          </aside>
        </div>
      </>)}
    </div>
  );
}
