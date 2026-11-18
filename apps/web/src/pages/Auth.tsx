import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MailCheck, ShieldCheck } from 'lucide-react';
import { api, ApiError, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { User } from '../lib/types';
import { Logo } from '../components/Logo';
import { Button, ErrorNote, Field, Input, Notice } from '../components/ui';

function Shell({ title, sub, children, admin }: { title: string; sub?: string; children: ReactNode; admin?: boolean }) {
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[1fr_1.05fr]">
      <aside className="hero hidden flex-col justify-between p-12 lg:flex">
        <Logo />
        <div>
          <p className="font-display text-5xl font-bold leading-[1.05]">{admin ? 'Pusat kendali operasional.' : <>Satu QR.<br />Seribu kemudahan.</>}</p>
          <p className="mt-5 max-w-sm text-white/65">{admin ? 'Akses administrator dilindungi autentikasi dua faktor (MFA) dan setiap tindakan dicatat pada log audit.' : 'Pemilik kendaraan dihubungi dengan cepat — tanpa membuka nomor pribadi.'}</p>
          <div className="glass mt-8 flex items-center gap-3 rounded-3xl p-4"><span className="btn-primary grid h-10 w-10 place-items-center rounded-full"><ShieldCheck className="h-5 w-5" /></span><p className="text-sm text-white/85">Kata sandi di-hash Argon2id. Data kontak dienkripsi.</p></div>
        </div>
        <p className="text-sm text-white/40">Vehicle Contact System</p>
      </aside>
      <div className="lg:flex lg:items-center lg:justify-center lg:px-5 lg:py-10">
        <div className="hero rounded-b-[32px] px-6 pb-10 pt-6 safe-top lg:hidden"><Logo /><h1 className="mt-8 font-display text-3xl font-bold">{title}</h1>{sub && <p className="mt-2 text-white/65">{sub}</p>}</div>
        <main className="w-full max-w-md animate-rise px-5 py-6 lg:px-0 lg:py-0">
          <div className="hidden lg:block"><h1 className="text-4xl font-bold">{title}</h1>{sub && <p className="mt-2 text-muted">{sub}</p>}</div>
          <div className="card p-6 lg:mt-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">{children}</div>
        </main>
      </div>
    </div>
  );
}

const loginSchema = z.object({ email: z.string().email('Email tidak valid'), password: z.string().min(1, 'Kata sandi wajib diisi') });

