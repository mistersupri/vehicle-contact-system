import type { ReactNode } from 'react';
import { BellRing, Car, Mic, MicOff, Phone, PhoneOff, User, Volume2 } from 'lucide-react';
import { cx, fmtDuration } from '../lib/utils';

/** Bahan layar panggilan (sisi pemilik & pengunjung) sesuai desain: latar navy→biru, avatar biru, tombol bulat berlabel. */
export const CallShell = ({ children, role = 'dialog', label }: { children: ReactNode; role?: string; label: string }) => (
  <div className="call-bg fixed inset-0 z-[70] flex flex-col" role={role} aria-modal="true" aria-label={label}>{children}</div>
);

export function CallAvatar({ pulse, tone = 'blue', icon }: { pulse?: boolean; tone?: 'blue' | 'red'; icon?: ReactNode }) {
  const c = tone === 'red' ? 'bg-coral' : 'bg-gradient-to-b from-[#4D9BFF] to-brand';
  return (
    <div className="relative grid h-36 w-36 place-items-center">
      {pulse && <><span className={cx('absolute inset-4 animate-ring rounded-full', tone === 'red' ? 'bg-coral/40' : 'bg-brand/40')} /><span className={cx('absolute inset-4 animate-ring rounded-full [animation-delay:.9s]', tone === 'red' ? 'bg-coral/40' : 'bg-brand/40')} /></>}
      <span className={cx('relative grid h-24 w-24 place-items-center rounded-full shadow-[0_0_48px_-6px_rgba(43,127,232,.85)] [&>svg]:h-11 [&>svg]:w-11', c)}>{icon ?? <User />}</span>
    </div>
  );
}

export const VehicleChip = ({ name, plate }: { name?: string | null; plate: string }) => (
  <span className="glass inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white/90"><Car className="h-4 w-4 text-[#6AB0FF]" aria-hidden />{name ? `${name} · ` : ''}{plate}</span>
);

export function Waveform({ active }: { active: boolean }) {
  const hs = [12, 22, 34, 18, 40, 26, 44, 20, 36, 14, 30, 42, 24, 16, 28];
  return (
    <div className="flex h-12 items-center gap-1.5" aria-hidden>
      {hs.map((h, i) => <span key={i} className={cx('w-1 rounded-full bg-[#5AA2FF]', active && 'animate-wave')} style={{ height: h, animationDelay: `${i * 70}ms`, opacity: active ? 1 : 0.35 }} />)}
    </div>
  );
}

export function RoundAction({ label, onClick, tone, children, pressed, ariaLabel }: { label: string; onClick: () => void; tone: 'glass' | 'blue' | 'red' | 'green' | 'white'; children: ReactNode; pressed?: boolean; ariaLabel?: string }) {
  const t = { glass: 'bg-white/10 text-white', blue: 'bg-brand text-white shadow-glow', red: 'bg-coral text-white shadow-[0_10px_28px_-8px_rgba(229,72,77,.7)]', green: 'bg-[#13B77D] text-white shadow-[0_10px_28px_-8px_rgba(19,183,125,.7)]', white: 'bg-white text-navy-900' }[tone];
  return (
    <div className="flex flex-col items-center gap-2">
      <button onClick={onClick} aria-label={ariaLabel ?? label} aria-pressed={pressed} className={cx('grid h-[68px] w-[68px] place-items-center rounded-full transition active:scale-95 [&>svg]:h-7 [&>svg]:w-7', t)}>{children}</button>
      <span className={cx('text-xs font-semibold', tone === 'red' ? 'text-[#FF7B80]' : tone === 'green' ? 'text-[#34D399]' : 'text-white/60')}>{label}</span>
    </div>
  );
}

