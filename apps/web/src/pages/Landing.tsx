import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, BellRing, Camera, Check, EyeOff, Mic, PhoneCall, QrCode, ScanLine, ShieldCheck, X } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Phone } from '../components/Phone';
import { LinkButton } from '../components/ui';
import { useAuth } from '../lib/auth';

function PhoneScan() {
  return (
    <Phone dark>
      <div className="px-4 pt-6">
        <p className="text-[22px] font-medium leading-[1.15] tracking-tight">Parkir menghalangi?<br />Hubungi pemilik<br />tanpa ribet.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-gradient-to-br from-[#d9d3c7] to-[#8f8a80] p-2.5 text-ink"><div className="plate px-1.5 py-0.5 text-center text-[10px] font-extrabold">B 1234 XYZ</div><p className="mt-9 text-[9px] font-semibold opacity-70">Toyota Avanza · Putih</p></div>
          <div className="rounded-2xl bg-white/10 p-2.5"><div className="grid h-7 w-7 place-items-center rounded-full bg-white/15"><Camera className="h-3.5 w-3.5" /></div><p className="mt-3 text-[10px] font-semibold leading-tight">Kirim laporan<br />+ foto</p><p className="mt-1 text-[8px] opacity-50">Tanpa akun</p></div>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white/10 p-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-mint text-[11px] font-bold text-ink">BS</div>
          <div className="flex-1 leading-tight"><p className="text-[10px] font-bold">Budi S.</p><p className="text-[8px] opacity-50">siap dihubungi</p></div>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-coral"><X className="h-3.5 w-3.5" /></span><span className="grid h-7 w-7 place-items-center rounded-full bg-white text-ink"><Check className="h-3.5 w-3.5" /></span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="h-[72px] rounded-2xl bg-gradient-to-br from-[#e8d9c2] to-[#b69a78]" /><div className="h-[72px] rounded-2xl bg-gradient-to-br from-[#c9d6e2] to-[#7f95ab]" />
        </div>
        <div className="mt-3 rounded-full bg-white py-2.5 text-center text-[11px] font-bold text-ink">Pindai QR sekarang</div>
      </div>
    </Phone>
  );
}
function PhoneReports() {
  return (
    <Phone className="md:mt-10">
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-line px-2.5 py-1.5"><span className="grid h-5 w-5 place-items-center rounded-full bg-coral-soft"><PhoneCall className="h-2.5 w-2.5 text-coral-deep" /></span><div className="flex-1 leading-none"><p className="text-[8.5px] font-bold">Panggilan masuk · B 1234 XYZ</p><p className="mt-0.5 text-[7px] text-muted">Berdering sekarang</p></div><span className="h-5 w-5 rounded-full bg-mint" /></div>
        <p className="mt-4 text-[10px] text-muted">Halo, Budi</p>
        <p className="text-[24px] font-semibold leading-none tracking-tight">Laporan Masuk</p>
        <div className="mt-3 flex gap-1 text-[9px] font-semibold"><span className="rounded-full bg-ink px-2.5 py-1 text-white">Baru</span><span className="px-2 py-1 text-muted">Diproses</span><span className="px-2 py-1 text-muted">Selesai</span><span className="px-2 py-1 text-muted">Arsip</span></div>
        <div className="mt-2 space-y-2">
          <div className="rounded-2xl bg-mint p-3"><div className="flex items-center justify-between text-[8px] text-ink/60"><span className="rounded-full bg-white/60 px-1.5 py-0.5">Hari ini · 09.12</span><span>⚙</span></div><p className="mt-2 text-[11px] font-bold">Menghalangi akses</p><p className="text-[8.5px] text-ink/60">B 1234 XYZ · 2 foto</p><p className="mt-1 text-right text-[8px] font-bold text-coral-deep">5 menit lalu</p></div>
          <div className="rounded-2xl bg-paper p-3"><p className="text-[8px] text-muted">Kemarin · 18.40</p><p className="mt-1 text-[11px] font-bold">Lampu menyala</p><p className="text-[8.5px] text-muted">D 5678 ABC</p></div>
          <div className="rounded-3xl bg-ink p-2.5 text-white"><p className="px-1 text-[8px] opacity-60">Diproses · 2 hari lalu</p><p className="px-1 text-[11px] font-bold">Parkir menutup garasi</p><div className="mt-2 flex items-center justify-between rounded-2xl bg-white/10 px-2.5 py-2"><div className="leading-tight"><p className="text-[9px] font-bold">Buka detail</p><p className="text-[7px] opacity-50">Ref. VCS-7K2M9QX4PA</p></div><span className="grid h-6 w-6 place-items-center rounded-full bg-white text-ink"><ArrowRight className="h-3 w-3" /></span></div></div>
        </div>
      </div>
    </Phone>
  );
}
function PhoneCall_() {
  return (
    <Phone>
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-paper text-[10px]">‹</span><div className="leading-tight"><p className="text-[11px] font-bold">B 1234 XYZ</p><p className="text-[8px] text-muted">Panggilan internet</p></div></div>
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-paper p-2"><div className="leading-tight flex-1"><p className="text-[10px] font-bold">Pengunjung</p><p className="text-[8px] text-muted">ingin berbicara dengan Anda</p></div><span className="grid h-6 w-6 place-items-center rounded-full bg-coral text-white"><X className="h-3 w-3" /></span><span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-white"><Check className="h-3 w-3" /></span></div>
        <div className="relative mt-3 grid h-[250px] place-items-center overflow-hidden rounded-3xl bg-gradient-to-b from-[#cfd8d2] to-[#8fa497]">
          <div className="absolute left-2 top-2 rounded-full bg-white/80 px-2 py-0.5 text-[8px] font-bold">Terhubung</div><div className="absolute right-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-[8px] font-bold text-white">02:14</div>
          <div className="relative grid h-20 w-20 place-items-center"><span className="absolute inset-0 animate-ring rounded-full bg-white/60" /><span className="relative grid h-16 w-16 place-items-center rounded-full bg-white text-[18px] font-bold">P</span></div>
          <div className="absolute inset-x-2 bottom-2 rounded-xl bg-white/85 px-2.5 py-1.5 text-[8px]"><b>Pengunjung:</b> "Mobilnya menghalangi pintu keluar, Pak."</div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-full bg-paper p-1.5"><span className="grid h-8 w-8 place-items-center rounded-full"><Mic className="h-3.5 w-3.5" /></span><span className="grid h-8 w-8 place-items-center rounded-full"><Camera className="h-3.5 w-3.5" /></span><span className="grid h-8 w-12 place-items-center rounded-full bg-ink text-[12px] font-bold text-white">•••</span><span className="grid h-8 w-12 place-items-center rounded-full bg-coral text-white"><PhoneCall className="h-3.5 w-3.5 rotate-[135deg]" /></span></div>
      </div>
    </Phone>
  );
}

const steps = [
  { icon: QrCode, t: 'Tempel QR', d: 'Buat QR unik untuk tiap kendaraan, unduh PNG/SVG, lalu tempel di kaca atau bodi.' },
  { icon: ScanLine, t: 'Orang memindai', d: 'Cukup kamera ponsel. Tanpa aplikasi, tanpa akun, tanpa mendaftar.' },
  { icon: BellRing, t: 'Anda langsung tahu', d: 'Laporan dan panggilan masuk ke dashboard, WhatsApp, dan Telegram Anda.' },
];

/** Aplikasi terpasang (APK Capacitor / WebView Android / PWA standalone): bukan pengunjung situs. */
const isInstalledApp = () => {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.() || /; wv\)/.test(navigator.userAgent) || matchMedia('(display-mode: standalone)').matches;
  } catch { return false; }
};