export function Login({ admin }: { admin?: boolean }) {
  const nav = useNavigate(); const loc = useLocation(); const qc = useQueryClient(); const { refresh } = useAuth();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const [error, setError] = useState(''); const [unverified, setUnverified] = useState('');
  const [mfa, setMfa] = useState<{ token: string; setup: { secret: string; qr_svg: string } | null } | null>(null);
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);

  const done = async (user: User) => { qc.setQueryData(['me'], user); await refresh(); nav(user.is_admin ? '/admin' : ((loc.state as any)?.from ?? '/app'), { replace: true }); };

  const submit = handleSubmit(async (v) => {
    setError(''); setUnverified('');
    try {
      const r = await api<any>('/auth/login', { body: v });
      if (r.mfa_required) setMfa({ token: r.mfa_token, setup: r.mfa_setup }); else await done(r.user);
    } catch (e) { if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') setUnverified(v.email); setError(errMsg(e)); }
  });
  const verify = async () => {
    setBusy(true); setError('');
    try { const r = await api<{ user: User }>('/auth/mfa/verify', { body: { mfa_token: mfa!.token, code } }); await done(r.user); }
    catch (e) { setError(errMsg(e)); if (e instanceof ApiError && e.code === 'MFA_EXPIRED') setMfa(null); } finally { setBusy(false); }
  };

  if (mfa) return (
    <Shell admin title={mfa.setup ? 'Aktifkan MFA' : 'Verifikasi dua langkah'} sub={mfa.setup ? 'Administrator wajib memakai MFA. Pindai kode QR dengan aplikasi authenticator (Google Authenticator, Authy, dll), lalu masukkan kode 6 digit.' : 'Masukkan kode 6 digit dari aplikasi authenticator Anda.'}>
      {mfa.setup && <div className="mb-5 flex items-center gap-4 card p-4"><div className="h-36 w-36 shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: mfa.setup.qr_svg }} /><div className="min-w-0 text-xs text-muted">Atau masukkan kunci manual:<p className="mt-1 break-all font-mono text-sm font-bold text-ink">{mfa.setup.secret}</p></div></div>}
      <form onSubmit={(e) => { e.preventDefault(); void verify(); }} className="space-y-4">
        <Field label="Kode 6 digit"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="text-center text-2xl tracking-[.5em]" /></Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" block size="lg" loading={busy} disabled={code.length !== 6}>Verifikasi</Button>
      </form>
    </Shell>
  );

  return (
    <Shell admin={admin} title={admin ? 'Masuk Administrator' : 'Selamat datang kembali'} sub={admin ? 'Khusus staf. Wajib autentikasi dua faktor.' : 'Masuk untuk mengelola kendaraan dan laporan Anda.'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" invalid={!!errors.email} placeholder="nama@email.com" {...register('email')} /></Field>
        <Field label="Kata sandi" error={errors.password?.message}><Input type="password" autoComplete="current-password" invalid={!!errors.password} {...register('password')} /></Field>
        <ErrorNote>{error}</ErrorNote>
        {unverified && <ResendVerification email={unverified} />}
        <Button type="submit" block size="lg" loading={isSubmitting}>Masuk</Button>
        <div className="flex items-center justify-between text-sm"><Link to="/forgot-password" className="font-semibold underline-offset-4 hover:underline">Lupa kata sandi?</Link>{!admin && <span className="text-muted">Belum punya akun? <Link to="/register" className="font-semibold text-brand underline-offset-4 hover:underline">Daftar</Link></span>}</div>
      </form>
    </Shell>
  );
}

function ResendVerification({ email }: { email: string }) {
  const [sent, setSent] = useState<string | null>(null);
  return sent === null
    ? <Button type="button" variant="light" block onClick={async () => { const r = await api<any>('/auth/resend-verification', { body: { email } }); setSent(r.dev_verify_url ?? ''); }}>Kirim ulang email verifikasi</Button>
    : <Notice tone="mint">Email verifikasi dikirim ulang. {sent && <><br /><span className="text-xs">Mode pengembangan: <a className="underline" href={new URL(sent).pathname + new URL(sent).search}>buka tautan verifikasi</a></span></>}</Notice>;
}

const regSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(10, 'Minimal 10 karakter').refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Harus memuat huruf dan angka'),
  agree: z.literal(true, { errorMap: () => ({ message: 'Setujui kebijakan privasi untuk melanjutkan' }) }),
});
export function Register() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof regSchema>>({ resolver: zodResolver(regSchema) });
  const [error, setError] = useState(''); const [done, setDone] = useState<{ email: string; dev?: string; sent: boolean } | null>(null);
  if (done) return (
    <Shell title={done.sent ? 'Periksa email Anda' : 'Akun dibuat'} sub={done.sent ? `Kami mengirim tautan verifikasi ke ${done.email}.` : `Akun untuk ${done.email} sudah dibuat.`}>
      {done.sent
        ? <div className="flex items-center gap-4 rounded-3xl bg-mint p-6 text-mint-deep"><MailCheck className="h-10 w-10 shrink-0" /><p className="text-sm font-medium">Klik tautan di email untuk mengaktifkan akun. Tautan berlaku 24 jam. Tidak ada? Periksa folder spam.</p></div>
        : <Notice tone="amber">Server belum dapat mengirim email verifikasi. Hubungi administrator untuk mengaktifkan akun Anda.</Notice>}
      {done.dev && <p className="mt-4 rounded-2xl bg-amber-soft px-4 py-3 text-sm text-amber-deep">Mode pengembangan (SMTP belum diatur): <a className="font-bold underline" href={new URL(done.dev).pathname + new URL(done.dev).search}>klik di sini untuk verifikasi</a></p>}
      <Link to="/login" className="mt-6 inline-block text-sm font-semibold underline-offset-4 hover:underline">Ke halaman masuk</Link>
    </Shell>
  );
  return (
    <Shell title="Buat akun" sub="Gratis. Kelola banyak kendaraan dalam satu akun.">
      <form onSubmit={handleSubmit(async (v) => { setError(''); try { const r = await api<any>('/auth/register', { body: { name: v.name, email: v.email, password: v.password } }); setDone({ email: v.email, dev: r.dev_verify_url, sent: r.email_sent !== false }); } catch (e) { setError(errMsg(e)); } })} className="space-y-4" noValidate>
        <Field label="Nama lengkap" error={errors.name?.message}><Input autoComplete="name" invalid={!!errors.name} {...register('name')} /></Field>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} /></Field>
        <Field label="Kata sandi" error={errors.password?.message} hint="Minimal 10 karakter, kombinasi huruf dan angka."><Input type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} /></Field>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand" {...register('agree')} /><span>Saya menyetujui <Link to="/privasi" target="_blank" className="font-semibold underline">kebijakan privasi</Link> dan memahami bahwa nama tampilan kendaraan dapat dilihat publik.</span></label>
        {errors.agree && <p role="alert" className="text-[13px] font-medium text-coral-deep">{errors.agree.message}</p>}
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" block size="lg" loading={isSubmitting}>Daftar</Button>
        <p className="text-center text-sm text-muted">Sudah punya akun? <Link to="/login" className="font-semibold text-brand underline-offset-4 hover:underline">Masuk</Link></p>
      </form>
    </Shell>
  );
}

