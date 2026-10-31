/**
 * Module 21 & Module 22: HTTP Helpers & Uniform Error Envelopes
 */

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Cache-Control': 'no-store',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  requestId = crypto.randomUUID(),
  extraHeaders: Record<string, string> = {},
): Response {
  const payload: ErrorEnvelope = {
    error: {
      code,
      message,
      requestId,
    },
  };
  return json(payload, status, extraHeaders);
}

export function corsHeaders(origin: string | null, allowedOriginsStr: string): Record<string, string> {
  if (!origin) return {};
  const allowed = allowedOriginsStr.split(',').map((o) => o.trim());
  if (allowed.includes(origin) || allowed.includes('*')) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
  }
  return {};
}

export async function readJson<T>(req: Request, maxBytes: number): Promise<T> {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('INVALID_JSON');
  }
}
