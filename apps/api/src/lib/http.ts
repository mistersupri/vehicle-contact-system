import type { FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError, type ZodTypeAny } from 'zod';
import { get, now } from '../db.ts';
import { hmac } from './security.ts';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
export const notFound = (what = 'Data') => new AppError(404, 'NOT_FOUND', `${what} tidak ditemukan`);

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw zodToApp(r.error);
  return r.data;
}
export function zodToApp(e: ZodError) {
  const fields: Record<string, string> = {};
  for (const i of e.issues) fields[i.path.join('.') || '_'] ??= i.message;
  return new AppError(400, 'VALIDATION_ERROR', 'Data yang dikirim tidak valid', { fields });
}

export const SESSION_COOKIE = 'vcs_session';

export interface AuthUser { id: string; name: string; email: string; status: string; is_admin: boolean; admin_role: string | null; session_id: string }

export function userFromSessionToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const row = get<any>(
    `SELECT u.id,u.name,u.email,u.status,s.id AS session_id, a.role AS admin_role, a.mfa_enabled
     FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN admin_users a ON a.user_id=u.id
     WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.deleted_at IS NULL`,
    hmac(token, 'session'), now(),
  );
  if (!row || row.status !== 'ACTIVE') return null;
  return { id: row.id, name: row.name, email: row.email, status: row.status, session_id: row.session_id, is_admin: !!row.admin_role && !!row.mfa_enabled, admin_role: row.admin_role };
}

export function requireUser(req: FastifyRequest): AuthUser {
  const u = userFromSessionToken(req.cookies[SESSION_COOKIE]);
  if (!u) throw new AppError(401, 'UNAUTHENTICATED', 'Silakan masuk terlebih dahulu');
  return u;
}
export function requireAdmin(req: FastifyRequest, roles: string[] = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR']): AuthUser {
  const u = requireUser(req);
  if (!u.is_admin || !u.admin_role || !roles.includes(u.admin_role)) throw new AppError(403, 'FORBIDDEN', 'Akses ditolak');
  return u;
}

export const ipHash = (req: FastifyRequest) => hmac(req.ip, 'ip');
export const send = (reply: FastifyReply, data: unknown, status = 200) => reply.status(status).send(data);

export function paging(q: any, def = 20) {
  const limit = Math.min(Math.max(Number(q?.limit) || def, 1), 100);
  const page = Math.max(Number(q?.page) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}
