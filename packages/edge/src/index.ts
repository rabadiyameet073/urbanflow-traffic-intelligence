/**
 * Module 21 & Module 22: Edge Gateway Main Worker Entrypoint
 */
import { Router } from './router.js';
import { parseEnv, Env } from './env.js';
import { json, errorResponse, corsHeaders, readJson } from './http/index.js';
import { verifyEvpSignature, hashIp } from './security/index.js';
import { Room } from './do/Room.js';
import { BudgetGuard } from './budget/guard.js';
import { MetaProvider } from './copilot/providers/meta.js';
import { CopilotRouter } from './copilot/router.js';
import { SignedEvpSchema, signHex, canonicalJson } from '@urbanflow/core';

export { Room };

let fallbackGlobalRoom: Room | null = null;

export default {
  async fetch(req: Request, envRaw: unknown, ctx: any): Promise<Response> {
    const env = parseEnv(envRaw);
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const clientIp = req.headers.get('cf-connecting-ip') ?? '127.0.0.1';
    const ipHash = await hashIp(clientIp);

    // Preflight OPTIONS handling
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, env.ALLOWED_ORIGINS),
      });
    }

    if (!fallbackGlobalRoom) {
      fallbackGlobalRoom = new Room(ctx, env);
    }
    const globalRoom = env.ROOM ? env.ROOM.get(env.ROOM.idFromName('__global__')) : fallbackGlobalRoom;
    const router = new Router();
    const budgetGuard = new BudgetGuard(globalRoom, parseInt(env.AI_DAILY_CAP, 10));
    const metaProvider = new MetaProvider(env.META_API_KEY, env.META_API_BASE, env.META_MODEL);
    const copilotRouter = new CopilotRouter(metaProvider, budgetGuard);

    // 1. GET /api/health
    router.add('GET', '/api/health', async () => {
      return json({
        status: 'healthy',
        version: '1.0.0',
        aiProviders: {
          meta: metaProvider.isAvailable(),
          template: true,
        },
        model: env.META_MODEL,
        serverTime: new Date().toISOString(),
      }, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
    });

    // 2. POST /api/evp (Authenticated EVP Gateway)
    router.add('POST', '/api/evp', async (request) => {
      try {
        const body = await readJson<any>(request, 4096); // 4 KB limit
        const parsed = SignedEvpSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse('INVALID_REQUEST', 'Schema validation failed', 400);
        }

        const signedEvp = parsed.data;

        // Verify HMAC-SHA256 signature and 30s timestamp window
        const verifyRes = await verifyEvpSignature(env.EVP_HMAC_SECRET, signedEvp);
        if (!verifyRes.ok) {
          return json({
            id: signedEvp.id,
            decision: 'rejected',
            reason: verifyRes.reason,
            serverTime: new Date().toISOString(),
          }, 401, corsHeaders(origin, env.ALLOWED_ORIGINS));
        }

        // Check atomic nonce in Durable Object
        const isFreshNonce = await globalRoom.checkAndInsertNonce(signedEvp.nonce);
        if (!isFreshNonce) {
          return json({
            id: signedEvp.id,
            decision: 'rejected',
            reason: 'NONCE_REPLAY',
            serverTime: new Date().toISOString(),
          }, 409, corsHeaders(origin, env.ALLOWED_ORIGINS));
        }

        return json({
          id: signedEvp.id,
          decision: 'accepted',
          reason: null,
          serverTime: new Date().toISOString(),
        }, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
      } catch (err: any) {
        if (err.message === 'PAYLOAD_TOO_LARGE') {
          return errorResponse('PAYLOAD_TOO_LARGE', 'Payload exceeds 4KB', 413);
        }
        return errorResponse('INVALID_JSON', 'Malformed JSON payload', 400);
      }
    });

    // 3. POST /api/evp/demo-token
    router.add('POST', '/api/evp/demo-token', async () => {
      const nowMs = Date.now();
      const nonce = crypto.randomUUID().slice(0, 8);
      const evpData = {
        id: `evp-demo-${nowMs}`,
        lane: 'NB-TR',
        distanceM: 300,
        speedMps: 15,
        tRequestS: 0,
        nonce,
        source: 'demo-client',
        ts: nowMs,
      };
      const canonical = canonicalJson(evpData as any);
      const signature = await signHex(env.EVP_HMAC_SECRET, canonical);

      return json({
        ...evpData,
        signature,
      }, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
    });

    // 4. POST /api/replay (Store replay blob)
    router.add('POST', '/api/replay', async (request) => {
      try {
        const body = await readJson<{ id: string; blob: string }>(request, 204800); // 200 KB
        if (!body.id || !body.blob) {
          return errorResponse('INVALID_REQUEST', 'Missing id or blob', 400);
        }
        await globalRoom.saveReplay(body.id, body.blob);
        return json({ success: true, id: body.id }, 201, corsHeaders(origin, env.ALLOWED_ORIGINS));
      } catch (err: any) {
        if (err.message === 'PAYLOAD_TOO_LARGE') {
          return errorResponse('PAYLOAD_TOO_LARGE', 'Replay exceeds 200KB limit', 413);
        }
        return errorResponse('INVALID_JSON', 'Malformed JSON payload', 400);
      }
    });

    // 5. GET /api/replay/:id
    router.add('GET', '/api/replay/:id', async (_request, params) => {
      const replayBlob = await globalRoom.getReplay(params.id!);
      if (!replayBlob) {
        return errorResponse('NOT_FOUND', 'Replay not found or expired', 404);
      }
      return json({ id: params.id, blob: replayBlob }, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
    });

    // 6. POST /api/copilot/diagnose
    router.add('POST', '/api/copilot/diagnose', async (request) => {
      try {
        const body = await readJson<any>(request, 65536); // 64 KB
        const diagnosis = await copilotRouter.diagnose(body.window ?? body, ipHash);
        return json(diagnosis, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
      } catch {
        return errorResponse('INVALID_JSON', 'Failed to parse copilot request', 400);
      }
    });

    // 7. POST /api/copilot/explain
    router.add('POST', '/api/copilot/explain', async (request) => {
      try {
        const body = await readJson<any>(request, 32768);
        const explanation = copilotRouter.explain(body.decisionLog ?? body);
        return json(explanation, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
      } catch {
        return errorResponse('INVALID_JSON', 'Failed to parse explain request', 400);
      }
    });

    // Match and route request
    const matched = router.match(req.method, url.pathname);
    if (!matched) {
      return errorResponse('NOT_FOUND', `Route ${req.method} ${url.pathname} not found`, 404);
    }

    try {
      return await matched.handler(req, matched.params);
    } catch (err: any) {
      return errorResponse('INTERNAL', err.message ?? 'Internal Server Error', 500);
    }
  },
};
