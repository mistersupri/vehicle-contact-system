import crypto from 'node:crypto';
import { config } from '../config.ts';

/** Hasil pengiriman: `permanent` = jangan retry. */
export class SendError extends Error {
  constructor(public code: string, public permanent = false) { super(code); }
}
export interface Sender { name: string; simulated: boolean; send(destination: string, text: string): Promise<string> }

export const telegramConfigured = () => !!config.telegramBotToken;
export const whatsappConfigured = () => !!(config.whatsappAccessToken && config.whatsappPhoneNumberId);

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const data: any = await res.json().catch(() => ({}));
  return { res, data };
}

const telegram: Sender = {
  name: 'telegram', simulated: !telegramConfigured(),
  async send(chatId, text) {
    if (!telegramConfigured()) { console.log(`[telegram:simulasi] -> ${chatId.slice(0, 3)}***: ${text.split('\n')[0]}`); return `sim-${crypto.randomUUID()}`; }
    const { res, data } = await postJson(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, { chat_id: chatId, text, disable_web_page_preview: true });
    if (!res.ok) throw new SendError(`TG_${data?.error_code ?? res.status}`, [400, 403].includes(res.status));
    return String(data.result?.message_id);
  },
};

const whatsapp: Sender = {
  name: 'whatsapp', simulated: !whatsappConfigured(),
  async send(phone, text) {
    if (!whatsappConfigured()) { console.log(`[whatsapp:simulasi] -> ${phone.slice(0, 4)}***: ${text.split('\n')[0]}`); return `sim-${crypto.randomUUID()}`; }
    // Catatan: di luar jendela 24 jam, WhatsApp Cloud API mewajibkan template yang disetujui Meta.
    const { res, data } = await postJson(
      `https://graph.facebook.com/v21.0/${config.whatsappPhoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to: phone.replace(/^\+/, ''), type: 'text', text: { body: text } },
      { authorization: `Bearer ${config.whatsappAccessToken}` },
    );
    if (!res.ok) throw new SendError(`WA_${data?.error?.code ?? res.status}`, res.status === 400);
    return String(data.messages?.[0]?.id);
  },
};

export const senders: Record<string, Sender> = { TELEGRAM: telegram, WHATSAPP: whatsapp };

export function verifyMetaSignature(raw: Buffer | string, header: string | undefined): boolean {
  if (!config.whatsappAppSecret || !header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', config.whatsappAppSecret).update(raw).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