/** Panggilan masuk (pemilik). */
export function IncomingUi({ name, plate, seconds, onAccept, onReject }: { name?: string | null; plate: string; seconds: number; onAccept: () => void; onReject: () => void }) {
  return (
    <CallShell role="alertdialog" label="Panggilan masuk">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <CallAvatar pulse />
        <p className="mt-2 text-sm text-white/55">Panggilan masuk</p>
        <h2 className="mt-3 font-display text-[34px] font-bold leading-tight">Seseorang menghubungi</h2>
        <div className="mt-5"><VehicleChip name={name} plate={plate} /></div>
        <p className="mt-6 flex items-center gap-2 text-sm text-white/45" aria-live="polite"><span className="h-2 w-2 animate-flash rounded-full bg-white/60" />Berdering… {fmtDuration(seconds)}</p>
      </div>
      <div className="mx-auto flex w-full max-w-xs justify-between px-8 pb-12 safe-bottom">
        <RoundAction label="Tolak" tone="red" onClick={onReject} ariaLabel="Tolak panggilan"><PhoneOff /></RoundAction>
        <RoundAction label="Terima" tone="green" onClick={onAccept} ariaLabel="Terima panggilan"><Phone /></RoundAction>
      </div>
    </CallShell>
  );
}

/** Panggilan berlangsung (pemilik & pengunjung). */
export function ActiveUi({ title, name, plate, status, seconds, connected, muted, speaker, onMute, onSpeaker, onEnd }: { title: string; name?: string | null; plate: string; status: string; seconds: number; connected: boolean; muted: boolean; speaker?: boolean; onMute: () => void; onSpeaker?: () => void; onEnd: () => void }) {
  return (
    <CallShell label="Panggilan berlangsung">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <CallAvatar />
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#13B77D]/15 px-3 py-1 text-xs font-bold text-[#34D399]"><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span>
        <h2 className="mt-4 font-display text-[28px] font-bold">{title}</h2>
        <div className="mt-3"><VehicleChip name={name} plate={plate} /></div>
        <p className="mt-10 font-display text-[64px] font-light leading-none tracking-[.08em] tabular-nums" aria-live="polite">{connected ? fmtDuration(seconds).padStart(4, '0') : '--:--'}</p>
        <p className="mt-2 text-sm text-white/40">Durasi panggilan</p>
        <div className="mt-10"><Waveform active={connected && !muted} /></div>
      </div>
      <div className="mx-auto flex w-full max-w-sm items-start justify-around px-6 pb-12 safe-bottom">
        <RoundAction label={muted ? 'Mikrofon mati' : 'Bisukan'} tone={muted ? 'white' : 'glass'} onClick={onMute} pressed={muted} ariaLabel={muted ? 'Aktifkan mikrofon' : 'Matikan mikrofon'}>{muted ? <MicOff /> : <Mic />}</RoundAction>
        {onSpeaker && <RoundAction label="Speaker" tone="blue" onClick={onSpeaker} pressed={speaker}><Volume2 /></RoundAction>}
        <RoundAction label="Akhiri" tone="red" onClick={onEnd} ariaLabel="Akhiri panggilan"><PhoneOff /></RoundAction>
      </div>
    </CallShell>
  );
}

/** Notifikasi mendesak: layar penuh bergaya panggilan, tetapi bukan panggilan (tanpa suara/WebRTC). */
export function UrgentUi({ name, plate, label, message, onOpen, onDismiss }: { name?: string | null; plate: string; label: string; message: string; onOpen: () => void; onDismiss: () => void }) {
  return (
    <CallShell role="alertdialog" label="Notifikasi mendesak">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <CallAvatar pulse tone="red" icon={<BellRing />} />
        <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-coral/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#FF8A8E]"><span className="h-1.5 w-1.5 animate-flash rounded-full bg-current" />Notifikasi mendesak</p>
        <h2 className="mt-4 font-display text-[32px] font-bold leading-tight">Seseorang membutuhkan Anda</h2>
        <div className="mt-5"><VehicleChip name={name} plate={plate} /></div>
        <div className="glass mt-6 w-full max-w-sm rounded-3xl p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/45">{label}</p>
          <p className="mt-1 text-[15px] leading-relaxed text-white/90">{message}</p>
        </div>
        <p className="mt-4 text-xs text-white/40">Ini pemberitahuan, bukan panggilan suara.</p>
      </div>
      <div className="mx-auto flex w-full max-w-sm gap-3 px-6 pb-12 safe-bottom">
        <button onClick={onDismiss} className="h-14 flex-1 rounded-2xl bg-white/10 font-semibold text-white transition active:scale-[.98]">Abaikan</button>
        <button onClick={onOpen} className="h-14 flex-[1.4] rounded-2xl bg-coral font-semibold text-white shadow-[0_10px_28px_-8px_rgba(229,72,77,.7)] transition active:scale-[.98]">Lihat laporan</button>
      </div>
    </CallShell>
  );
}
