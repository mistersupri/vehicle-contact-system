import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Ban, BellRing, Camera, Check, Copy, Ellipsis, Headphones, ImagePlus, Lightbulb, Loader2, Lock, MessageSquarePlus, MicOff, Palette, Phone, PhoneForwarded, PhoneOff, QrCode, Send, Shield, ShieldAlert, TriangleAlert, User, X, Bell, ParkingCircle } from 'lucide-react';
import { api, ApiError, errMsg } from '../lib/api';
import type { Category } from '../lib/types';
import { CAT_LABEL, CAT_SHORT, cx } from '../lib/utils';
import { useCaller } from '../lib/webrtc';
import { ActiveUi, CallAvatar, CallShell, RoundAction, VehicleChip } from '../components/CallUi';
import { Button, ErrorNote, Field, Input, Notice, PageLoader, Plate, Sheet, Textarea, VehicleIcon } from '../components/ui';

interface PublicInfo {
  active: boolean; plate_masked?: string;
  vehicle: { plate_number: string; vehicle_type: string; brand: string | null; model: string | null; color: string | null; owner_display_name: string };
  categories: Category[]; limits: { message_max: number; photos_max: number; photo_bytes_max: number };
  calls: { webrtc_enabled: boolean; webrtc_available: boolean; webrtc_unavailable_reason: string | null; pstn_available: boolean; alerts_available: boolean };
}
const CAT_ICON: Record<string, typeof Ban> = { PARKING: ParkingCircle, ACCESS: Ban, LIGHT: Lightbulb, EMERGENCY: TriangleAlert, DAMAGE: ShieldAlert, OTHER: Ellipsis };