export default function Landing() {
  const { user, loading } = useAuth();
  // Panggilan masuk hanya berdering bila soket tersambung (dashboard). Di aplikasi terpasang, langsung ke dashboard.
  if (!loading && user && isInstalledApp()) return <Navigate to={user.is_admin ? '/admin' : '/app'} replace />;
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? <LinkButton to={user.is_admin ? '/admin' : '/app'} size="sm">Buka dashboard</LinkButton> : <>
            <LinkButton to="/login" variant="ghost" size="sm">Masuk</LinkButton>
            <LinkButton to="/register" size="sm">Daftar gratis</LinkButton></>}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-10 pt-6 sm:pt-14">
        <div className="mx-auto max-w-3xl text-center animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold shadow-card"><EyeOff className="h-3.5 w-3.5" aria-hidden /> Nomor pribadi Anda tidak pernah ditampilkan</span>
          <h1 className="mt-6 text-[40px] font-semibold leading-[1.18] tracking-tight sm:text-6xl sm:leading-[1.14] lg:text-7xl lg:leading-[1.12]">Hubungi pemilik kendaraan,<br /><span className="bg-gradient-to-t from-mint to-mint bg-[length:100%_48%] bg-bottom bg-no-repeat px-1 [box-decoration-break:clone]">cukup dengan satu pindai.</span></h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-ink/70">Tempel QR di kendaraan Anda. Siapa pun yang menghalangi jalan atau melihat lampu menyala bisa mengirim pesan, foto, atau menelepon lewat internet — tanpa tahu nomor Anda.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton to={user ? '/app/vehicles' : '/register'} size="lg">Buat QR kendaraan <ArrowRight className="h-4 w-4" /></LinkButton>
            <LinkButton to="/login" variant="light" size="lg">Saya sudah punya akun</LinkButton>
          </div>
        </div>

        <div className="relative mt-14 flex items-start justify-center gap-6 md:mt-20 md:gap-10" style={{ perspective: 1200 }}>
          <div className="hidden md:block -rotate-3 animate-rise" style={{ animationDelay: '.1s' }}><PhoneScan /></div>
          <div className="animate-rise" style={{ animationDelay: '.2s' }}><PhoneReports /></div>
          <div className="hidden md:block rotate-3 animate-rise" style={{ animationDelay: '.3s' }}><PhoneCall_ /></div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className="eyebrow">Cara kerjanya</p>
        <h2 className="mt-2 max-w-xl text-4xl font-semibold sm:text-5xl">Tiga langkah, selesai dalam menit.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.t} className={i === 1 ? 'card-dark p-7' : i === 0 ? 'card-mint p-7' : 'card p-7'}>
              <div className={`grid h-12 w-12 place-items-center rounded-full ${i === 1 ? 'bg-white/15' : 'bg-ink text-white'}`}><s.icon className="h-5 w-5" /></div>
              <p className="mt-10 text-sm font-semibold opacity-60">0{i + 1}</p>
              <h3 className="mt-1 text-2xl font-semibold">{s.t}</h3><p className={`mt-2 ${i === 1 ? 'text-white/70' : 'text-ink/70'}`}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-4 md:grid-cols-6">
          <div className="card p-8 md:col-span-4">
            <h3 className="text-3xl font-semibold">Laporan lengkap dengan foto</h3>
            <p className="mt-3 max-w-lg text-ink/70">Pilih kategori — parkir, akses terhalang, lampu menyala, darurat — tulis pesan, lampirkan hingga 3 foto. Data lokasi (GPS) di foto dihapus otomatis untuk melindungi pelapor.</p>
            <div className="mt-6 flex flex-wrap gap-2">{['Menghalangi parkir', 'Menghalangi akses', 'Lampu menyala', 'Darurat', 'Dugaan kerusakan'].map((c) => <span key={c} className="rounded-full bg-paper px-3.5 py-2 text-sm font-semibold">{c}</span>)}</div>
          </div>
          <div className="card-dark p-8 md:col-span-2"><PhoneCall className="h-8 w-8 text-mint" /><h3 className="mt-8 text-2xl font-semibold">Panggil lewat internet</h3><p className="mt-2 text-white/70">Suara dua arah langsung dari browser, tanpa menampilkan nomor siapa pun.</p></div>
          <div className="card-mint p-8 md:col-span-2"><ShieldCheck className="h-8 w-8" /><h3 className="mt-8 text-2xl font-semibold">Privasi sejak awal</h3><p className="mt-2 text-ink/70">Token QR 256-bit, bisa dicabut kapan saja. Anti-spam dan blokir sumber.</p></div>
          <div className="card p-8 md:col-span-4"><h3 className="text-3xl font-semibold">Notifikasi ke tempat Anda berada</h3><p className="mt-3 max-w-lg text-ink/70">WhatsApp, Telegram, dan dashboard. Jika satu kanal gagal, kanal lain tetap terkirim — dengan percobaan ulang otomatis.</p>
            <div className="mt-6 flex gap-2"><span className="rounded-full bg-mint px-3.5 py-2 text-sm font-semibold text-mint-deep">WhatsApp</span><span className="rounded-full bg-sky-soft px-3.5 py-2 text-sm font-semibold text-sky-deep">Telegram</span><span className="rounded-full bg-paper px-3.5 py-2 text-sm font-semibold">Dashboard</span></div></div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="card-dark relative overflow-hidden px-8 py-14 text-center sm:py-20">
          <h2 className="mx-auto max-w-2xl text-4xl font-semibold sm:text-5xl">Pasang QR hari ini, tenang di jalan.</h2>
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
