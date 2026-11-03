/**
 * Module 21 §7 & Module 22 §2: HTTP Helpers & Uniform Error Envelopes
 *
 * Every response produced by the gateway carries the security header set below,
 * `Cache-Control: no-store` (except `/api/health`, which is cacheable for 5 s),
 * and, for JSON bodies, the exact media type `application/json; charset=utf-8`.
 */

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

/** Module 21 §7. `Cache-Control` is applied per response, so it is not listed here. */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  // The gateway is an API only; keep it out of search indexes (Module 33).
  'X-Robots-Tag': 'noindex',
};

/** Module 22 §2: everything is `no-store` except health. */
export const CACHE_NO_STORE = 'no-store';
export const CACHE_HEALTH = 'public, max-age=5';

export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
  cacheControl: string = CACHE_NO_STORE,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': JSON_CONTENT_TYPE,
      ...SECURITY_HEADERS,
      'Cache-Control': cacheControl,
      ...headers,
    },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  requestId: string = crypto.randomUUID(),
  extraHeaders: Record<string, string> = {},
): Response {
  const payload: ErrorEnvelope = { error: { code, message, requestId } };
  return json(payload, status, { 'X-Request-Id': requestId, ...extraHeaders });
}

/** Module 22 §2.1: `429`/`503` advertise `Retry-After` when the wait is known. */
export function retryAfterHeaders(seconds: number): Record<string, string> {
  return { 'Retry-After': String(Math.max(1, Math.ceil(seconds))) };
}

function allowedList(allowedOriginsStr: string): string[] {
  return allowedOriginsStr
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/**
 * Module 22 §2: allow-list echo, never a wildcard.
 * A literal `*` in configuration is ignored on purpose — echoing `*` would make
 * credentialed cross-origin reads legal and defeat the allow-list.
 */
export function isOriginAllowed(origin: string | null, allowedOriginsStr: string): boolean {
  if (!origin) return true; // Non-browser caller (curl, smoke script, server-to-server).
  return allowedList(allowedOriginsStr).includes(origin);
}

export function corsHeaders(
  origin: string | null,
  allowedOriginsStr: string,
): Record<string, string> {
  // `Vary: Origin` keeps shared caches from serving the wrong ACAO.
  const base: Record<string, string> = { Vary: 'Origin' };
  if (!origin || !allowedList(allowedOriginsStr).includes(origin)) return base;
  return {
    ...base,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Request-Id',
    'Access-Control-Expose-Headers': 'X-Request-Id, Retry-After',
    'Access-Control-Max-Age': '86400',
  };
}

/** Preflight for an allowed origin (Module 21 §7). */
export function preflightResponse(
  origin: string | null,
  allowedOriginsStr: string,
): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...SECURITY_HEADERS,
      'Cache-Control': CACHE_NO_STORE,
      ...corsHeaders(origin, allowedOriginsStr),
    },
  });
}

/** Module 22 §2: `application/json; charset=utf-8` only, otherwise `415`. */
export function isJsonRequest(req: Request): boolean {
  const raw = req.headers.get('content-type');
  if (!raw) return false;
  return raw.split(';')[0]!.trim().toLowerCase() === 'application/json';
}

export async function readJson<T>(req: Request, maxBytes: number): Promise<T> {
  // Module 22 §2: enforce the size limit *before* parsing.
  const contentLength = req.headers.get('content-length');
  if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }

  // Module 22 §2: "no NaN/Infinity (reject)" — JSON.parse already rejects the
  // literals, but `1e999` parses to Infinity, so the numeric sweep is required.
  if (!isFiniteDeep(parsed)) {
    throw new Error('INVALID_JSON');
  }
  return parsed as T;
}

function isFiniteDeep(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((v) => isFiniteDeep(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every((v) =>
      isFiniteDeep(v, depth + 1),
    );
  }
  return true;
}

/** RFC 4122 request id, or the caller's `X-Request-Id` when it is well-formed. */
export function resolveRequestId(req: Request): string {
  const supplied = req.headers.get('x-request-id');
  if (supplied && /^[A-Za-z0-9_-]{8,64}$/.test(supplied)) return supplied;
  return crypto.randomUUID();
}