export default function PublicVehicle() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['public', token], queryFn: () => api<PublicInfo>(`/public/vehicles/${token}`), retry: false, refetchInterval: 20_000 });
  const [report, setReport] = useState(false); const [pstn, setPstn] = useState(false); const [calling, setCalling] = useState(false); const [urgent, setUrgent] = useState(false);

  if (q.isLoading) return <PageLoader />;
  if (q.error) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <Frame><Status icon={<QrCode />} title={nf ? 'QR tidak dikenali' : 'Gagal memuat halaman'}>{nf ? 'Kode QR ini tidak terdaftar. Pastikan Anda memindai QR yang benar.' : errMsg(q.error)}{!nf && <div className="mt-5"><Button onClick={() => q.refetch()}>Coba lagi</Button></div>}</Status></Frame>;
  }
  const d = q.data!;
  if (!d.active) return <Frame><Status icon={<PhoneOff />} title="QR ini sedang tidak aktif" tone="amber">Kendaraan {d.plate_masked} tidak menerima laporan atau panggilan saat ini. Pemilik mungkin telah mengganti atau menonaktifkan QR-nya.</Status></Frame>;
  const v = d.vehicle; const c = d.calls;
  const reason: Record<string, string> = { OWNER_OFFLINE: 'Pemilik sedang tidak online', QUIET_HOURS: 'Pemilik sedang dalam jam tenang', WEBRTC_DISABLED: 'Panggilan internet dinonaktifkan' };
  const detail = [v.vehicle_type, [v.brand, v.model].filter(Boolean).join(' '), v.color].filter(Boolean);

  const Summary = ({ onHero }: { onHero: boolean }) => (
    <div className="flex flex-col items-center text-center">
      <span className={cx('grid h-20 w-20 place-items-center rounded-3xl [&>svg]:h-9 [&>svg]:w-9', onHero ? 'border border-white/15 bg-white/10 text-white' : 'btn-primary')}><VehicleIcon type={v.vehicle_type} /></span>
      <h1 className={cx('mt-5 font-display text-[30px] font-bold leading-tight', onHero ? 'text-white' : 'text-ink')}>{v.owner_display_name}</h1>
      <Plate value={v.plate_number} tone={onHero ? 'dark' : 'light'} className="mt-4 !px-6 !py-2.5 !text-[22px]" />
      <div className="mt-4 flex flex-wrap justify-center gap-2">{detail.map((x) => <span key={x} className={cx('rounded-full px-3.5 py-1.5 text-[13px] font-medium', onHero ? 'border border-white/10 bg-white/10 text-white/85' : 'bg-[#EEF3FA] text-muted')}>{x}</span>)}</div>
    </div>
  );
  const Privacy = () => <div className="flex items-center gap-2.5 rounded-2xl bg-brand-soft px-4 py-3 text-[13.5px] font-medium text-navy-700"><Lock className="h-4 w-4 shrink-0" aria-hidden />Data pribadi pemilik tidak ditampilkan</div>;

  const options = (
    <div className="space-y-3">
      <Option primary icon={<MessageSquarePlus />} title="Kirim Laporan" desc="Tulis pesan dan lampirkan foto untuk pemilik kendaraan" onClick={() => setReport(true)} />
      {c.webrtc_enabled && <Option tone="green" icon={<Phone />} title="Panggil via Internet" desc={c.webrtc_available ? 'Panggilan audio gratis melalui WebRTC' : (reason[c.webrtc_unavailable_reason ?? ''] ?? 'Tidak tersedia')} disabled={!c.webrtc_available} onClick={() => setCalling(true)} />}
      {c.alerts_available && <Option tone="red" icon={<BellRing />} title="Notifikasi Mendesak" desc="Layar penuh di ponsel pemilik · tanpa suara panggilan" onClick={() => setUrgent(true)} />}
      {c.pstn_available && <Option tone="amber" icon={<PhoneForwarded />} title="Telepon Biasa" desc="Mungkin dikenakan biaya pulsa operator" onClick={() => setPstn(true)} />}
    </div>
  );
  const footer = <footer className="mt-8 flex justify-center gap-5 pb-8 text-[13px] text-muted"><Link to="/penyalahgunaan?t=" onClick={(e) => { e.preventDefault(); location.href = `/penyalahgunaan?t=${token}`; }} className="hover:text-ink">Laporkan penyalahgunaan</Link><span className="text-line">|</span><Link to="/privasi" className="hover:text-ink">Kebijakan Privasi</Link></footer>;

  return (
    <div className="min-h-dvh bg-paper">
      {/* Mobile */}
      <div className="lg:hidden">
        <section className="hero rounded-b-[32px] px-5 pb-8 pt-5 safe-top animate-rise">
          <p className="mb-6 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[.18em] text-white/55"><Shield className="h-3.5 w-3.5" />Vehicle Contact</p>
          <Summary onHero />
        </section>
        <div className="mx-auto max-w-md px-5 pt-5"><Privacy /><h2 className="mb-3 mt-6 font-display text-xl font-bold">Hubungi Pemilik</h2>{options}{footer}</div>
      </div>
      {/* Desktop */}
      <div className="hidden lg:block">
        <div className="hero absolute inset-x-0 top-0 h-[360px]" aria-hidden />
        <header className="relative z-10 mx-auto flex max-w-[1100px] items-center justify-between px-6 py-5">
          <span className="inline-flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-navy-900 text-white"><Shield className="h-[18px] w-[18px]" /></span><span className="font-display font-bold text-white">Vehicle Contact System</span></span>
          <nav className="flex gap-5 text-sm text-white/65"><Link to="/privasi" className="hover:text-white">Kebijakan Privasi</Link><Link to={`/penyalahgunaan?t=${token}`} className="hover:text-white">Laporkan Penyalahgunaan</Link></nav>
        </header>
        <main className="relative z-10 mx-auto mt-4 grid max-w-[880px] grid-cols-[400px_1fr] items-start gap-8 px-6">
          <section className="card p-8"><Summary onHero={false} /><div className="mt-6"><Privacy /></div></section>
          <section className="card p-7"><h2 className="font-display text-2xl font-bold">Hubungi Pemilik</h2><p className="mb-5 mt-1 text-sm text-muted">Pilih cara untuk menghubungi pemilik kendaraan ini</p>{options}</section>
        </main>
      </div>

      <ReportSheet open={report} onClose={() => setReport(false)} token={token} info={d} />
      <UrgentSheet open={urgent} onClose={() => setUrgent(false)} token={token} info={d} onFallback={() => { setUrgent(false); setReport(true); }} />
      <PstnSheet open={pstn} onClose={() => setPstn(false)} token={token} onFallback={() => { setPstn(false); setReport(true); }} />
      {calling && <CallScreen token={token} plate={v.plate_number} onClose={() => setCalling(false)} onFallback={() => { setCalling(false); setReport(true); }} />}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper"><div className="hero h-40 rounded-b-[32px]" /><div className="-mt-24 mx-auto max-w-md px-5">{children}</div></div>;
}
function Status({ icon, title, children, tone = 'blue' }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: 'blue' | 'amber' }) {
  return <div className="card p-8 text-center"><div className={cx('mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl [&>svg]:h-7 [&>svg]:w-7', tone === 'amber' ? 'bg-amber-soft text-amber-deep' : 'bg-brand-soft text-brand')}>{icon}</div><h1 className="font-display text-2xl font-bold">{title}</h1><p className="mt-2 text-muted">{children}</p></div>;
}

