import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DB_FILE = ':memory:';
process.env.CLOUDFLARE_TURN_KEY_ID = 'key123';
process.env.CLOUDFLARE_TURN_API_TOKEN = 'secret-token';

const { getIceServers, normalizeIceServers, _resetIceCache, turnMode } = await import('../src/lib/ice.ts');

const CF = { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u1', credential: 'c1' }] };
const realFetch = globalThis.fetch;
let calls: { url: string; init: any }[] = []; let mode: 'ok' | 'fail' | 'nocreds' = 'ok';
globalThis.fetch = (async (url: any, init: any) => {
  if (!String(url).includes('rtc.live.cloudflare.com')) return realFetch(url, init);
  calls.push({ url: String(url), init });
  if (mode === 'fail') return new Response('nope', { status: 500 });
  return Response.json(mode === 'nocreds' ? { iceServers: [{ urls: 'stun:x' }] } : CF);
}) as any;
beforeEach(() => { calls = []; mode = 'ok'; _resetIceCache(); });
const hasTurn = (s: any[]) => s.some((x) => x.username && x.credential);

test('Cloudflare TURN: memanggil API dengan key id & bearer token, mengembalikan kredensial sementara', async () => {
  assert.equal(turnMode(), 'Cloudflare Realtime TURN');
  const s = await getIceServers('call-1');
  assert.ok(hasTurn(s));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/turn\/keys\/key123\/credentials\/generate-ice-servers$/);
  assert.equal(calls[0].init.headers.authorization, 'Bearer secret-token');
  assert.equal(JSON.parse(calls[0].init.body).ttl, 4 * 3600);
});

test('kredensial di-cache dan permintaan bersamaan digabung (hemat kuota API)', async () => {
  await Promise.all([getIceServers('a'), getIceServers('b'), getIceServers('c')]);
  await getIceServers('d');
  assert.equal(calls.length, 1);
});

test('Cloudflare gagal atau respons tanpa kredensial: panggilan tetap jalan dengan STUN', async () => {
  mode = 'fail';
  const s = await getIceServers('x');
  assert.equal(s.length, 1); assert.ok(!hasTurn(s)); assert.ok(String(s[0].urls).startsWith('stun:'));
  mode = 'nocreds'; _resetIceCache();
  assert.ok(!hasTurn(await getIceServers('y')), 'respons tanpa kredensial ditolak');
});

test('normalisasi mendukung array maupun objek tunggal & membuang entri rusak', () => {
  assert.equal(normalizeIceServers({ urls: 'turn:a', username: 'u', credential: 'c' }).length, 1);
  assert.equal(normalizeIceServers([{ urls: 'stun:a' }, null, { foo: 1 }]).length, 1);
  assert.deepEqual(normalizeIceServers(undefined), []);
});