export function VerifyEmail() {
  const [sp] = useSearchParams(); const token = sp.get('token');
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle'); const [msg, setMsg] = useState('');
  const run = async () => { setState('busy'); try { await api('/auth/verify-email', { body: { token } }); setState('ok'); } catch (e) { setMsg(errMsg(e)); setState('err'); } };
  return (
    <Shell title={state === 'ok' ? 'Email terverifikasi' : 'Verifikasi email'} sub={state === 'ok' ? 'Akun Anda aktif. Silakan masuk.' : 'Konfirmasi alamat email untuk mengaktifkan akun.'}>
      {state === 'ok' ? <><div className="mb-6 flex items-center gap-3 rounded-3xl bg-mint p-6 text-mint-deep"><CheckCircle2 className="h-8 w-8" /><b>Selesai!</b></div><Button block size="lg" onClick={() => (location.href = '/login')}>Masuk sekarang</Button></>
        : <>{state === 'err' && <div className="mb-4"><ErrorNote>{msg}</ErrorNote></div>}{!token ? <ErrorNote>Tautan tidak lengkap.</ErrorNote> : <Button block size="lg" loading={state === 'busy'} onClick={run}>Verifikasi email saya</Button>}</>}
    </Shell>
  );
}

export function Forgot() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: z.string().email('Email tidak valid') })) });
  const [sent, setSent] = useState<{ dev?: string } | null>(null); const [error, setError] = useState('');
  return (
    <Shell title="Lupa kata sandi" sub="Kami akan mengirim tautan untuk mengatur ulang kata sandi.">
      {sent ? <><Notice>Jika email terdaftar, tautan reset telah dikirim. Periksa kotak masuk Anda.</Notice>{sent.dev && <p className="mt-4 rounded-2xl bg-amber-soft px-4 py-3 text-sm text-amber-deep">Mode pengembangan: <a className="font-bold underline" href={new URL(sent.dev).pathname + new URL(sent.dev).search}>buka tautan reset</a></p>}</>
        : <form onSubmit={handleSubmit(async (v) => { setError(''); try { const r = await api<any>('/auth/forgot-password', { body: v }); setSent({ dev: r.dev_reset_url }); } catch (e) { setError(errMsg(e)); } })} className="space-y-4" noValidate>
          <Field label="Email" error={errors.email?.message}><Input type="email" invalid={!!errors.email} {...register('email')} /></Field><ErrorNote>{error}</ErrorNote>
          <Button type="submit" block size="lg" loading={isSubmitting}>Kirim tautan reset</Button></form>}
      <Link to="/login" className="mt-6 inline-block text-sm font-semibold underline-offset-4 hover:underline">Kembali ke masuk</Link>
    </Shell>
  );
}

export function Reset() {
  const [sp] = useSearchParams(); const nav = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ password: string }>({ resolver: zodResolver(z.object({ password: regSchema.shape.password })) });
  const [error, setError] = useState(''); const [ok, setOk] = useState(false);
  return (
    <Shell title="Atur kata sandi baru">
      {ok ? <><Notice>Kata sandi diperbarui. Semua perangkat telah dikeluarkan.</Notice><Button className="mt-5" block size="lg" onClick={() => nav('/login')}>Masuk</Button></>
        : <form onSubmit={handleSubmit(async (v) => { setError(''); try { await api('/auth/reset-password', { body: { token: sp.get('token'), password: v.password } }); setOk(true); } catch (e) { setError(errMsg(e)); } })} className="space-y-4" noValidate>
          <Field label="Kata sandi baru" error={errors.password?.message} hint="Minimal 10 karakter, kombinasi huruf dan angka."><Input type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} /></Field>
          <ErrorNote>{error}</ErrorNote><Button type="submit" block size="lg" loading={isSubmitting}>Simpan kata sandi</Button></form>}
    </Shell>
  );
}