function Option({ icon, title, desc, onClick, disabled, primary, tone = 'blue' }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void; disabled?: boolean; primary?: boolean; tone?: 'blue' | 'green' | 'red' | 'amber' }) {
  const t = { blue: 'bg-brand-soft text-brand', green: 'bg-mint text-mint-deep', red: 'bg-coral-soft text-coral-deep', amber: 'bg-amber-soft text-amber-deep' }[tone];
  return (
    <button onClick={onClick} disabled={disabled} className={cx('flex w-full items-center gap-4 rounded-3xl p-4 text-left transition active:scale-[.99] disabled:opacity-55', primary ? 'btn-primary' : 'border border-line bg-white shadow-card hover:border-brand/40')}>
      <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl [&>svg]:h-6 [&>svg]:w-6', primary ? 'bg-white/20 text-white' : t)}>{icon}</span>
      <span className="min-w-0 flex-1"><span className={cx('block font-display text-[17px] font-bold leading-tight', !primary && 'text-ink')}>{title}</span><span className={cx('mt-0.5 block text-[13px] leading-snug', primary ? 'text-white/75' : 'text-muted')}>{desc}</span></span>
      <ArrowRight className={cx('h-5 w-5 shrink-0', primary ? 'text-white/70' : 'text-muted')} />
    </button>
  );
}

// ---------------- Formulir laporan ----------------
interface Photo { id?: string; url: string; state: 'uploading' | 'ok' | 'error' }

