import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Camera, Check, Copy, Headphones, ImagePlus, Loader2, Mic, MicOff, MessageSquareText, Phone, PhoneCall, PhoneOff, QrCode, ShieldCheck, Siren, UserRound, X, ParkingCircle, DoorClosed, Lightbulb, CarFront, MessageCircle, WifiOff } from 'lucide-react';
import { api, ApiError, errMsg } from '../lib/api';
import type { Category } from '../lib/types';
import { cx, fmtDuration } from '../lib/utils';
import { useCaller } from '../lib/webrtc';
import { Logo } from '../components/Logo';
import { Button, ErrorNote, Field, Input, Notice, PageLoader, Plate, Sheet, Textarea } from '../components/ui';

interface PublicInfo {
  active: boolean; plate_masked?: string;
  vehicle: { plate_number: string; vehicle_type: string; brand: string | null; model: string | null; color: string | null; owner_display_name: string };
  categories: Category[]; limits: { message_max: number; photos_max: number; photo_bytes_max: number };
  calls: { webrtc_enabled: boolean; webrtc_available: boolean; webrtc_unavailable_reason: string | null; pstn_available: boolean };
}
const CAT_ICON: Record<string, typeof Siren> = { PARKING: ParkingCircle, ACCESS: DoorClosed, LIGHT: Lightbulb, EMERGENCY: Siren, DAMAGE: CarFront, OTHER: MessageCircle };

