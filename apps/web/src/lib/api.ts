export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>, public extra?: Record<string, any>) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET');
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method, signal: opts.signal, credentials: 'same-origin',
      headers: { 'x-requested-with': 'vcs', ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    const { code, message, fields, request_id, ...extra } = e;
    throw new ApiError(res.status, code ?? 'ERROR', message ?? 'Terjadi kesalahan', fields, extra);
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Terjadi kesalahan tak terduga');