function ReportSheet({ open, onClose, token, info }: { open: boolean; onClose: () => void; token: string; info: PublicInfo }) {
  const [category, setCategory] = useState(''); const [message, setMessage] = useState(''); const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]); const [errors, setErrors] = useState<Record<string, string>>({}); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ ref: string; cat: string; photos: number } | null>(null); const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const max = info.limits.message_max;
  useEffect(() => { if (!open && done) { setDone(null); setCategory(''); setMessage(''); setPhotos([]); setName(''); setPhone(''); } }, [open, done]);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, info.limits.photos_max - photos.length)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { setError('Format foto harus JPG, PNG, atau WebP.'); continue; }
      if (f.size > info.limits.photo_bytes_max) { setError('Ukuran foto maksimal 5 MB.'); continue; }
      setError(''); const url = URL.createObjectURL(f);
      setPhotos((p) => [...p, { url, state: 'uploading' }]);
      try { const fd = new FormData(); fd.append('file', f); const r = await api<{ id: string }>(`/public/vehicles/${token}/uploads`, { form: fd }); setPhotos((p) => p.map((x) => (x.url === url ? { ...x, id: r.id, state: 'ok' } : x))); }
      catch { setPhotos((p) => p.map((x) => (x.url === url ? { ...x, state: 'error' } : x))); }
    }
    if (fileRef.current) fileRef.current.value = '';
  };
  const submit = async () => {
    const er: Record<string, string> = {};
    if (!category) er.category = 'Pilih kategori laporan';
    if (message.trim().length < 3) er.message = 'Tulis pesan untuk pemilik';
    if (message.length > max) er.message = `Pesan maksimal ${max} karakter`;
    if (phone && !/^[+0-9\s-]{6,30}$/.test(phone)) er.phone = 'Nomor telepon tidak valid';
    setErrors(er); if (Object.keys(er).length) return;
    if (photos.some((p) => p.state === 'uploading')) { setError('Tunggu hingga foto selesai diunggah.'); return; }
    setBusy(true); setError('');
    try {
      const ok = photos.filter((p) => p.state === 'ok');
      const r = await api<{ reference: string }>(`/public/vehicles/${token}/reports`, { body: { category, message: message.trim(), reporter_name: name || null, reporter_phone: phone || null, attachment_ids: ok.map((p) => p.id) } });
      setDone({ ref: r.reference, cat: category, photos: ok.length });
    } catch (e) { if (e instanceof ApiError && e.fields) setErrors(e.fields); setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={done ? 'Laporan terkirim' : 'Kirim Laporan'}>
      {done ? (
        <div className="text-center">
          <div className="btn-primary mx-auto grid h-24 w-24 place-items-center rounded-full shadow-glow"><Check className="h-12 w-12 text-white" strokeWidth={3} /></div>
          <h3 className="mt-6 font-display text-2xl font-bold">Laporan Terkirim!</h3><p className="mt-1.5 text-muted">Pemilik kendaraan akan segera diberi tahu</p>
          <div className="hero mt-6 rounded-3xl p-6"><p className="text-sm text-white/55">Nomor Referensi</p><p className="mt-2 font-display text-[28px] font-bold tracking-wider">{done.ref}</p><p className="mt-2 text-sm text-white/50">Simpan nomor ini untuk mengecek status</p>
            <button onClick={() => { void navigator.clipboard?.writeText(done.ref); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="glass mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Tersalin' : 'Salin'}</button></div>
          <dl className="mt-4 space-y-2.5 rounded-3xl bg-[#F1F5FA] p-5 text-left text-sm"><div className="flex justify-between"><dt className="text-muted">Kendaraan</dt><dd className="font-semibold">{info.vehicle.owner_display_name} · {info.vehicle.plate_number}</dd></div><div className="flex justify-between"><dt className="text-muted">Kategori</dt><dd className="font-semibold">{CAT_LABEL[done.cat] ?? done.cat}</dd></div><div className="flex justify-between"><dt className="text-muted">Foto</dt><dd className="font-semibold">{done.photos ? `${done.photos} foto dilampirkan` : 'Tanpa foto'}</dd></div></dl>
          <div className="mt-3"><Notice tone="sky" icon={<Bell className="mt-0.5 h-4 w-4 shrink-0" />}>Pemilik akan menerima notifikasi melalui WhatsApp, Telegram, atau Email</Notice></div>
          <Button block size="lg" className="mt-5" onClick={onClose}>Selesai</Button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-5" noValidate>
          <div className="-mt-3 flex justify-end"><Plate value={info.vehicle.plate_number} className="!rounded-lg !px-3 !py-1 !text-xs text-brand-deep" /></div>
          <fieldset><legend className="label">Kategori *</legend>
            <div className="grid grid-cols-3 gap-2.5" role="radiogroup">
              {info.categories.map((c) => { const I = CAT_ICON[c.code] ?? Ellipsis; const on = category === c.code; return (
                <button type="button" key={c.code} role="radio" aria-checked={on} onClick={() => setCategory(c.code)} className={cx('flex flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 text-[13px] font-semibold transition', on ? 'border-brand-deep bg-brand-deep text-white shadow-glow' : 'border-line bg-white text-ink-3 hover:border-brand/40')}>
                  <I className={cx('h-6 w-6', on ? 'text-white' : 'text-muted')} />{CAT_SHORT[c.code] ?? c.label}</button>); })}
            </div>{errors.category && <p role="alert" className="mt-1.5 text-[13px] font-medium text-coral-deep">{errors.category}</p>}
          </fieldset>
          <Field label="Pesan *" error={errors.message}>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} invalid={!!errors.message} maxLength={max + 50} placeholder="Jelaskan situasinya…" />
            <span className={cx('mt-1 block text-right text-xs', message.length > max ? 'font-bold text-coral-deep' : 'text-muted')}>{message.length}/{max}</span>
          </Field>
          <div>
            <span className="label">Foto <span className="font-normal text-muted">(opsional, maks. {info.limits.photos_max})</span></span>
            <div className="flex gap-2.5">
              {photos.length < info.limits.photos_max && <button type="button" onClick={() => fileRef.current?.click()} className="grid h-24 w-24 place-items-center rounded-2xl border border-dashed border-line bg-[#F7F9FC] text-muted hover:bg-white"><span className="flex flex-col items-center gap-1 text-xs font-semibold"><ImagePlus className="h-6 w-6" />Tambah</span></button>}
              {photos.map((p) => (
                <div key={p.url} className="relative h-24 w-24 overflow-hidden rounded-2xl bg-[#E4EAF3]">
                  <img src={p.url} alt="Pratinjau foto" className={cx('h-full w-full object-cover', p.state !== 'ok' && 'opacity-40')} />
                  {p.state === 'uploading' && <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin" />}
                  {p.state === 'error' && <span className="absolute inset-x-0 bottom-0 bg-coral px-1 py-0.5 text-center text-[9px] font-bold text-white">Gagal</span>}
                  <button type="button" aria-label="Hapus foto" onClick={() => setPhotos((x) => x.filter((y) => y.url !== p.url))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-coral text-white"><X className="h-3.5 w-3.5" /></button>
                </div>))}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Camera className="h-3.5 w-3.5" />Data lokasi (GPS) pada foto dihapus otomatis.</p>
          </div>
          <div className="space-y-3"><span className="label">Opsional</span>
            <Input icon={<User />} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} autoComplete="name" placeholder="Nama Anda" aria-label="Nama Anda" />
            <div><Input icon={<Phone />} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" invalid={!!errors.phone} placeholder="Nomor telepon" aria-label="Nomor telepon" />{errors.phone && <p role="alert" className="mt-1 text-[13px] font-medium text-coral-deep">{errors.phone}</p>}<p className="mt-1.5 text-xs text-muted">Nomor hanya dilihat pemilik kendaraan.</p></div></div>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" block size="lg" loading={busy}><Send className="h-4 w-4" />Kirim Laporan</Button>
        </form>
      )}
    </Sheet>
  );
}

// ---------------- Notifikasi mendesak (tanpa panggilan, tanpa TURN) ----------------
function UrgentSheet({ open, onClose, token, info, onFallback }: { open: boolean; onClose: () => void; token: string; info: PublicInfo; onFallback: () => void }) {
  const [category, setCategory] = useState('ACCESS'); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fallback, setFallback] = useState(false);
  const [done, setDone] = useState<{ ref: string; live: boolean; quiet: boolean } | null>(null);
  useEffect(() => { if (!open) { setDone(null); setError(''); setMessage(''); setFallback(false); } }, [open]);
  const cats = info.categories.filter((c) => ['ACCESS', 'PARKING', 'EMERGENCY', 'DAMAGE', 'OTHER'].includes(c.code));
  const send = async () => {
    setBusy(true); setError('');
    try { const r = await api<any>(`/public/vehicles/${token}/alerts`, { body: { category, message: message.trim() || null } }); setDone({ ref: r.reference, live: r.delivered_live, quiet: r.quiet_hours }); }
    catch (e) { setError(errMsg(e)); setFallback(e instanceof ApiError && e.extra?.fallback === 'message'); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={done ? 'Notifikasi terkirim' : 'Notifikasi Mendesak'}>
      {done ? (
        <div className="text-center">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-coral text-white shadow-[0_10px_28px_-8px_rgba(229,72,77,.7)]"><BellRing className="h-11 w-11" /></div>
          <h3 className="mt-6 font-display text-2xl font-bold">Pemilik sudah diberi tahu</h3>
          <p className="mt-2 text-muted">{done.live ? 'Pemilik sedang online — layar ponselnya menampilkan pemberitahuan penuh sekarang.' : done.quiet ? 'Pemilik sedang dalam jam tenang. Pesan dikirim lewat WhatsApp/Telegram/Email.' : 'Pemilik belum membuka aplikasinya. Pemberitahuan dikirim lewat WhatsApp/Telegram/Email.'}</p>
          <p className="mt-4 font-mono text-sm font-bold text-muted">{done.ref}</p>
          <Button block size="lg" className="mt-6" onClick={onClose}>Selesai</Button>
        </div>
      ) : (
        <div className="space-y-5">
          <Notice tone="amber" icon={<BellRing className="mt-0.5 h-4 w-4 shrink-0" />}>Pemilik akan menerima <b>pemberitahuan layar penuh</b> di ponselnya, <b>tanpa suara panggilan</b>. Gunakan hanya bila perlu respons segera.</Notice>
          <fieldset><legend className="label">Keperluan</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">{cats.map((c) => <button key={c.code} type="button" role="radio" aria-checked={category === c.code} onClick={() => setCategory(c.code)} className={cx('rounded-full border px-4 py-2 text-sm font-semibold transition', category === c.code ? 'border-coral bg-coral text-white' : 'border-line bg-white text-ink-3')}>{CAT_LABEL[c.code] ?? c.label}</button>)}</div></fieldset>
          <Field label="Pesan singkat (opsional)"><Textarea className="!min-h-[84px]" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="Contoh: Mobil Anda menghalangi pintu keluar, mohon segera dipindahkan." /><span className="mt-1 block text-right text-xs text-muted">{message.length}/300</span></Field>
          <ErrorNote>{error}</ErrorNote>
          {fallback && <Button variant="light" block onClick={onFallback}>Kirim laporan biasa</Button>}
          <Button variant="danger" size="lg" block loading={busy} onClick={send}><BellRing className="h-4 w-4" />Kirim Notifikasi Mendesak</Button>
        </div>)}
    </Sheet>
  );
}

// ---------------- PSTN ----------------
function PstnSheet({ open, onClose, token, onFallback }: { open: boolean; onClose: () => void; token: string; onFallback: () => void }) {
  const [phone, setPhone] = useState('+62'); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fallback, setFallback] = useState(false); const [ok, setOk] = useState(false);
  const go = async () => {
    setBusy(true); setError('');
    try { await api('/public/calls/pstn', { body: { vehicle_token: token, caller_phone: phone.replace(/[\s-]/g, ''), consent } }); setOk(true); }
    catch (e) { setError(errMsg(e)); setFallback(e instanceof ApiError && e.extra?.fallback === 'message'); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Telepon Biasa">
      {ok ? <div className="text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-mint text-mint-deep"><Phone className="h-9 w-9" /></div><h3 className="mt-5 font-display text-2xl font-bold">Kami sedang menelepon Anda</h3><p className="mt-2 text-muted">Angkat telepon dari nomor yang tampil. Anda akan disambungkan ke pemilik jika ia menjawab. Tidak tersambung? Kirim pesan saja.</p><Button className="mt-6" variant="light" block onClick={onFallback}>Kirim pesan sebagai gantinya</Button></div> : (
        <div className="space-y-4">
          <Notice tone="amber">Panggilan dapat dikenai <b>biaya operator/provider</b>. Nomor Anda hanya dipakai untuk menyambungkan panggilan ini dan tidak diberikan kepada pemilik.</Notice>
          <Field label="Nomor telepon Anda" hint="Format internasional, mis. +628123456789"><Input icon={<Phone />} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></Field>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand" /><span>Saya mengerti panggilan ini dapat berbiaya dan menyetujui nomor saya digunakan untuk menyambungkan panggilan.</span></label>
          <ErrorNote>{error}</ErrorNote>{fallback && <Button variant="light" block onClick={onFallback}>Kirim pesan sebagai gantinya</Button>}
          <Button block size="lg" loading={busy} disabled={!consent || phone.length < 9} onClick={go}>Hubungkan sekarang</Button>
        </div>)}
    </Sheet>
  );
}

// ---------------- Panggilan WebRTC (layar penuh) ----------------
function CallScreen({ token, plate, onClose, onFallback }: { token: string; plate: string; onClose: () => void; onFallback: () => void }) {
  const c = useCaller(token);
  useEffect(() => { void c.start(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const ended = c.state === 'ended';
  const label = { idle: '', mic: 'Meminta izin mikrofon…', calling: 'Memanggil pemilik…', connecting: 'Menyambungkan audio…', connected: 'Terhubung', ended: '' }[c.state];
  const canRetry = ended && ['timeout', 'failed', 'busy', 'rejected', 'cancelled', 'limited'].includes(c.result?.kind ?? '');

  if (c.state === 'connected') return <><audio ref={c.audioRef} autoPlay /><ActiveUi title="Pemilik Kendaraan" plate={plate} status="Terhubung" seconds={c.seconds} connected muted={c.muted} onMute={c.toggleMute} onEnd={() => c.hangup()} /></>;
  return (
    <CallShell label="Panggilan">
      <audio ref={c.audioRef} autoPlay />
      <div className="flex items-center justify-between px-5 pt-5 safe-top"><VehicleChip plate={plate} /><span className="glass rounded-full px-3 py-1 text-xs font-semibold">Panggilan internet</span></div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {!ended ? <>
          <CallAvatar pulse />
          <h2 className="mt-2 font-display text-3xl font-bold">Pemilik kendaraan</h2>
          <p className="mt-2 text-lg text-white/65" aria-live="polite">{label}</p>
          {c.state === 'mic' && <p className="mt-4 max-w-xs text-sm text-white/45">Izinkan akses mikrofon pada permintaan browser agar pemilik dapat mendengar Anda.</p>}
        </> : <>
          <div className={cx('grid h-24 w-24 place-items-center rounded-full', c.result?.kind === 'completed' ? 'bg-[#13B77D]/20 text-[#34D399]' : 'bg-white/10')}>{c.result?.kind === 'completed' ? <Check className="h-11 w-11" strokeWidth={3} /> : c.result?.kind === 'mic_denied' ? <MicOff className="h-10 w-10" /> : <PhoneOff className="h-10 w-10" />}</div>
          <h2 className="mt-7 font-display text-3xl font-bold">{c.result?.kind === 'completed' ? 'Panggilan selesai' : 'Panggilan tidak tersambung'}</h2>
          <p className="mt-3 max-w-xs text-white/70">{c.result?.message}</p>
          {c.result?.kind !== 'completed' && <p className="mt-2 max-w-xs text-sm text-white/45">Anda tetap bisa mengirim pesan — pemilik akan segera diberi tahu.</p>}
        </>}
      </div>
      <div className="px-6 pb-8 safe-bottom">
        {!ended ? <div className="flex justify-center"><RoundAction label="Batalkan" tone="red" onClick={() => c.hangup()} ariaLabel="Batalkan panggilan"><PhoneOff /></RoundAction></div> : (
          <div className="mx-auto max-w-sm space-y-3">
            {c.result?.kind !== 'completed' && <Button variant="light" size="lg" block onClick={onFallback}><MessageSquarePlus className="h-5 w-5" />Kirim pesan ke pemilik</Button>}
            {canRetry && <Button size="lg" block onClick={() => { c.reset(); void c.start(); }}>Coba panggil lagi</Button>}
            <Button variant="ghost" size="lg" block className="!text-white/80 hover:!bg-white/10" onClick={onClose}><ArrowLeft className="h-4 w-4" />Kembali</Button>
          </div>)}
      </div>
    </CallShell>
  );
}
