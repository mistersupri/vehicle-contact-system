import { config, isProd } from '../config.ts';

/** Pengiriman email: belum ada SMTP -> tulis ke log (tautan tidak mengandung rahasia selain token sekali pakai). */
export function sendMail(to: string, subject: string, body: string) {
  if (isProd) console.warn(`[mail] SMTP belum dikonfigurasi; email "${subject}" ke ${to.replace(/(.).+(@.+)/, '$1***$2')} tidak terkirim`);
  else console.log(`[mail:dev] ${to} — ${subject}\n${body}\n`);
}
export const devLinks = !isProd;
export const appLink = (path: string) => `${config.appUrl}${path}`;
