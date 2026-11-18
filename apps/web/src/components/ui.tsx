import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { AlertCircle, Bike, Bus, Car, CheckCircle2, Loader2, Truck, X } from 'lucide-react';
import { cx, initials } from '../lib/utils';

type Variant = 'dark' | 'light' | 'mint' | 'ghost' | 'danger' | 'soft' | 'outline';
const variants: Record<Variant, string> = {
  dark: 'btn-primary hover:brightness-110 active:scale-[.985]',                        // aksi utama (biru)
  light: 'bg-white text-ink border border-line hover:bg-paper active:scale-[.985]',
  mint: 'bg-mint text-mint-deep hover:brightness-95 active:scale-[.985]',
  ghost: 'bg-transparent text-ink-2 hover:bg-ink/5',
  danger: 'bg-coral text-white hover:brightness-95 active:scale-[.985]',               // tombol tolak/akhiri
  soft: 'bg-coral-soft text-coral-deep hover:brightness-95 active:scale-[.985]',       // blokir/cabut/hapus
  outline: 'bg-transparent border border-line text-ink hover:bg-white',
};
const sizes = { sm: 'h-9 px-4 text-[13px]', md: 'h-12 px-6 text-[15px]', lg: 'h-[52px] px-7 text-base' };
const base = 'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition select-none disabled:opacity-50 disabled:pointer-events-none';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: keyof typeof sizes; loading?: boolean; block?: boolean }
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ variant = 'dark', size = 'md', loading, block, className, children, disabled, ...p }, ref) => (
  <button ref={ref} disabled={disabled || loading} className={cx(base, variants[variant], sizes[size], block && 'w-full', className)} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
  </button>
));
export function LinkButton({ variant = 'dark', size = 'md', block, className, ...p }: LinkProps & { variant?: Variant; size?: keyof typeof sizes; block?: boolean }) {
  return <Link className={cx(base, variants[variant], sizes[size], block && 'w-full', className)} {...p} />;
}

export const Field = ({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
    {error ? <span role="alert" className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-coral-deep"><AlertCircle className="h-3.5 w-3.5" aria-hidden />{error}</span>
      : hint ? <span className="mt-1.5 block text-[12.5px] text-muted">{hint}</span> : null}
  </label>
);
/** Input dengan ikon di kiri (opsional), sesuai desain. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; icon?: ReactNode; trailing?: ReactNode }>(({ invalid, icon, trailing, className, ...p }, ref) => (
  icon || trailing ? (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
      <input ref={ref} aria-invalid={invalid || undefined} className={cx('input', icon && 'pl-11', trailing && 'pr-12', className)} {...p} />
      {trailing && <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>}
    </div>
  ) : <input ref={ref} aria-invalid={invalid || undefined} className={cx('input', className)} {...p} />
));
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ invalid, className, ...p }, ref) => (
  <textarea ref={ref} aria-invalid={invalid || undefined} className={cx('input min-h-[110px] resize-y', className)} {...p} />
));
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(({ invalid, className, ...p }, ref) => (
  <select ref={ref} aria-invalid={invalid || undefined} className={cx('input appearance-none bg-[length:16px] bg-[right_16px_center] bg-no-repeat pr-10', className)}
    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236B7A90' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }} {...p} />
));

/** Tab/filter berbentuk pil dengan hitungan (seperti "Baru 3"). */
export function Pills<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cx('scroll-hide -mx-1 flex gap-2 overflow-x-auto px-1 py-1', className)}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] font-semibold transition', value === o.value ? 'border-brand-deep bg-brand-deep text-white' : 'border-line bg-white text-ink-2 hover:bg-brand-soft')}>
          {o.label}{o.count ? <span className={cx('rounded-full px-1.5 text-[11px] leading-5', value === o.value ? 'bg-white/25' : 'bg-coral-soft text-coral-deep')}>{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

const tones = {
  neutral: 'bg-[#EDF1F7] text-ink-3', mint: 'bg-mint text-mint-deep', coral: 'bg-coral-soft text-coral-deep', amber: 'bg-amber-soft text-amber-deep',
  sky: 'bg-sky-soft text-sky-deep', dark: 'bg-navy-900 text-white', violet: 'bg-violet-soft text-violet-deep',
};
export const Badge = ({ tone = 'neutral', children, dot = true, className }: { tone?: keyof typeof tones; children: ReactNode; dot?: boolean; className?: string }) => (
  <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}{children}
  </span>
);
// Status selalu punya label teks (tidak hanya warna): Baru=merah, Dibaca=kuning, Proses=biru, Selesai=hijau
const statusTone: Record<string, keyof typeof tones> = { NEW: 'coral', READ: 'amber', IN_PROGRESS: 'sky', RESOLVED: 'mint', ARCHIVED: 'neutral', ACTIVE: 'mint', INACTIVE: 'neutral', SUSPENDED: 'coral', PENDING: 'amber',
  COMPLETED: 'mint', MISSED: 'coral', REJECTED: 'neutral', FAILED: 'coral', RINGING: 'amber', ACCEPTED: 'sky', SENT: 'mint', RETRY_SCHEDULED: 'amber', PROCESSING: 'sky' };
export const StatusBadge = ({ status, label }: { status: string; label: string }) => <Badge tone={statusTone[status] ?? 'neutral'} dot={false}>{label}</Badge>;

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx('relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-40', checked ? 'bg-brand' : 'bg-[#DDE3EC]')}>
      <span className={cx('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all', checked ? 'left-7' : 'left-1')} />
    </button>
  );
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('h-5 w-5 animate-spin text-muted', className)} aria-label="Memuat" />;
export const PageLoader = () => <div className="grid min-h-[40vh] place-items-center"><Spinner className="h-7 w-7" /></div>;

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-brand [&>svg]:h-7 [&>svg]:w-7">{icon}</div>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div role="alert" className="flex items-start gap-2 rounded-2xl bg-coral-soft px-4 py-3 text-sm font-medium text-coral-deep"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{children}</div>;
}
export function Notice({ tone = 'mint', children, icon }: { tone?: 'mint' | 'amber' | 'sky'; children: ReactNode; icon?: ReactNode }) {
  const t = { mint: 'bg-mint-soft text-mint-deep', amber: 'bg-amber-soft text-amber-deep', sky: 'bg-brand-soft text-navy-700' }[tone];
  return <div className={cx('flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[13.5px] font-medium', t)}>{icon ?? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}<div>{children}</div></div>;
}

