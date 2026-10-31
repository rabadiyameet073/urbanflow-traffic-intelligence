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
import { Logger } from './logging.js';
import { EdgeMetrics } from './metrics.js';
import { SignedEvpSchema, signHex, canonicalJson } from '@urbanflow/core';

export { Room };

let fallbackGlobalRoom: Room | null = null;

export default {
  async fetch(req: Request, envRaw: unknown, ctx: any): Promise<Response> {
    const startTime = Date.now();
    const env = parseEnv(envRaw);
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const clientIp = req.headers.get('cf-connecting-ip') ?? '127.0.0.1';
    const ipHash = await hashIp(clientIp);
    const requestId = crypto.randomUUID();

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

    // 1. GET /api/health (Module 16 §5)
    router.add('GET', '/api/health', async () => {
      const dailyCount = await budgetGuard.getDailyCount();
      const dailyCap = parseInt(env.AI_DAILY_CAP, 10);
      const costToday = dailyCount * 0.0002;

      EdgeMetrics.recordRequest('/api/health', 200);
      return json({
        status: 'healthy',
        ok: true,
        version: 'v1.0.0',
        time: new Date().toISOString(),
        aiProviders: {
          meta: metaProvider.isAvailable(),
          workersAi: false,
          template: true,
        },
        budget: {
          used: dailyCount,
          limit: dailyCap,
        },
        aiCostUsdToday: parseFloat(costToday.toFixed(4)),
      }, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
    });

    // 2. GET /api/metrics (Module 16 §4.2)
    router.add('GET', '/api/metrics', async () => {
      EdgeMetrics.recordRequest('/api/metrics', 200);
      return json(EdgeMetrics.getSnapshot(), 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
    });

    // 3. POST /api/evp (Authenticated EVP Gateway - Module 14 §4.3)
    router.add('POST', '/api/evp', async (request) => {
      try {
        const body = await readJson<any>(request, 4096); // 4 KB limit
        const parsed = SignedEvpSchema.safeParse(body);
        if (!parsed.success) {
          Logger.warn('evp.rejected', 'INVALID_SCHEMA', { route: '/api/evp', requestId, ipHash });
          EdgeMetrics.recordRequest('/api/evp', 400);
          return errorResponse('INVALID_REQUEST', 'Schema validation failed', 400, requestId);
        }

        const signedEvp = parsed.data;

        // Verify HMAC-SHA256 signature and 30s timestamp window
        const verifyRes = await verifyEvpSignature(env.EVP_HMAC_SECRET, signedEvp);
        if (!verifyRes.ok) {
          Logger.warn('evp.rejected', verifyRes.reason, { route: '/api/evp', requestId, ipHash });
          EdgeMetrics.recordRequest('/api/evp', 401);
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
          Logger.warn('evp.rejected', 'NONCE_REPLAY', { route: '/api/evp', requestId, ipHash });
          EdgeMetrics.recordRequest('/api/evp', 409);
          return json({
            id: signedEvp.id,
            decision: 'rejected',
            reason: 'NONCE_REPLAY',
            serverTime: new Date().toISOString(),
          }, 409, corsHeaders(origin, env.ALLOWED_ORIGINS));
        }

        Logger.info('evp.accepted', {
          route: '/api/evp',
          requestId,
          ipHash,
          latencyMs: Date.now() - startTime,
        });
        EdgeMetrics.recordRequest('/api/evp', 200);
        return json({
          id: signedEvp.id,
          decision: 'accepted',
          reason: null,
          serverTime: new Date().toISOString(),
        }, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
      } catch (err: any) {
        if (err.message === 'PAYLOAD_TOO_LARGE') {
          EdgeMetrics.recordRequest('/api/evp', 413);
          return errorResponse('PAYLOAD_TOO_LARGE', 'Payload exceeds 4KB', 413, requestId);
        }
        EdgeMetrics.recordRequest('/api/evp', 400);
        return errorResponse('INVALID_JSON', 'Malformed JSON payload', 400, requestId);
      }
    });

    // 4. POST /api/evp/demo-token
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

      EdgeMetrics.recordRequest('/api/evp/demo-token', 200);
      return json({
        ...evpData,
        signature,
      }, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
    });

    // 5. POST /api/replay (Store replay blob)
    router.add('POST', '/api/replay', async (request) => {
      try {
        const body = await readJson<{ id: string; blob: string }>(request, 204800); // 200 KB
        if (!body.id || !body.blob) {
          EdgeMetrics.recordRequest('/api/replay', 400);
          return errorResponse('INVALID_REQUEST', 'Missing id or blob', 400, requestId);
        }
        await globalRoom.saveReplay(body.id, body.blob);
        Logger.info('replay.saved', { route: '/api/replay', requestId, ipHash });
        EdgeMetrics.recordRequest('/api/replay', 201);
        return json({ success: true, id: body.id }, 201, corsHeaders(origin, env.ALLOWED_ORIGINS));
      } catch (err: any) {
        if (err.message === 'PAYLOAD_TOO_LARGE') {
          EdgeMetrics.recordRequest('/api/replay', 413);
          return errorResponse('PAYLOAD_TOO_LARGE', 'Replay exceeds 200KB limit', 413, requestId);
        }
        EdgeMetrics.recordRequest('/api/replay', 400);
        return errorResponse('INVALID_JSON', 'Malformed JSON payload', 400, requestId);
      }
    });

    // 6. GET /api/replay/:id
    router.add('GET', '/api/replay/:id', async (_request, params) => {
      const replayBlob = await globalRoom.getReplay(params.id!);
      if (!replayBlob) {
        EdgeMetrics.recordRequest('/api/replay/:id', 404);
        return errorResponse('NOT_FOUND', 'Replay not found or expired', 404, requestId);
      }
      EdgeMetrics.recordRequest('/api/replay/:id', 200);
      return json({ id: params.id, blob: replayBlob }, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
    });

    // 7. POST /api/copilot/diagnose
    router.add('POST', '/api/copilot/diagnose', async (request) => {
      try {
        const body = await readJson<any>(request, 65536); // 64 KB
        const diagnosis = await copilotRouter.diagnose(body.window ?? body, ipHash);
        
        Logger.logPromptExecution(requestId, {
          provider: diagnosis.source,
          model: env.META_MODEL,
          promptVersion: 'v1.0.0',
          latencyMs: Date.now() - startTime,
          costUsdEstimate: diagnosis.source === 'muse-spark' ? 0.0004 : 0.0,
          cacheHit: false,
        });

        EdgeMetrics.recordAiCall(diagnosis.source, 'success');
        EdgeMetrics.recordRequest('/api/copilot/diagnose', 200);
        return json(diagnosis, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
      } catch {
        EdgeMetrics.recordRequest('/api/copilot/diagnose', 400);
        return errorResponse('INVALID_JSON', 'Failed to parse copilot request', 400, requestId);
      }
    });

    // 8. POST /api/copilot/explain
    router.add('POST', '/api/copilot/explain', async (request) => {
      try {
        const body = await readJson<any>(request, 32768);
        const explanation = copilotRouter.explain(body.decisionLog ?? body);
        EdgeMetrics.recordRequest('/api/copilot/explain', 200);
        return json(explanation, 200, corsHeaders(origin, env.ALLOWED_ORIGINS));
      } catch {
        EdgeMetrics.recordRequest('/api/copilot/explain', 400);
        return errorResponse('INVALID_JSON', 'Failed to parse explain request', 400, requestId);
      }
    });

    // Match and route request
    const matched = router.match(req.method, url.pathname);
    if (!matched) {
      EdgeMetrics.recordRequest(url.pathname, 404);
      return errorResponse('NOT_FOUND', `Route ${req.method} ${url.pathname} not found`, 404, requestId);
    }

    try {
      return await matched.handler(req, matched.params);
    } catch (err: any) {
      Logger.error('server.internal', err.message, { route: url.pathname, requestId });
      EdgeMetrics.recordRequest(url.pathname, 500);
      return errorResponse('INTERNAL', err.message ?? 'Internal Server Error', 500, requestId);
    }
  },
};
