import { Link } from 'react-router-dom';
import { cx } from '../lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cx('h-9 w-9', className)} aria-hidden>
      <rect width="48" height="48" rx="14" fill="#101011" />
      <rect x="9" y="9" width="13" height="13" rx="3.5" fill="#CDE8DA" /><rect x="26" y="9" width="13" height="13" rx="3.5" fill="#fff" /><rect x="9" y="26" width="13" height="13" rx="3.5" fill="#fff" />
      <path d="M29 32.5h9M33.5 28v9" stroke="#CDE8DA" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
export const Logo = ({ to = '/', light }: { to?: string; light?: boolean }) => (
  <Link to={to} className="inline-flex items-center gap-2.5" aria-label="Vehicle Contact System">
    <LogoMark />
    <span className={cx('text-[17px] font-bold leading-none tracking-tight', light ? 'text-white' : 'text-ink')}>Vehicle<br /><span className="font-medium opacity-60">Contact</span></span>
  </Link>
);