/** Sheet dari bawah (mobile) / modal (desktop). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Tutup" className="absolute inset-0 bg-navy-950/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-4xl bg-paper p-6 pb-8 animate-sheet sm:max-w-lg sm:rounded-4xl safe-bottom">
        <div className="mb-5 flex items-center justify-between"><h2 className="font-display text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Tutup" className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-card"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="font-display text-[30px] font-bold leading-tight sm:text-[34px]">{title}</h1></div>
      {action}
    </div>
  );
}

/** Pelat nomor sebagai chip. `tone="dark"` untuk di atas hero. */
export const Plate = ({ value, className, tone = 'light' }: { value: string; className?: string; tone?: 'light' | 'dark' }) => (
  <span className={cx('plate-chip inline-block rounded-xl px-3.5 py-1.5 text-center text-sm', tone === 'dark' ? 'border border-white/15 bg-white/15 text-white' : 'bg-[#EEF3FA] text-ink-2', className)}>{value}</span>
);

export function VehicleIcon({ type, className }: { type?: string; className?: string }) {
  const I = type === 'Motor' ? Bike : type === 'Truk' ? Truck : type === 'Bus' ? Bus : Car;
  return <I className={className} aria-hidden />;
}
/** Tile ikon kendaraan gaya desain. */
export const VehicleTile = ({ type, size = 'md', tone = 'dark' }: { type?: string; size?: 'sm' | 'md' | 'lg'; tone?: 'dark' | 'brand' | 'muted' }) => (
  <span className={cx('grid shrink-0 place-items-center', size === 'lg' ? 'h-16 w-16 rounded-2xl [&>svg]:h-8 [&>svg]:w-8' : size === 'md' ? 'h-12 w-12 rounded-2xl [&>svg]:h-6 [&>svg]:w-6' : 'h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5',
    tone === 'dark' ? 'border border-white/10 bg-white/10 text-white' : tone === 'brand' ? 'bg-brand-deep text-white' : 'bg-[#E4EAF3] text-muted')}><VehicleIcon type={type} /></span>
);
export const Avatar = ({ name, size = 40 }: { name: string; size?: number }) => (
  <span className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-dark font-display font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</span>
);
/** Tile ikon berwarna (stat/aktivitas). */
export const IconTile = ({ tone, children, className }: { tone: 'blue' | 'green' | 'amber' | 'violet' | 'red'; children: ReactNode; className?: string }) => (
  <span className={cx('grid shrink-0 place-items-center rounded-2xl [&>svg]:h-5 [&>svg]:w-5', { blue: 'bg-brand text-white', green: 'bg-[#13A774] text-white', amber: 'bg-[#E8960F] text-white', violet: 'bg-[#8B5CF6] text-white', red: 'bg-coral text-white' }[tone], className ?? 'h-12 w-12')}>{children}</span>
);

export function Confirm({ open, title, children, confirmLabel, danger, loading, onConfirm, onClose }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="mb-6 text-[15px] text-ink-2">{children}</div>
      <div className="flex gap-3"><Button variant="light" block onClick={onClose}>Batal</Button><Button variant={danger ? 'danger' : 'dark'} block loading={loading} onClick={onConfirm}>{confirmLabel}</Button></div>
    </Sheet>
  );
}
