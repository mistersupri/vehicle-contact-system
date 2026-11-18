import nodemailer, { type Transporter } from 'nodemailer';
import { config, isProd } from '../config.ts';

export const mailConfigured = () => !!(config.smtpHost && config.mailFrom);
export const devLinks = !isProd; // tautan verifikasi/reset ikut di respons API hanya di luar production
export const appLink = (path: string) => `${config.appUrl}${path}`;

let transport: Transporter | null = null;
const getTransport = () =>
  (transport ??= nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure,
    requireTLS: isProd && !config.smtpSecure, // production: tolak pengiriman tanpa enkripsi
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
  }));

const mask = (e: string) => e.replace(/(.).+(@.+)/, '$1***$2'); // alamat email tidak ditulis utuh ke log
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface MailAction { label: string; url: string }

function html(text: string, action?: MailAction) {
  return `<!doctype html><html lang="id"><body style="margin:0;background:#eeeeec;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#101011">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:24px;padding:32px">
<p style="font-weight:700;font-size:18px;margin:0 0 20px">Vehicle Contact</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px;white-space:pre-line">${esc(text)}</p>
${action ? `<p style="margin:0 0 24px"><a href="${esc(action.url)}" style="display:inline-block;background:#101011;color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:999px">${esc(action.label)}</a></p>
<p style="font-size:12px;color:#757571;line-height:1.5;margin:0;word-break:break-all">Jika tombol tidak berfungsi, salin tautan ini:<br>${esc(action.url)}</p>` : ''}
</div></body></html>`;
}

/** Kirim email. Tidak pernah melempar galat: kegagalan dicatat ke log dan hasilnya `false`. */
export async function sendMail(to: string, subject: string, text: string, action?: MailAction): Promise<boolean> {
  const plain = action ? `${text}\n\n${action.label}: ${action.url}` : text;
  if (!mailConfigured()) {
    if (isProd) console.warn(`[mail] SMTP belum dikonfigurasi (SMTP_HOST/MAIL_FROM); email "${subject}" ke ${mask(to)} tidak terkirim`);
    else console.log(`[mail:dev] ${to} — ${subject}\n${plain}\n`);
    return false;
  }
  try {
    await getTransport().sendMail({ from: config.mailFrom, to, subject, text: plain, html: html(text, action) });
    return true;
  } catch (e: any) {
    console.error(`[mail] gagal mengirim "${subject}" ke ${mask(to)}: ${e?.code ?? ''} ${e?.responseCode ?? ''} ${String(e?.message ?? e).split('\n')[0].slice(0, 160)}`);
    return false;
  }
}
