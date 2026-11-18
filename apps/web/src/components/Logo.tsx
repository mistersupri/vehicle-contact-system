import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { cx } from '../lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return <span className={cx('grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-navy-900 text-white', className)} aria-hidden><Shield className="h-[18px] w-[18px]" /></span>;
}
/** `text` = teks di samping tile (mis. "VCS" di sidebar, "Vehicle Contact" di halaman auth). */
export const Logo = ({ to = '/', light = true, text = 'Vehicle Contact' }: { to?: string; light?: boolean; text?: string }) => (
  <Link to={to} className="inline-flex items-center gap-2.5" aria-label="Vehicle Contact System">
    <LogoMark />
    <span className={cx('font-display text-[16px] font-bold leading-none tracking-tight', light ? 'text-white' : 'text-ink')}>{text}</span>
  </Link>
);
