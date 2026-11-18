import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, BellRing, EyeOff, Mail, PhoneCall, QrCode, ScanLine, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Logo';
import { LinkButton } from '../components/ui';
import { useAuth } from '../lib/auth';

const steps = [
  { icon: QrCode, t: 'Tempel QR', d: 'Buat QR unik untuk tiap kendaraan, unduh PNG/SVG, lalu tempel di kaca atau bodi.' },
  { icon: ScanLine, t: 'Orang memindai', d: 'Cukup kamera ponsel. Tanpa aplikasi, tanpa akun, tanpa mendaftar.' },
  { icon: BellRing, t: 'Anda langsung tahu', d: 'Laporan, panggilan, dan notifikasi mendesak masuk ke aplikasi, WhatsApp, Telegram, dan Email.' },
];

/** Aplikasi terpasang (WebView Android / PWA standalone): bukan pengunjung situs. */
const isInstalledApp = () => {
  try { return !!(window as any).Capacitor?.isNativePlatform?.() || /; wv\)/.test(navigator.userAgent) || matchMedia('(display-mode: standalone)').matches; } catch { return false; }
};

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user && isInstalledApp()) return <Navigate to={user.is_admin ? '/admin' : '/app'} replace />;
  return (
    <div className="min-h-dvh overflow-x-hidden bg-paper">
      <section className="hero rounded-b-[40px] pb-16">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 safe-top">
          <Logo />
          <nav className="flex items-center gap-2">
            {user ? <LinkButton to={user.is_admin ? '/admin' : '/app'} variant="light" size="sm">Buka dashboard</LinkButton> : <>
              <LinkButton to="/login" variant="ghost" size="sm" className="!text-white hover:!bg-white/10">Masuk</LinkButton>
              <LinkButton to="/register" variant="light" size="sm">Daftar gratis</LinkButton></>}
          </nav>
        </header>
        <div className="mx-auto max-w-3xl px-5 pt-10 text-center animate-rise sm:pt-16">
          <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold"><EyeOff className="h-3.5 w-3.5" aria-hidden /> Nomor pribadi Anda tidak pernah ditampilkan</span>
          <h1 className="mt-6 font-display text-[40px] font-bold leading-[1.1] sm:text-6xl">Hubungi pemilik kendaraan, cukup dengan satu pindai.</h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/70">Tempel QR di kendaraan Anda. Siapa pun yang menghalangi jalan atau melihat lampu menyala bisa mengirim laporan, notifikasi mendesak layar penuh, atau menelepon lewat internet — tanpa tahu nomor Anda.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton to={user ? '/app/vehicles' : '/register'} variant="light" size="lg">Buat QR kendaraan <ArrowRight className="h-4 w-4" /></LinkButton>
            {!user && <LinkButton to="/login" variant="ghost" size="lg" className="!text-white hover:!bg-white/10">Saya sudah punya akun</LinkButton>}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className="eyebrow">Cara kerjanya</p>
        <h2 className="mt-2 max-w-xl font-display text-4xl font-bold sm:text-5xl">Tiga langkah, selesai dalam menit.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.t} className="card p-7">
              <div className="btn-primary grid h-12 w-12 place-items-center rounded-2xl"><s.icon className="h-5 w-5" /></div>
              <p className="mt-8 text-sm font-semibold text-muted">0{i + 1}</p>
              <h3 className="mt-1 font-display text-2xl font-bold">{s.t}</h3><p className="mt-2 text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-4 md:grid-cols-6">
          <div className="card p-8 md:col-span-4">
            <h3 className="font-display text-3xl font-bold">Laporan lengkap dengan foto</h3>
            <p className="mt-3 max-w-lg text-muted">Pilih kategori, tulis pesan, lampirkan hingga 3 foto. Data lokasi (GPS) di foto dihapus otomatis untuk melindungi privasi.</p>
            <div className="mt-6 flex flex-wrap gap-2">{['Menghalangi parkir', 'Menghalangi akses', 'Lampu menyala', 'Darurat', 'Dugaan kerusakan'].map((c) => <span key={c} className="rounded-full bg-brand-soft px-3.5 py-2 text-sm font-semibold text-navy-700">{c}</span>)}</div>
          </div>
          <div className="hero rounded-3xl p-8 md:col-span-2"><BellRing className="h-8 w-8" /><h3 className="mt-8 font-display text-2xl font-bold">Notifikasi mendesak</h3><p className="mt-2 text-white/70">Layar penuh ala panggilan di ponsel pemilik — tanpa audio, tanpa biaya TURN.</p></div>
          <div className="card p-8 md:col-span-2"><PhoneCall className="h-8 w-8 text-mint-deep" /><h3 className="mt-8 font-display text-2xl font-bold">Panggil lewat internet</h3><p className="mt-2 text-muted">Suara dua arah langsung dari browser, tanpa menampilkan nomor siapa pun.</p></div>
          <div className="card p-8 md:col-span-4"><ShieldCheck className="h-8 w-8 text-brand" /><h3 className="mt-6 font-display text-3xl font-bold">Privasi &amp; kanal notifikasi</h3><p className="mt-3 max-w-lg text-muted">Token QR 256-bit yang dapat dicabut, anti-spam, dan notifikasi ke WhatsApp, Telegram, atau Email — dengan percobaan ulang otomatis.</p>
            <div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full bg-mint px-3.5 py-2 text-sm font-semibold text-mint-deep">WhatsApp</span><span className="rounded-full bg-sky-soft px-3.5 py-2 text-sm font-semibold text-sky-deep">Telegram</span><span className="inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-3.5 py-2 text-sm font-semibold text-amber-deep"><Mail className="h-3.5 w-3.5" />Email</span></div></div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="hero rounded-[32px] px-8 py-14 text-center sm:py-20">
          <h2 className="mx-auto max-w-2xl font-display text-4xl font-bold sm:text-5xl">Pasang QR hari ini, tenang di jalan.</h2>
          <p className="mx-auto mt-4 max-w-md text-white/70">Gratis untuk memulai. Satu akun bisa mengelola banyak kendaraan.</p>
          <div className="mt-8 flex justify-center"><LinkButton to="/register" variant="light" size="lg">Mulai sekarang <ArrowRight className="h-4 w-4" /></LinkButton></div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 pb-10 text-sm text-muted sm:flex-row">
        <span>© {new Date().getFullYear()} Vehicle Contact System</span>
        <div className="flex gap-5"><Link to="/privasi" className="hover:text-ink">Kebijakan privasi</Link><Link to="/penyalahgunaan" className="hover:text-ink">Laporkan penyalahgunaan</Link><Link to="/admin/login" className="hover:text-ink">Admin</Link></div>
      </footer>
    </div>
  );
}
