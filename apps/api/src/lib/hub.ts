import type { WebSocket } from 'ws';

/** Registri koneksi WebSocket (signaling). Hanya signaling — media audio tidak lewat sini. */
export const ownerSockets = new Map<string, Set<WebSocket>>();
export interface Room { callId: string; caller?: WebSocket; owner?: WebSocket }
export const rooms = new Map<string, Room>();

export const isOwnerOnline = (userId: string) => (ownerSockets.get(userId)?.size ?? 0) > 0;

export function send(ws: WebSocket | undefined, msg: Record<string, unknown>) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
export function sendToOwner(userId: string, msg: Record<string, unknown>) {
  ownerSockets.get(userId)?.forEach((ws) => send(ws, msg));
}
export function room(callId: string): Room {
  let r = rooms.get(callId);
  if (!r) { r = { callId }; rooms.set(callId, r); }
  return r;
}
