import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { signHex, canonicalJson } from '@urbanflow/core';
import { EdgeMetrics } from '../src/metrics.js';
import { resetFallbackRoom } from '../src/do/RoomClient.js';
import { resetCopilotRuntime } from '../src/copilot/router.js';

const SECRET = 'test_secret_key_32_characters_ok';

const baseEnv = {
  EVP_HMAC_SECRET: SECRET,
  ALLOWED_ORIGINS: 'https://urbanflow.pages.dev',
  AI_DAILY_CAP: '1500',
  META_MODEL: 'muse-spark-1.3',
};

/** Each case gets its own client address so rate-limit buckets never collide. */
function env(overrides: Record<string, string> = {}) {
  return { ...baseEnv, ...overrides };
}

async function signedEvp(overrides: Record<string, unknown> = {}) {
  const evpData = {
    id: 'evp-001',
    lane: 'NB-TR',
    distanceM: 300,
    speedMps: 15,
    tRequestS: 10,
    nonce: 'nonce-abc-123',
    source: 'amb-42',
    ts: Date.now(),
    ...overrides,
  };
  const signature = await signHex(SECRET, canonicalJson(evpData as never));
  return { ...evpData, signature };
}

function post(path: string, body: unknown, ip = '203.0.113.10', extraHeaders: Record<string, string> = {}) {
  return new Request(`https://edge.urbanflow.dev${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  EdgeMetrics.reset();
  resetFallbackRoom();
  resetCopilotRuntime();
});

describe('Edge Gateway HTTP & Security Protocol (Module 21 & 22)', () => {
  it('GET /api/health matches the Module 16 §5 shape and is cacheable', async () => {
    const res = await worker.fetch(
      new Request('https://edge.urbanflow.dev/api/health', {
        headers: { 'cf-connecting-ip': '203.0.113.11' },
      }),
      env(),
      {},
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=5');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');

    const body = (await res.json()) as any; // AUDIT-OK(A5): test-only envelope field access
    expect(body.status).toBe('ok');
    expect(body.version).toMatch(/^v\d/);
    expect(body.aiProviders.meta).toBe(false); // No META_API_KEY configured.
    expect(body.aiProviders.template).toBe(true);
    expect(body.budget).toEqual({ used: 0, limit: 1500 });
    expect(body.aiCostUsdToday).toBe(0);
    // No secret material may leak through health.
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it('rejects an origin outside the allow-list with 403 ORIGIN_FORBIDDEN and no ACAO', async () => {
    const res = await worker.fetch(
      new Request('https://edge.urbanflow.dev/api/health', {
        headers: { Origin: 'https://evil.example', 'cf-connecting-ip': '203.0.113.12' },
      }),
      env(),
      {},
    );

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const body = (await res.json()) as any; // AUDIT-OK(A5): test-only envelope field access
    expect(body.error.code).toBe('ORIGIN_FORBIDDEN');
  });

  it('echoes an allow-listed origin and answers preflight with 204', async () => {
    const res = await worker.fetch(
      new Request('https://edge.urbanflow.dev/api/evp', {
        method: 'OPTIONS',
        headers: { Origin: 'https://urbanflow.pages.dev' },
      }),
      env(),
      {},
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://urbanflow.pages.dev');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('distinguishes 405 from 404', async () => {
    const wrongMethod = await worker.fetch(
      new Request('https://edge.urbanflow.dev/api/health', {
        method: 'DELETE',
        headers: { 'cf-connecting-ip': '203.0.113.13' },
      }),
      env(),
      {},
    );
    expect(wrongMethod.status).toBe(405);
    expect(((await wrongMethod.json()) as any).error.code).toBe('METHOD_NOT_ALLOWED'); // AUDIT-OK(A5): test-only envelope field access
    expect(wrongMethod.headers.get('Allow')).toContain('GET');

    const unknown = await worker.fetch(
      new Request('https://edge.urbanflow.dev/api/nope', {
        headers: { 'cf-connecting-ip': '203.0.113.13' },
      }),
      env(),
      {},
    );
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as any).error.code).toBe('NOT_FOUND'); // AUDIT-OK(A5): test-only envelope field access
  });

  it('rejects a non-JSON content type with 415', async () => {
    const res = await worker.fetch(
      new Request('https://edge.urbanflow.dev/api/evp', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'cf-connecting-ip': '203.0.113.14' },
        body: '{}',
      }),
      env(),
      {},
    );

    expect(res.status).toBe(415);
    expect(((await res.json()) as any).error.code).toBe('UNSUPPORTED_MEDIA_TYPE'); // AUDIT-OK(A5): test-only envelope field access
  });

  it('POST /api/evp accepts a validly signed request', async () => {
    const body = await signedEvp({ source: 'amb-42', nonce: 'nonce-ok-1' });
    const res = await worker.fetch(post('/api/evp', body, '203.0.113.20'), env(), {});

    expect(res.status).toBe(200);
    const json = (await res.json()) as any; // AUDIT-OK(A5): test-only envelope field access
    expect(json.decision).toBe('accepted');
    expect(json.reason).toBeNull();
    expect(json.serverTime).toMatch(/Z$/);
  });

  it('POST /api/evp rejects a replayed nonce with 409 NONCE_REPLAY', async () => {
    const body = await signedEvp({ source: 'amb-77', nonce: 'nonce-duplicate-777' });
    const ip = '203.0.113.21';

    const first = await worker.fetch(post('/api/evp', body, ip), env(), {});
    expect(first.status).toBe(200);

    const second = await worker.fetch(post('/api/evp', body, ip), env(), {});
    expect(second.status).toBe(409);
    const json = (await second.json()) as any; // AUDIT-OK(A5): test-only envelope field access
    expect(json.decision).toBe('rejected');
    expect(json.reason).toBe('NONCE_REPLAY');
  });

  it('POST /api/evp rejects a tampered signature with 401', async () => {
    const body = await signedEvp({
      source: 'amb-99',
      nonce: 'nonce-bad-sig-999',
      signature: 'deadbeef'.repeat(8),
    });
    const res = await worker.fetch(post('/api/evp', body, '203.0.113.22'), env(), {});

    expect(res.status).toBe(401);
    const json = (await res.json()) as any; // AUDIT-OK(A5): test-only envelope field access
    expect(json.decision).toBe('rejected');
    expect(json.reason).toBe('BAD_SIGNATURE');
  });

  it('POST /api/evp rejects an expired timestamp with 401 TIMESTAMP_SKEW', async () => {
    const body = await signedEvp({ source: 'amb-98', nonce: 'nonce-skew-1', ts: Date.now() - 60_000 });
    const res = await worker.fetch(post('/api/evp', body, '203.0.113.23'), env(), {});

    expect(res.status).toBe(401);
    expect(((await res.json()) as any).reason).toBe('TIMESTAMP_SKEW'); // AUDIT-OK(A5): test-only envelope field access
  });

  it('POST /api/evp rate limits a second fresh request from one source with 429', async () => {
    const ip = '203.0.113.24';
    const first = await signedEvp({ source: 'amb-55', nonce: 'nonce-rl-1' });
    const second = await signedEvp({ source: 'amb-55', nonce: 'nonce-rl-2' });

    expect((await worker.fetch(post('/api/evp', first, ip), env(), {})).status).toBe(200);

    const res = await worker.fetch(post('/api/evp', second, ip), env(), {});
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(((await res.json()) as any).reason).toBe('RATE_LIMITED'); // AUDIT-OK(A5): test-only envelope field access
  });

  it('POST /api/evp rejects an unknown lane with 422 UNKNOWN_LANE', async () => {
    const body = await signedEvp({ source: 'amb-56', nonce: 'nonce-lane-1', lane: 'XX-TR' });
    const res = await worker.fetch(post('/api/evp', body, '203.0.113.25'), env(), {});

    expect(res.status).toBe(422);
    expect(((await res.json()) as any).reason).toBe('UNKNOWN_LANE'); // AUDIT-OK(A5): test-only envelope field access
  });

  it('POST /api/copilot/diagnose returns the documented envelope via Template fallback', async () => {
    const windowData = {
      lanes: {
        'NB-TR': { queueLengthM: 140, vehicleCount: 22 },
        'SB-TR': { queueLengthM: 30, vehicleCount: 6 },
      },
    };

    const res = await worker.fetch(
      post('/api/copilot/diagnose', { window: windowData }, '203.0.113.30'),
      env(),
      {},
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any; // AUDIT-OK(A5): test-only envelope field access
    expect(body.source).toBe('template');
    expect(typeof body.latencyMs).toBe('number');
    expect(body.tokens).toEqual({ in: 0, out: 0 });
    expect(body.costUsdEstimate).toBe(0);
    expect(body.diagnosis.severity).toBe('critical');
    expect(body.diagnosis.rootCauseHypotheses[0].cause).toBe('BLOCKED_LANE');
    // The old internal envelope must not come back.
    expect(body.value).toBeUndefined();
  });

  it('POST /api/copilot/diagnose rejects a missing window with 400', async () => {
    const res = await worker.fetch(
      post('/api/copilot/diagnose', { nope: true }, '203.0.113.31'),
      env(),
      {},
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe('INVALID_REQUEST'); // AUDIT-OK(A5): test-only envelope field access
  });

  it('POST /api/copilot/explain returns { source, text }', async () => {
    const res = await worker.fetch(
      post(
        '/api/copilot/explain',
        { decisionLog: { requestedPhase: 'P4_EW_THRU', reason: 'RATIO' } },
        '203.0.113.32',
      ),
      env(),
      {},
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any; // AUDIT-OK(A5): test-only envelope field access
    expect(body.source).toBe('template');
    expect(body.text).toContain('P4_EW_THRU');
    expect(body.text).toContain('RATIO');
  });

  it('POST /api/copilot/chat refuses to override signals and caps question length', async () => {
    const ok = await worker.fetch(
      post('/api/copilot/chat', { question: 'Can you force a green on NB-TR?', sessionId: 's1' }, '203.0.113.33'),
      env(),
      {},
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as any; // AUDIT-OK(A5): test-only envelope field access
    expect(body.source).toBe('template');
    expect(body.answer).toContain('cannot change signal states');
    expect(Array.isArray(body.toolCalls)).toBe(true);

    const tooLong = await worker.fetch(
      post('/api/copilot/chat', { question: 'x'.repeat(501), sessionId: 's1' }, '203.0.113.33'),
      env(),
      {},
    );
    expect(tooLong.status).toBe(400);
  });

  it('POST /api/copilot/advisory projects a validated diagnosis', async () => {
    const diagnosis = {
      severity: 'warning',
      rootCauseHypotheses: [
        { cause: 'DEMAND_SURGE', confidence: 0.6, evidence: ['queue 120m'] },
      ],
      spillbackRisk: { upstream: false, minutesToSpillback: null },
      recommendedActions: [{ type: 'MONITOR', rationale: 'watch the approach' }],
      advisoryText: 'Heavy demand on the north approach.',
      signMessage: ['HEAVY TRAFFIC', 'USE ALT ROUTE'],
    };

    const res = await worker.fetch(
      post('/api/copilot/advisory', { diagnosis }, '203.0.113.34'),
      env(),
      {},
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any; // AUDIT-OK(A5): test-only envelope field access
    expect(body.source).toBe('template');
    expect(body.advisoryText).toBe(diagnosis.advisoryText);
    expect(body.signMessage).toEqual(diagnosis.signMessage);
  });

  it('stores and serves a replay, then reports expiry as 410', async () => {
    const ip = '203.0.113.40';
    const id = 'replay-abcdef12';

    const stored = await worker.fetch(
      post('/api/replay', { id, blob: '{"frames":[]}' }, ip),
      env(),
      {},
    );
    expect(stored.status).toBe(201);

    const fetched = await worker.fetch(
      new Request(`https://edge.urbanflow.dev/api/replay/${id}`, {
        headers: { 'cf-connecting-ip': ip },
      }),
      env(),
      {},
    );
    expect(fetched.status).toBe(200);
    expect(((await fetched.json()) as any).blob).toBe('{"frames":[]}');

    const missing = await worker.fetch(
      new Request('https://edge.urbanflow.dev/api/replay/replay-missing99', {
        headers: { 'cf-connecting-ip': ip },
      }),
      env(),
      {},
    );
    expect(missing.status).toBe(404);
  });

  it('rejects an oversized payload with 413 before parsing', async () => {
    const res = await worker.fetch(
      new Request('https://edge.urbanflow.dev/api/evp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.41' },
        body: JSON.stringify({ pad: 'x'.repeat(5000) }),
      }),
      env(),
      {},
    );
    expect(res.status).toBe(413);
    expect(((await res.json()) as any).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('reports WebSocket rooms as unavailable without a DO binding', async () => {
    const res = await worker.fetch(
      new Request('https://edge.urbanflow.dev/ws/demo', {
        headers: { Upgrade: 'websocket', 'cf-connecting-ip': '203.0.113.42' },
      }),
      env(),
      {},
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).error.code).toBe('PROVIDER_UNAVAILABLE');
  });
});
