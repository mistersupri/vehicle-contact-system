import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

export const wsUrl = (qs = '') => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1/call-signaling${qs}`;

export function clientId(): string {
  try {
    let id = localStorage.getItem('vcs_client');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('vcs_client', id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

export type CallUiState = 'idle' | 'mic' | 'calling' | 'connecting' | 'connected' | 'ended';
export type CallResult = { kind: 'completed' | 'rejected' | 'timeout' | 'unavailable' | 'busy' | 'failed' | 'mic_denied' | 'unsupported' | 'cancelled' | 'limited'; message: string };

export function micSupported() { return !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== 'undefined'; }

/** Timer detik yang berjalan selama `running`. */
export function useSeconds(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return; setS(0);
    const t = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return s;
}

/** Sisi penelepon (pengunjung, tanpa login). Hanya signaling lewat WS; audio langsung via WebRTC. */
export function useCaller(vehicleToken: string) {
  const [state, setState] = useState<CallUiState>('idle');
  const [result, setResult] = useState<CallResult | null>(null);
  const [muted, setMuted] = useState(false);
  const refs = useRef<{ ws?: WebSocket; pc?: RTCPeerConnection; stream?: MediaStream; callId?: string; token?: string; timer?: number; pendingIce: RTCIceCandidateInit[]; done: boolean }>({ pendingIce: [], done: false });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const connected = state === 'connected';
  const seconds = useSeconds(connected);

  const cleanup = useCallback(() => {
    const r = refs.current; r.done = true;
    clearTimeout(r.timer);
    try { r.ws?.close(); } catch { /* */ }
    try { r.pc?.close(); } catch { /* */ }
    r.stream?.getTracks().forEach((t) => t.stop());
    r.ws = r.pc = r.stream = undefined;
  }, []);
  useEffect(() => cleanup, [cleanup]);

  const finish = useCallback((res: CallResult) => { cleanup(); setResult(res); setState('ended'); }, [cleanup]);

  const start = useCallback(async () => {
    const r = refs.current; r.done = false; r.pendingIce = []; setResult(null); setMuted(false);
    if (!micSupported() || !window.isSecureContext) return finish({ kind: 'unsupported', message: 'Perangkat atau browser ini belum mendukung panggilan suara melalui internet.' });
    setState('mic');
    try { r.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
    catch { return finish({ kind: 'mic_denied', message: 'Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan browser, atau kirim pesan.' }); }

    let info: any;
    try { info = await api('/public/calls', { body: { vehicle_token: vehicleToken, client_id: clientId() } }); }
    catch (e) {
      const err = e as ApiError; const code = err.code;
      if (code === 'BUSY') return finish({ kind: 'busy', message: 'Pemilik sedang menerima panggilan lain.' });
      if (['OWNER_OFFLINE', 'QUIET_HOURS', 'WEBRTC_DISABLED', 'ANONYMOUS_DISABLED'].includes(code)) return finish({ kind: 'unavailable', message: 'Pemilik tidak dapat menerima panggilan saat ini.' });
      if (err.status === 429) return finish({ kind: 'limited', message: err.message });
      return finish({ kind: 'failed', message: err.message || 'Panggilan gagal dimulai.' });
    }
    if (r.done) return;
    r.callId = info.call_id; r.token = info.signaling_token;
    setState('calling');
    r.timer = window.setTimeout(() => finish({ kind: 'timeout', message: 'Panggilan tidak dijawab.' }), (info.ring_timeout_seconds + 6) * 1000);

    const ws = new WebSocket(wsUrl(`?token=${encodeURIComponent(info.signaling_token)}`)); r.ws = ws;
    const sendWs = (m: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
    ws.onclose = () => { if (!r.done && (refs.current.pc?.connectionState ?? '') !== 'connected') finish({ kind: 'failed', message: 'Koneksi terputus.' }); };

    const makePc = async () => {
      const pc = new RTCPeerConnection({ iceServers: info.ice_servers }); r.pc = pc;
      r.stream!.getTracks().forEach((t) => pc.addTrack(t, r.stream!));
      pc.onicecandidate = (e) => e.candidate && sendWs({ type: 'call:ice-candidate', candidate: e.candidate });
      pc.ontrack = (e) => { if (audioRef.current) { audioRef.current.srcObject = e.streams[0]; void audioRef.current.play().catch(() => {}); } };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') { clearTimeout(r.timer); setState('connected'); }
        if (pc.connectionState === 'failed') finish({ kind: 'failed', message: 'Koneksi audio gagal tersambung. Coba lagi atau kirim pesan.' });
      };
      await pc.setLocalDescription(await pc.createOffer());
      sendWs({ type: 'call:offer', sdp: pc.localDescription });
    };

    ws.onmessage = async (ev) => {
      const m = JSON.parse(ev.data);
      switch (m.type) {
        case 'call:accept': clearTimeout(r.timer); setState('connecting'); r.timer = window.setTimeout(() => finish({ kind: 'failed', message: 'Koneksi audio tidak kunjung tersambung.' }), 20000); await makePc(); break;
        case 'call:answer': await r.pc?.setRemoteDescription(m.sdp); for (const c of r.pendingIce.splice(0)) await r.pc?.addIceCandidate(c); break;
        case 'call:ice-candidate': if (r.pc?.remoteDescription) await r.pc.addIceCandidate(m.candidate); else r.pendingIce.push(m.candidate); break;
        case 'call:reject': finish({ kind: 'rejected', message: 'Pemilik menolak panggilan.' }); break;
        case 'call:timeout': finish({ kind: 'timeout', message: 'Panggilan tidak dijawab.' }); break;
        case 'call:end': finish({ kind: 'completed', message: 'Panggilan berakhir.' }); break;
        case 'call:error': finish({ kind: 'failed', message: 'Panggilan tidak dapat dilanjutkan.' }); break;
      }
    };
  }, [vehicleToken, finish]);

  const hangup = useCallback(() => {
    const r = refs.current;
    if (r.ws?.readyState === WebSocket.OPEN) r.ws.send(JSON.stringify({ type: 'call:end' }));
    finish({ kind: state === 'connected' ? 'completed' : 'cancelled', message: state === 'connected' ? 'Panggilan berakhir.' : 'Panggilan dibatalkan.' });
  }, [finish, state]);

  const toggleMute = useCallback(() => {
    const s = refs.current.stream; if (!s) return;
    const next = !muted; s.getAudioTracks().forEach((t) => (t.enabled = !next)); setMuted(next);
  }, [muted]);

  const reset = useCallback(() => { cleanup(); setState('idle'); setResult(null); }, [cleanup]);
  return { state, result, muted, seconds, start, hangup, toggleMute, reset, audioRef };
}