export default function PublicVehicle() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['public', token], queryFn: () => api<PublicInfo>(`/public/vehicles/${token}`), retry: false, refetchInterval: 20_000 });
  const [report, setReport] = useState(false); const [pstn, setPstn] = useState(false); const [calling, setCalling] = useState(false);

  if (q.isLoading) return <PageLoader />;
  if (q.error) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <Frame><div className="card mt-6 p-8 text-center"><div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-paper"><QrCode className="h-7 w-7" /></div><h1 className="text-2xl font-semibold">{nf ? 'QR tidak dikenali' : 'Gagal memuat halaman'}</h1><p className="mt-2 text-muted">{nf ? 'Kode QR ini tidak terdaftar. Pastikan Anda memindai QR yang benar.' : errMsg(q.error)}</p>{!nf && <Button className="mt-6" onClick={() => q.refetch()}>Coba lagi</Button>}</div></Frame>;
  }
  const d = q.data!;
  if (!d.active) return (
    <Frame><div className="card mt-6 p-8 text-center"><div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-amber-soft text-amber-deep"><PhoneOff className="h-7 w-7" /></div>
      <h1 className="text-2xl font-semibold">QR ini sedang tidak aktif</h1><p className="mt-2 text-muted">Kendaraan {d.plate_masked} tidak menerima laporan atau panggilan saat ini. Pemilik mungkin telah mengganti atau menonaktifkan QR-nya.</p></div></Frame>
  );
  const v = d.vehicle; const c = d.calls;
  const detail = [v.vehicle_type, [v.brand, v.model].filter(Boolean).join(' '), v.color].filter(Boolean);
  const reason: Record<string, string> = { OWNER_OFFLINE: 'Pemilik sedang tidak online', QUIET_HOURS: 'Pemilik sedang dalam jam tenang', WEBRTC_DISABLED: 'Panggilan internet dinonaktifkan' };

  return (
    <Frame>
      <section className="card-dark mt-5 overflow-hidden p-6 animate-rise">
        <div className="flex items-center justify-between text-[13px] text-white/60"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-mint" />QR aktif</span><span>Vehicle Contact System</span></div>
        <div className="mt-6 flex justify-center"><Plate value={v.plate_number} className="text-[34px] sm:text-[40px]" /></div>
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">{detail.map((x) => <span key={x} className="rounded-full bg-white/12 px-3 py-1.5 text-[13px] font-semibold">{x}</span>)}</div>
        <div className="mt-6 flex items-center gap-3 rounded-3xl bg-white/10 p-3.5">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-mint text-ink"><UserRound className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><p className="text-[12px] text-white/50">Pemilik kendaraan</p><p className="truncate font-semibold">{v.owner_display_name}</p></div>
          {c.webrtc_available && <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-mint-deep"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />Online</span>}
        </div>
      </section>

      <p className="eyebrow mt-8">Perlu menghubungi pemilik?</p>
      <h1 className="mb-4 text-[28px] font-semibold leading-tight">Pilih cara menghubungi</h1>
      <div className="space-y-3">
        <ActionCard onClick={() => setReport(true)} tone="dark" icon={<MessageSquareText />} title="Kirim pesan / laporan" desc="Gratis · bisa lampirkan foto · tanpa akun" />
        {c.webrtc_enabled && <ActionCard onClick={() => setCalling(true)} disabled={!c.webrtc_available} tone="mint" icon={<Headphones />} title="Panggil melalui internet" desc={c.webrtc_available ? 'Suara langsung dari browser · gratis' : (reason[c.webrtc_unavailable_reason ?? ''] ?? 'Tidak tersedia')} badge={c.webrtc_available ? undefined : 'Tidak tersedia'} />}
        {c.pstn_available && <ActionCard onClick={() => setPstn(true)} tone="white" icon={<Phone />} title="Panggil telepon biasa" desc="Operator dapat menarik biaya · perlu nomor Anda" />}
      </div>
      {!c.webrtc_available && c.webrtc_enabled && <div className="mt-3"><Notice tone="amber" icon={<WifiOff className="mt-0.5 h-4 w-4 shrink-0" />}>Pemilik belum bisa dipanggil sekarang. Kirim pesan — pemilik akan diberi tahu lewat WhatsApp/Telegram.</Notice></div>}

      <div className="mt-6 flex items-start gap-3 rounded-3xl bg-white/70 p-4 text-[13.5px] text-ink/75"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-mint-deep" /><p><b className="text-ink">Privasi terjaga.</b> Nomor telepon dan email pemilik tidak pernah ditampilkan di halaman ini.</p></div>
      <footer className="mt-8 flex justify-center gap-5 pb-6 text-[13px] text-muted"><Link to="/privasi" className="hover:text-ink">Kebijakan privasi</Link><Link to={`/penyalahgunaan?t=${token}`} className="hover:text-ink">Laporkan penyalahgunaan</Link></footer>

      <ReportSheet open={report} onClose={() => setReport(false)} token={token} info={d} />
      <PstnSheet open={pstn} onClose={() => setPstn(false)} token={token} onFallback={() => { setPstn(false); setReport(true); }} />
      {calling && <CallScreen token={token} plate={v.plate_number} onClose={() => setCalling(false)} onFallback={() => { setCalling(false); setReport(true); }} />}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-dvh max-w-md px-4 pt-4 safe-top"><header className="flex items-center justify-between"><Logo to="/" /></header>{children}</div>;
}

function ActionCard({ tone, icon, title, desc, onClick, disabled, badge }: { tone: 'dark' | 'mint' | 'white'; icon: React.ReactNode; title: string; desc: string; onClick: () => void; disabled?: boolean; badge?: string }) {
  const t = { dark: 'bg-ink text-white', mint: 'bg-mint text-ink', white: 'bg-white text-ink shadow-card' }[tone];
  return (
    <button onClick={onClick} disabled={disabled} className={cx('flex w-full items-center gap-4 rounded-3xl p-4 pr-5 text-left transition active:scale-[.99] disabled:opacity-55', t)}>
      <span className={cx('grid h-14 w-14 shrink-0 place-items-center rounded-full [&>svg]:h-6 [&>svg]:w-6', tone === 'dark' ? 'bg-white/15' : tone === 'mint' ? 'bg-ink text-white' : 'bg-paper')}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[17px] font-bold leading-tight">{title}</span><span className={cx('mt-0.5 block text-[13px]', tone === 'dark' ? 'text-white/65' : 'text-ink/65')}>{desc}</span></span>
      {badge && <span className="rounded-full bg-ink/10 px-2.5 py-1 text-[11px] font-bold">{badge}</span>}
    </button>
  );
}

// ---------------- Formulir laporan ----------------
interface Photo { id?: string; url: string; state: 'uploading' | 'ok' | 'error'; error?: string }

function ReportSheet({ open, onClose, token, info }: { open: boolean; onClose: () => void; token: string; info: PublicInfo }) {
  const [category, setCategory] = useState(''); const [message, setMessage] = useState(''); const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]); const [errors, setErrors] = useState<Record<string, string>>({}); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [done, setDone] = useState<string | null>(null); const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const max = info.limits.message_max;

  useEffect(() => { if (!open && done) { setDone(null); setCategory(''); setMessage(''); setPhotos([]); setName(''); setPhone(''); } }, [open, done]);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, info.limits.photos_max - photos.length)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { setError('Format foto harus JPG, PNG, atau WebP.'); continue; }
      if (f.size > info.limits.photo_bytes_max) { setError('Ukuran foto maksimal 5 MB.'); continue; }
      setError('');
      const url = URL.createObjectURL(f); const idx = url;
      setPhotos((p) => [...p, { url, state: 'uploading' }]);
      try {
        const fd = new FormData(); fd.append('file', f);
        const r = await api<{ id: string }>(`/public/vehicles/${token}/uploads`, { form: fd });
        setPhotos((p) => p.map((x) => (x.url === idx ? { ...x, id: r.id, state: 'ok' } : x)));
      } catch (e) { setPhotos((p) => p.map((x) => (x.url === idx ? { ...x, state: 'error', error: errMsg(e) } : x))); }
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
      const r = await api<{ reference: string }>(`/public/vehicles/${token}/reports`, { body: { category, message: message.trim(), reporter_name: name || null, reporter_phone: phone || null, attachment_ids: photos.filter((p) => p.state === 'ok').map((p) => p.id) } });
      setDone(r.reference);
    } catch (e) { if (e instanceof ApiError && e.fields) setErrors(e.fields); setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={done ? 'Laporan terkirim' : 'Kirim laporan'}>
      {done ? (
        <div className="text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-mint"><Check className="h-10 w-10 text-mint-deep" strokeWidth={3} /></div>
          <h3 className="mt-5 text-2xl font-semibold">Terima kasih!</h3><p className="mt-2 text-muted">Pemilik kendaraan sudah diberi tahu. Simpan nomor referensi ini bila perlu.</p>
          <button onClick={() => { void navigator.clipboard?.writeText(done); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="mx-auto mt-6 flex items-center gap-3 rounded-full bg-white px-5 py-3 font-mono text-lg font-bold shadow-card">{done}{copied ? <Check className="h-4 w-4 text-mint-deep" /> : <Copy className="h-4 w-4 text-muted" />}</button>
          <Button block size="lg" className="mt-6" onClick={onClose}>Selesai</Button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-5" noValidate>
          <fieldset><legend className="label">Apa yang terjadi?</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {info.categories.map((c) => { const I = CAT_ICON[c.code] ?? MessageCircle; const on = category === c.code; return (
                <button type="button" key={c.code} role="radio" aria-checked={on} onClick={() => setCategory(c.code)} className={cx('flex items-center gap-2.5 rounded-2xl p-3 text-left text-[13.5px] font-semibold leading-tight transition', on ? 'bg-ink text-white' : 'bg-white shadow-card hover:bg-white/70', c.code === 'EMERGENCY' && !on && 'ring-1 ring-coral/40')}>
                  <I className={cx('h-5 w-5 shrink-0', on ? 'text-mint' : c.code === 'EMERGENCY' ? 'text-coral' : 'text-muted')} />{c.label}{on && <Check className="ml-auto h-4 w-4 shrink-0" />}
                </button>); })}
            </div>{errors.category && <p role="alert" className="mt-1.5 text-[13px] font-medium text-coral-deep">{errors.category}</p>}
          </fieldset>
          <Field label="Pesan untuk pemilik" error={errors.message}>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} invalid={!!errors.message} maxLength={max + 50} placeholder="Contoh: Mobil menghalangi pintu keluar basement…" />
            <span className={cx('mt-1 block text-right text-xs', message.length > max ? 'font-bold text-coral-deep' : 'text-muted')}>{message.length}/{max}</span>
          </Field>
          <div>
            <span className="label">Foto <span className="font-normal text-muted">(opsional, maks. {info.limits.photos_max}, 5 MB)</span></span>
            <div className="flex gap-2">
              {photos.map((p) => (
                <div key={p.url} className="relative h-20 w-20 overflow-hidden rounded-2xl bg-white">
                  <img src={p.url} alt="Pratinjau foto" className={cx('h-full w-full object-cover', p.state !== 'ok' && 'opacity-40')} />
                  {p.state === 'uploading' && <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin" />}
                  {p.state === 'error' && <span className="absolute inset-x-0 bottom-0 bg-coral px-1 py-0.5 text-center text-[9px] font-bold text-white">Gagal</span>}
                  <button type="button" aria-label="Hapus foto" onClick={() => setPhotos((x) => x.filter((y) => y.url !== p.url))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink/80 text-white"><X className="h-3.5 w-3.5" /></button>
                </div>))}
              {photos.length < info.limits.photos_max && <button type="button" onClick={() => fileRef.current?.click()} className="grid h-20 w-20 place-items-center rounded-2xl border-2 border-dashed border-ink/20 bg-white/60 text-muted hover:bg-white"><span className="flex flex-col items-center gap-1 text-[11px] font-semibold"><ImagePlus className="h-5 w-5" />Tambah</span></button>}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Camera className="h-3.5 w-3.5" />Data lokasi (GPS) pada foto dihapus otomatis.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama Anda (opsional)"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} autoComplete="name" /></Field>
            <Field label="Nomor telepon (opsional)" error={errors.phone} hint="Hanya dilihat pemilik"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" invalid={!!errors.phone} /></Field>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" block size="lg" loading={busy}>Kirim laporan</Button>
        </form>
      )}
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
    <Sheet open={open} onClose={onClose} title="Panggil telepon biasa">
      {ok ? <div className="text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-mint"><PhoneCall className="h-9 w-9 text-mint-deep" /></div><h3 className="mt-5 text-2xl font-semibold">Kami sedang menelepon Anda</h3><p className="mt-2 text-muted">Angkat telepon dari nomor yang tampil. Anda akan disambungkan ke pemilik jika ia menjawab. Tidak tersambung? Kirim pesan saja.</p><Button className="mt-6" variant="light" block onClick={onFallback}>Kirim pesan sebagai gantinya</Button></div> : (
        <div className="space-y-4">
          <Notice tone="amber">Panggilan dapat dikenai <b>biaya operator/provider</b>. Nomor Anda hanya dipakai untuk menyambungkan panggilan ini dan tidak diberikan kepada pemilik.</Notice>
          <Field label="Nomor telepon Anda" hint="Format internasional, mis. +628123456789"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></Field>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-ink" /><span>Saya mengerti panggilan ini dapat berbiaya dan menyetujui nomor saya digunakan untuk menyambungkan panggilan.</span></label>
          <ErrorNote>{error}</ErrorNote>
          {fallback && <Button variant="light" block onClick={onFallback}>Kirim pesan sebagai gantinya</Button>}
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
  const canRetry = ended && ['timeout', 'failed', 'busy', 'rejected', 'cancelled', 'mic_denied', 'limited'].includes(c.result?.kind ?? '');
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink text-white" role="dialog" aria-modal="true" aria-label="Panggilan">
      <audio ref={c.audioRef} autoPlay />
      <div className="flex items-center justify-between px-5 pt-5 safe-top"><Plate value={plate} className="!text-sm !px-3 !py-1 !border-2" /><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">Panggilan internet</span></div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {!ended ? <>
          <div className="relative grid h-40 w-40 place-items-center">
            {(c.state === 'calling' || c.state === 'mic' || c.state === 'connecting') && <><span className="absolute inset-0 animate-ring rounded-full bg-white/25" /><span className="absolute inset-0 animate-ring rounded-full bg-white/25 [animation-delay:.9s]" /></>}
            <span className={cx('relative grid h-28 w-28 place-items-center rounded-full', c.state === 'connected' ? 'bg-mint text-ink' : 'bg-white/15')}><UserRound className="h-12 w-12" /></span>
          </div>
          <h2 className="mt-8 text-3xl font-semibold">Pemilik kendaraan</h2>
          <p className="mt-2 text-lg text-white/70" aria-live="polite">{c.state === 'connected' ? <span className="font-mono tabular-nums">{fmtDuration(c.seconds)}</span> : label}</p>
          {c.state === 'mic' && <p className="mt-4 max-w-xs text-sm text-white/50">Izinkan akses mikrofon pada permintaan browser agar pemilik dapat mendengar Anda.</p>}
        </> : <>
          <div className={cx('grid h-24 w-24 place-items-center rounded-full', c.result?.kind === 'completed' ? 'bg-mint text-ink' : 'bg-white/12')}>{c.result?.kind === 'completed' ? <Check className="h-11 w-11" strokeWidth={3} /> : c.result?.kind === 'mic_denied' ? <MicOff className="h-10 w-10" /> : <PhoneOff className="h-10 w-10" />}</div>
          <h2 className="mt-7 text-3xl font-semibold">{c.result?.kind === 'completed' ? 'Panggilan selesai' : 'Panggilan tidak tersambung'}</h2>
          <p className="mt-3 max-w-xs text-white/70">{c.result?.message}</p>
          {c.result?.kind !== 'completed' && <p className="mt-2 max-w-xs text-sm text-white/45">Anda tetap bisa mengirim pesan — pemilik akan segera diberi tahu.</p>}
        </>}
      </div>
      <div className="px-6 pb-8 safe-bottom">
        {!ended ? (
          <div className="mx-auto flex max-w-xs items-center justify-center gap-5">
            <button onClick={c.toggleMute} disabled={c.state === 'mic'} aria-pressed={c.muted} aria-label={c.muted ? 'Aktifkan mikrofon' : 'Matikan mikrofon'} className={cx('grid h-16 w-16 place-items-center rounded-full transition', c.muted ? 'bg-white text-ink' : 'bg-white/15')}>{c.muted ? <MicOff /> : <Mic />}</button>
            <button onClick={() => { c.hangup(); }} aria-label="Akhiri panggilan" className="grid h-20 w-20 place-items-center rounded-full bg-coral shadow-float"><PhoneOff className="h-8 w-8" /></button>
          </div>
        ) : (
          <div className="mx-auto max-w-sm space-y-3">
            {c.result?.kind !== 'completed' && <Button variant="light" size="lg" block onClick={onFallback}><MessageSquareText className="h-5 w-5" />Kirim pesan ke pemilik</Button>}
            {canRetry && c.result?.kind !== 'mic_denied' && <Button variant="outline" size="lg" block className="!border-white/25 !text-white hover:!bg-white/10" onClick={() => { c.reset(); void c.start(); }}>Coba panggil lagi</Button>}
            <Button variant="ghost" size="lg" block className="!text-white/80 hover:!bg-white/10" onClick={onClose}><ArrowLeft className="h-4 w-4" />Kembali</Button>
          </div>
        )}
      </div>
    </div>
  );
}
