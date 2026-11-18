import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { micSupported, useSeconds, wsUrl } from './webrtc';

export interface Invite { call_id: string; plate: string; vehicle_name?: string | null; reference: string; started_at: string; ring_timeout: number }
/** Notifikasi mendesak: alert layar penuh bergaya panggilan, TANPA audio/WebRTC (tidak memakai TURN). */
export interface UrgentAlert { report_id: string; reference: string; plate: string; vehicle_name: string | null; category: string; category_label: string; message: string }
interface Ctx {
  socket: 'connecting' | 'online' | 'offline';
  incoming: Invite | null;
  alert: UrgentAlert | null; dismissAlert: () => void;
  active: { call_id: string; plate: string; vehicle_name?: string | null; state: 'connecting' | 'connected' } | null;
  seconds: number; muted: boolean; notice: string | null;
  accept: () => Promise<void>; reject: () => void; hangup: () => void; toggleMute: () => void; dismissNotice: () => void;
}
const C = createContext<Ctx>(null as any);
export const useOwnerCall = () => useContext(C);

/** Nada dering sederhana via WebAudio (tidak butuh file audio). Bisa diblokir browser sebelum ada interaksi. */
function useRingtone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let ctx: AudioContext | null = null; let t: number;
    try { ctx = new AudioContext(); } catch { return; }
    const beep = () => {
      if (!ctx) return;
      for (const [f, d] of [[880, 0], [660, 0.22]] as const) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine'; o.connect(g); g.connect(ctx.destination);
        const at = ctx.currentTime + d; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.18, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
        o.start(at); o.stop(at + 0.32);
      }
      navigator.vibrate?.([300, 150, 300]);
    };
    void ctx.resume().catch(() => {}); beep(); t = window.setInterval(beep, 2200);
    return () => { clearInterval(t); void ctx?.close().catch(() => {}); };
  }, [on]);
}

/** Nada alert mendesak (bip pendek cepat), berhenti otomatis setelah 30 detik. */
function useAlertTone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let ctx: AudioContext | null = null;
    try { ctx = new AudioContext(); } catch { return; }
    const beep = () => {
      if (!ctx) return;
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 1040; o.connect(g); g.connect(ctx.destination);
        const at = ctx.currentTime + i * 0.2; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
        o.start(at); o.stop(at + 0.16);
      }
      navigator.vibrate?.([200, 100, 200, 100, 200]);
    };
    void ctx.resume().catch(() => {}); beep();
    const t = window.setInterval(beep, 1800), stop = window.setTimeout(() => clearInterval(t), 30_000);
    return () => { clearInterval(t); clearTimeout(stop); void ctx?.close().catch(() => {}); };
  }, [on]);
}

