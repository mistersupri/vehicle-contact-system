import { type ReactNode } from 'react';
import { cx } from '../lib/utils';

/** Bingkai ponsel hitam untuk mockup (bahasa visual dari gambar referensi). */
export function Phone({ children, dark, className }: { children: ReactNode; dark?: boolean; className?: string }) {
  return (
    <div className={cx('relative aspect-[9/19] w-[250px] shrink-0 rounded-[42px] border-[7px] border-ink bg-ink shadow-float', className)} aria-hidden>
      <div className={cx('relative h-full w-full overflow-hidden rounded-[34px]', dark ? 'bg-ink-2 text-white' : 'bg-white text-ink')}>
        <div className="flex items-center justify-between px-5 pt-2.5 text-[10px] font-bold">
          <span>9:41</span><span className="absolute left-1/2 top-2 h-[18px] w-[64px] -translate-x-1/2 rounded-full bg-ink" /><span className="tracking-widest">▂▄▆ ●</span>
        </div>
        {children}
        <div className={cx('absolute bottom-1.5 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full', dark ? 'bg-white/70' : 'bg-ink')} />
      </div>
    </div>
  );
}
