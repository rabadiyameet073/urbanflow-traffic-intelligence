import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import { signHex, canonicalJson } from '@urbanflow/core';

describe('Edge Gateway HTTP & Security Protocol (Module 21 & 22)', () => {
  const secret = 'test_secret_key_32_characters_ok';
  const env = {
    EVP_HMAC_SECRET: secret,
    ALLOWED_ORIGINS: 'https://urbanflow.pages.dev',
    AI_DAILY_CAP: '1500',
    META_MODEL: 'muse-spark-1.3',
  };

  it('GET /api/health returns 200 and healthy status', async () => {
    const req = new Request('https://edge.urbanflow.dev/api/health', { method: 'GET' });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('healthy');
    expect(body.aiProviders.template).toBe(true);
  });

  it('POST /api/evp accepts validly signed requests', async () => {
    const nowMs = Date.now();
    const evpData = {
      id: 'evp-001',
      lane: 'NB-TR' as const,
      distanceM: 300,
      speedMps: 15,
      tRequestS: 10,
      nonce: 'nonce-abc-123',
      source: 'amb-42',
      ts: nowMs,
    };
    const canonical = canonicalJson(evpData as any);
    const signature = await signHex(secret, canonical);

    const req = new Request('https://edge.urbanflow.dev/api/evp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...evpData, signature }),
    });

    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.decision).toBe('accepted');
    expect(body.reason).toBeNull();
  });

  it('POST /api/evp rejects duplicate nonce (replay attack)', async () => {
    const nowMs = Date.now();
    const evpData = {
      id: 'evp-002',
      lane: 'SB-TR' as const,
      distanceM: 250,
      speedMps: 14,
      tRequestS: 12,
      nonce: 'nonce-duplicate-777',
      source: 'amb-42',
      ts: nowMs,
    };
    const canonical = canonicalJson(evpData as any);
    const signature = await signHex(secret, canonical);

    const makeReq = () =>
      new Request('https://edge.urbanflow.dev/api/evp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...evpData, signature }),
      });

    // First request accepted
    const res1 = await worker.fetch(makeReq(), env, {});
    expect(res1.status).toBe(200);

    // Replay of same nonce rejected
    const res2 = await worker.fetch(makeReq(), env, {});
    expect(res2.status).toBe(409);
    const body2 = (await res2.json()) as any;
    expect(body2.decision).toBe('rejected');
    expect(body2.reason).toBe('NONCE_REPLAY');
  });

  it('POST /api/evp rejects tampered payload or bad signature', async () => {
    const nowMs = Date.now();
    const evpData = {
      id: 'evp-003',
      lane: 'NB-TR' as const,
      distanceM: 300,
      speedMps: 15,
      tRequestS: 10,
      nonce: 'nonce-bad-sig-999',
      source: 'amb-42',
      ts: nowMs,
      signature: 'deadbeef00000000000000000000000000000000000000000000000000000000',
    };

    const req = new Request('https://edge.urbanflow.dev/api/evp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evpData),
    });

    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.decision).toBe('rejected');
    expect(body.reason).toBe('BAD_SIGNATURE');
  });

  it('POST /api/copilot/diagnose returns valid diagnosis via Template fallback', async () => {
    const windowData = {
      lanes: {
        'NB-TR': { queueLengthM: 140, vehicleCount: 22 },
        'SB-TR': { queueLengthM: 30, vehicleCount: 6 },
      },
    };

    const req = new Request('https://edge.urbanflow.dev/api/copilot/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ window: windowData }),
    });

    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.source).toBe('template');
    expect(body.value.severity).toBe('critical');
    expect(body.value.rootCauseHypotheses[0].cause).toBe('BLOCKED_LANE');
  });
});