export function OwnerCallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Ctx['socket']>('connecting');
  const [incoming, setIncoming] = useState<Invite | null>(null);
  const [alert, setAlert] = useState<UrgentAlert | null>(null);
  const [active, setActive] = useState<Ctx['active']>(null);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const R = useRef<{ ws?: WebSocket; pc?: RTCPeerConnection; stream?: MediaStream; ice: RTCIceCandidateInit[]; incoming: Invite | null; active: Ctx['active']; audio?: HTMLAudioElement }>({ ice: [], incoming: null, active: null });
  R.current.incoming = incoming; R.current.active = active;
  const seconds = useSeconds(active?.state === 'connected');
  useRingtone(!!incoming);
  useAlertTone(!!alert && !incoming);

  const teardown = useCallback(() => {
    const r = R.current;
    try { r.pc?.close(); } catch { /* */ }
    r.stream?.getTracks().forEach((t) => t.stop());
    if (r.audio) { r.audio.srcObject = null; r.audio.remove(); r.audio = undefined; }
    r.pc = r.stream = undefined; r.ice = [];
    setActive(null); setMuted(false);
  }, []);

  const send = (m: object) => { const ws = R.current.ws; if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

  useEffect(() => {
    if (!user) { setSocket('offline'); return; }
    let closed = false, retry = 0, timer: number;
    const connect = () => {
      setSocket('connecting');
      const ws = new WebSocket(wsUrl()); R.current.ws = ws;
      ws.onopen = () => { retry = 0; };
      ws.onclose = () => { if (closed) return; setSocket('offline'); timer = window.setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000)); };
      ws.onmessage = async (ev) => {
        const m = JSON.parse(ev.data); const r = R.current;
        switch (m.type) {
          case 'hello': setSocket('online'); break;
          case 'call:invite':
            if (r.active) { send({ type: 'call:reject', call_id: m.call_id }); break; }
            setIncoming({ call_id: m.call_id, plate: m.plate, vehicle_name: m.vehicle_name, reference: m.reference, started_at: m.started_at, ring_timeout: m.ring_timeout });
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
              const n = new Notification('Panggilan masuk', { body: `QR kendaraan ${m.plate} sedang menghubungi Anda`, tag: m.call_id, requireInteraction: true });
              n.onclick = () => { window.focus(); n.close(); };
            }
            void qc.invalidateQueries({ queryKey: ['calls'] });
            break;
          case 'alert:urgent':
            setAlert({ report_id: m.report_id, reference: m.reference, plate: m.plate, vehicle_name: m.vehicle_name ?? null, category: m.category, category_label: m.category_label, message: m.message });
            void qc.invalidateQueries({ queryKey: ['summary'] }); void qc.invalidateQueries({ queryKey: ['reports'] });
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
              const n = new Notification('Notifikasi mendesak', { body: `${m.vehicle_name ? m.vehicle_name + ' · ' : ''}${m.plate}: ${m.message}`, tag: m.report_id, requireInteraction: true });
              n.onclick = () => { window.focus(); n.close(); };
            }
            break;
          case 'alert:dismiss': setAlert((a) => (a && a.report_id === m.report_id ? null : a)); break;
          case 'call:cancelled': case 'call:taken':
            if (r.incoming?.call_id === m.call_id && !(m.type === 'call:taken' && r.active?.call_id === m.call_id)) setIncoming(null);
            void qc.invalidateQueries({ queryKey: ['calls'] }); void qc.invalidateQueries({ queryKey: ['summary'] });
            break;
          case 'call:offer': {
            if (!r.stream || !r.active) break;
            const pc = new RTCPeerConnection({ iceServers: m.ice_servers }); r.pc = pc;
            r.stream.getTracks().forEach((t) => pc.addTrack(t, r.stream!));
            pc.onicecandidate = (e) => e.candidate && send({ type: 'call:ice-candidate', call_id: m.call_id, candidate: e.candidate });
            pc.ontrack = (e) => { const a = r.audio ?? document.body.appendChild(document.createElement('audio')); r.audio = a; a.autoplay = true; a.srcObject = e.streams[0]; void a.play().catch(() => {}); };
            pc.onconnectionstatechange = () => {
              if (pc.connectionState === 'connected') setActive((a) => (a ? { ...a, state: 'connected' } : a));
              if (pc.connectionState === 'failed') { send({ type: 'call:end', call_id: m.call_id }); setNotice('Koneksi audio gagal tersambung.'); teardown(); }
            };
            await pc.setRemoteDescription(m.sdp);
            for (const c of r.ice.splice(0)) await pc.addIceCandidate(c);
            await pc.setLocalDescription(await pc.createAnswer());
            send({ type: 'call:answer', call_id: m.call_id, sdp: pc.localDescription });
            break;
          }
          case 'call:ice-candidate': if (r.pc?.remoteDescription) await r.pc.addIceCandidate(m.candidate); else r.ice.push(m.candidate); break;
          case 'call:end': if (r.active) { setNotice('Panggilan berakhir.'); teardown(); void qc.invalidateQueries({ queryKey: ['calls'] }); } break;
          case 'call:error': if (r.active) { setNotice('Panggilan terputus.'); teardown(); } break;
        }
      };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); R.current.ws?.close(); setSocket('offline'); };
  }, [user?.id, qc, teardown]);

  // Tutup dering otomatis jika melewati batas waktu (server juga mengirim call:cancelled)
  useEffect(() => {
    if (!incoming) return;
    const t = setTimeout(() => setIncoming(null), (incoming.ring_timeout + 3) * 1000);
    return () => clearTimeout(t);
  }, [incoming]);

  const accept = useCallback(async () => {
    const inv = R.current.incoming; if (!inv) return;
    if (!micSupported()) { setNotice('Browser ini tidak mendukung panggilan suara.'); send({ type: 'call:reject', call_id: inv.call_id }); setIncoming(null); return; }
    try { R.current.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); }
    catch { setNotice('Izin mikrofon ditolak, panggilan tidak dapat dijawab.'); send({ type: 'call:reject', call_id: inv.call_id }); setIncoming(null); return; }
    const act = { call_id: inv.call_id, plate: inv.plate, vehicle_name: inv.vehicle_name, state: 'connecting' as const };
    setActive(act); R.current.active = act;
    setIncoming(null);
    send({ type: 'call:accept', call_id: inv.call_id });
  }, []);
  const reject = useCallback(() => { const i = R.current.incoming; if (i) send({ type: 'call:reject', call_id: i.call_id }); setIncoming(null); void qc.invalidateQueries({ queryKey: ['calls'] }); }, [qc]);
  const hangup = useCallback(() => { const a = R.current.active; if (a) send({ type: 'call:end', call_id: a.call_id }); teardown(); void qc.invalidateQueries({ queryKey: ['calls'] }); }, [teardown, qc]);
  const toggleMute = useCallback(() => { const s = R.current.stream; if (!s) return; const n = !muted; s.getAudioTracks().forEach((t) => (t.enabled = !n)); setMuted(n); }, [muted]);

  return <C.Provider value={{ socket, incoming, alert, dismissAlert: () => setAlert(null), active, seconds, muted, notice, accept, reject, hangup, toggleMute, dismissNotice: () => setNotice(null) }}>{children}</C.Provider>;
}
