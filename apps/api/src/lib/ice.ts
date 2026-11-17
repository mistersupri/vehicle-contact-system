import crypto from 'node:crypto';
import { config } from '../config.ts';

export interface IceServer { urls: string | string[]; username?: string; credential?: string }

/**
 * Sumber server ICE, urut prioritas:
 *  1. Cloudflare Realtime TURN (kredensial sementara dari REST API; tanpa IP publik/server TURN sendiri)
 *  2. coturn sendiri (kredensial HMAC sementara)
 *  3. STUN saja
 * Kegagalan Cloudflare tidak menjatuhkan panggilan: pakai cache yang masih berlaku, lalu STUN.
 */
const CF_TTL_SECONDS = 4 * 3600;     // masa berlaku kredensial di sisi Cloudflare
const CF_REFRESH_AFTER_MS = 2 * 3600_000; // ambil baru setelah 2 jam → paparan maksimum 4 jam
const CF_TIMEOUT_MS = 4000;

let cache: { servers: IceServer[]; at: number } | null = null;
let inflight: Promise<IceServer[]> | null = null;

export const cloudflareTurnConfigured = () => !!(config.cfTurnKeyId && config.cfTurnApiToken);
export const turnMode = () => (cloudflareTurnConfigured() ? 'Cloudflare Realtime TURN' : config.turnUrl ? 'coturn' : 'hanya STUN');

/** Terima format array (generate-ice-servers) maupun objek tunggal (format lama). */
export function normalizeIceServers(raw: unknown): IceServer[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .filter((s: any) => s && (typeof s.urls === 'string' || Array.isArray(s.urls)))
    .map((s: any) => ({ urls: s.urls, ...(s.username ? { username: s.username } : {}), ...(s.credential ? { credential: s.credential } : {}) }));
}

async function fetchCloudflare(): Promise<IceServer[]> {
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(config.cfTurnKeyId)}/credentials/generate-ice-servers`, {
    method: 'POST', headers: { authorization: `Bearer ${config.cfTurnApiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: CF_TTL_SECONDS }), signal: AbortSignal.timeout(CF_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Cloudflare TURN HTTP ${res.status}`);
  const servers = normalizeIceServers(((await res.json()) as any)?.iceServers);
  if (!servers.some((s) => s.username && s.credential)) throw new Error('Cloudflare TURN: respons tanpa kredensial');
  return servers;
}

async function cloudflareServers(): Promise<IceServer[] | null> {
  const fresh = cache && Date.now() - cache.at < CF_REFRESH_AFTER_MS;
  if (fresh) return cache!.servers;
  try {
    inflight ??= fetchCloudflare().finally(() => { inflight = null; }); // satu permintaan untuk banyak panggilan bersamaan
    const servers = await inflight;
    cache = { servers, at: Date.now() };
    return servers;
  } catch (e) {
    console.warn(`[ice] ${(e as Error).message} — memakai ${cache && Date.now() - cache.at < CF_TTL_SECONDS * 1000 - 60_000 ? 'cache' : 'fallback STUN'}`);
    return cache && Date.now() - cache.at < CF_TTL_SECONDS * 1000 - 60_000 ? cache.servers : null;
  }
}

function coturnServers(callId: string): IceServer[] {
  const username = `${Math.floor(Date.now() / 1000) + 3600}:${callId}`;
  const credential = crypto.createHmac('sha1', config.turnSecret).update(username).digest('base64');
  return [{ urls: config.turnUrl.split(',') as string[], username, credential }];
}

export async function getIceServers(callId: string): Promise<IceServer[]> {
  if (cloudflareTurnConfigured()) {
    const cf = await cloudflareServers();
    if (cf) return cf;
  }
  const servers: IceServer[] = [{ urls: config.stunUrl }];
  if (config.turnUrl && config.turnSecret) servers.push(...coturnServers(callId));
  return servers;
}

export const _resetIceCache = () => { cache = null; inflight = null; }; // untuk tes
