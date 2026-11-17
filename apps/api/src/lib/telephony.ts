import crypto from 'node:crypto';
import { config } from '../config.ts';

/**
 * Adapter provider PSTN (PRD 13.3). Provider produksi belum dipilih — wajib proof of concept.
 * "mock" mensimulasikan bridging untuk pengembangan; tidak menelepon siapa pun.
 */
export interface TelephonyEvent { providerCallId: string; status: 'RINGING' | 'ANSWERED' | 'COMPLETED' | 'FAILED' | 'NO_ANSWER'; durationSeconds?: number }
export interface TelephonyAdapter {
  name: string;
  createCall(a: { callerPhone: string; ownerPhone: string; callRef: string }): Promise<{ providerCallId: string; virtualNumber: string | null }>;
  getCallStatus(providerCallId: string): Promise<TelephonyEvent['status']>;
  endCall(providerCallId: string): Promise<void>;
  verifyWebhook(raw: string, signature: string | undefined): boolean;
  normalizeProviderEvent(body: any): TelephonyEvent | null;
}

export function signWebhook(raw: string): string {
  return crypto.createHmac('sha256', config.telephonyWebhookSecret).update(raw).digest('hex');
}

const mock: TelephonyAdapter = {
  name: 'mock',
  async createCall() { return { providerCallId: `mock-${crypto.randomUUID()}`, virtualNumber: '+62 21 5000 0000' }; },
  async getCallStatus() { return 'RINGING'; },
  async endCall() {},
  verifyWebhook(raw, signature) {
    if (!signature) return false;
    const exp = signWebhook(raw);
    return signature.length === exp.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(exp));
  },
  normalizeProviderEvent(b) {
    if (!b?.provider_call_id || !b?.status) return null;
    const ok = ['RINGING', 'ANSWERED', 'COMPLETED', 'FAILED', 'NO_ANSWER'];
    return ok.includes(b.status) ? { providerCallId: String(b.provider_call_id), status: b.status, durationSeconds: b.duration_seconds } : null;
  },
};

export function getTelephony(): TelephonyAdapter | null {
  if (config.telephonyProvider === 'mock') return mock;
  // Tambahkan adapter Twilio/Telnyx/SIP lokal di sini setelah proof of concept (PRD fase 6).
  return null;
}
export const telephonyReady = () => getTelephony() !== null;
