/**
 * Module 21 & Module 22: Edge Gateway main Worker entrypoint.
 *
 * Order of checks for every route (Module 21 §2 rule 2):
 *   method → CORS/origin → size limit → content type → rate limit →
 *   schema → handler → uniform error boundary.
 */
import { Router } from './router.js';
import { evpSecret, parseEnv, type Env } from './env.js';
import {
  json,
  errorResponse,
  corsHeaders,
  preflightResponse,
  isOriginAllowed,
  isJsonRequest,
  readJson,
  resolveRequestId,
  retryAfterHeaders,
  CACHE_HEALTH,
} from './http/index.js';
import {
  verifyEvpSignature,
  hashIp,
  isKnownLane,
  checkPlausibility,
  sha256Hex,
} from './security/index.js';
import { Room } from './do/Room.js';
import { resolveGlobalRoom, resolveRoomStub } from './do/RoomClient.js';
import { BudgetGuard } from './budget/guard.js';
import { MetaProvider } from './copilot/providers/meta.js';
import { WorkersAiProvider } from './copilot/providers/workers_ai.js';
import {
  CopilotRouter,
  toDiagnoseWire,
  toExplainWire,
  toChatWire,
  toAdvisoryWire,
} from './copilot/router.js';
import { DiagnosisV1Schema } from './copilot/schemas.js';
import { ChatSnapshotSchema } from './copilot/tools.js';
import type { ChatSnapshot } from './copilot/tools.js';
import { Logger } from './logging.js';
import { EdgeMetrics } from './metrics.js';
import { SignedEvpSchema, signHex, canonicalJson } from '@urbanflow/core';
import { MongoManager, SimulationRepository } from './db/index.js';

export { Room };

export const EDGE_VERSION = 'v1.0.0';
Logger.setVersion(EDGE_VERSION);

/** Module 22 §2 size limits, enforced before parsing. */
const LIMITS = {
  evp: 4 * 1024,
  copilot: 64 * 1024,
  chat: 8 * 1024,
  explain: 32 * 1024,
  advisory: 16 * 1024,
  replay: 200 * 1024,
  db: 1024 * 1024,
} as const;

/** Module 22 §6: chat questions are capped at 500 characters. */
const CHAT_MAX_QUESTION_CHARS = 500;

type Handler = (req: Request, params: Record<string, string>) => Promise<Response>;

interface HandlerContext {
  requestId: string;
  ipHash: string;
  cors: Record<string, string>;
  origin: string | null;
}

export default {
  async fetch(req: Request, envRaw: unknown, ctx: unknown): Promise<Response> {
    const startTime = Date.now();
    const requestId = resolveRequestId(req);
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');

    let env: Env;
    try {
      env = parseEnv(envRaw);
    } catch {
      // Misconfigured environment must not crash the isolate.
      EdgeMetrics.recordRequest(url.pathname, 500);
      return errorResponse('INTERNAL', 'Gateway configuration invalid', 500, requestId);
    }

    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

    // Module 22 §2.1: an origin that is not on the allow-list gets 403, and no
    // `Access-Control-Allow-Origin` header ever accompanies it.
    if (!isOriginAllowed(origin, env.ALLOWED_ORIGINS)) {
      EdgeMetrics.recordRateLimit('origin');
      Logger.warn('http.rejected', 'ORIGIN_FORBIDDEN', { route: url.pathname, requestId });
      return errorResponse(
        'ORIGIN_FORBIDDEN',
        'Origin is not allowed to call this API.',
        403,
        requestId,
        cors,
      );
    }

    if (req.method === 'OPTIONS') {
      return preflightResponse(origin, env.ALLOWED_ORIGINS);
    }

    // Daily-salted, truncated client fingerprint (Module 16 §2).
    const daySalt = new Date().toISOString().slice(0, 10);
    const clientIp = req.headers.get('cf-connecting-ip') ?? '127.0.0.1';
    const ipHash = await hashIp(clientIp, daySalt);

    const room = resolveGlobalRoom(env, ctx);
    const budgetGuard = new BudgetGuard(room, Number.parseInt(env.AI_DAILY_CAP, 10) || 1500);
    const metaProvider = new MetaProvider(env.META_API_KEY, env.META_API_BASE, env.META_MODEL);
    const workersAiProvider = new WorkersAiProvider(env.AI, env.WORKERS_AI_MODEL);
    // Module 24 §3: the chain is Meta → Workers AI → deterministic template.
    const copilot = new CopilotRouter(metaProvider, budgetGuard, undefined, workersAiProvider);

    // Module 21 §3: null when the deployment never ran `wrangler secret put
    // EVP_HMAC_SECRET`. Signing routes answer 503 rather than falling back to a
    // secret that shipped in the bundle.
    const secret = evpSecret(env);
    const dbManager = MongoManager.getInstance(env.MONGODB_URI, env.MONGODB_DB_NAME);
    const dbRepo = new SimulationRepository(dbManager);

    const hctx: HandlerContext = { requestId, ipHash, cors, origin };
    const router = new Router();

    // ---------------------------------------------------------------- health
    router.add(
      'GET',
      '/api/health',
      tracked('GET /api/health', async () => {
        const usage = await budgetGuard.getDailyUsage();
        const storageBytes = await room.getStorageBytes();
        EdgeMetrics.setDoStorageBytes(storageBytes);
        const dbStatus = await dbManager.getStatus();

        return json(
          {
            status: 'ok',
            version: EDGE_VERSION,
            time: new Date().toISOString(),
            aiProviders: {
              meta: metaProvider.isAvailable(),
              workersAi: workersAiProvider.isAvailable(),
              template: true,
            },
            // Module 21 §3: a missing signing secret is visible here instead of
            // surfacing as a mysterious 401 on every EVP call.
            evp: { secretConfigured: secret !== null },
            mongodb: {
              configured: true,
              database: dbStatus.database,
              status: dbStatus.status,
              connected: dbStatus.connected,
              latencyMs: dbStatus.pingLatencyMs,
              runsCount: dbStatus.collections.runs,
            },
            budget: { used: usage.calls, limit: budgetGuard.cap },
            // Module 16 §5: measured spend, never a derived guess.
            aiCostUsdToday: Number((usage.costMicroUsd / 1_000_000).toFixed(4)),
          },
          200,
          { ...cors, 'X-Request-Id': requestId },
          CACHE_HEALTH,
        );
      }),
    );

    // --------------------------------------------------------------- metrics
    router.add(
      'GET',
      '/api/metrics',
      tracked('GET /api/metrics', async () => {
        EdgeMetrics.setDoStorageBytes(await room.getStorageBytes());
        return json(EdgeMetrics.getSnapshot(), 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    // ------------------------------------------------------------- EVP relay
    router.add(
      'POST',
      '/api/evp',
      tracked('POST /api/evp', async (request) => {
        // Module 22 §2.1: a dependency the gateway cannot function without is
        // `503 PROVIDER_UNAVAILABLE`, not a 500 and never an unsigned accept.
        if (secret === null) return missingSecret(hctx);

        const body = await readBody<unknown>(request, LIMITS.evp, hctx);
        if ('response' in body) return body.response;

        const parsed = SignedEvpSchema.safeParse(body.value);
        if (!parsed.success) {
          // `UNKNOWN_LANE` is a distinct contract reason (Module 22 §2.1).
          const lane = (body.value as { lane?: unknown } | null)?.lane;
          const reason = lane !== undefined && !isKnownLane(lane) ? 'UNKNOWN_LANE' : 'INVALID_REQUEST';
          Logger.warn('evp.rejected', reason, { route: '/api/evp', requestId, ipHash });
          return evpRejected(
            'unknown',
            reason,
            reason === 'UNKNOWN_LANE' ? 422 : 400,
            hctx,
          );
        }

        const signedEvp = parsed.data;

        // Authenticity is proven before anything is consumed, so a forged
        // request can never burn another source's rate budget.
        const verified = await verifyEvpSignature(secret, signedEvp);
        if (!verified.ok) {
          Logger.warn('evp.rejected', verified.reason, { route: '/api/evp', requestId, ipHash });
          return evpRejected(signedEvp.id, verified.reason, 401, hctx);
        }

        // Atomic check-and-insert in the DO: the only place replay is decided.
        const fresh = await room.checkAndInsertNonce(signedEvp.nonce);
        if (!fresh) {
          Logger.warn('evp.rejected', 'NONCE_REPLAY', { route: '/api/evp', requestId, ipHash });
          return evpRejected(signedEvp.id, 'NONCE_REPLAY', 409, hctx);
        }

        // Rate limiting follows the nonce check on purpose: Module 22 §7
        // promises that a retry with the same id/nonce returns the same
        // duplicate decision, and a 429 would break that idempotency contract.
        const rate = await budgetGuard.checkEvp(ipHash, signedEvp.source);
        if (!rate.allow) {
          EdgeMetrics.recordRateLimit('evp');
          Logger.warn('evp.rejected', rate.reason ?? 'RATE_LIMITED', {
            route: '/api/evp',
            requestId,
            ipHash,
          });
          return json(
            {
              id: signedEvp.id,
              decision: 'rejected',
              reason: rate.reason ?? 'RATE_LIMITED',
              serverTime: new Date().toISOString(),
            },
            429,
            {
              ...cors,
              'X-Request-Id': requestId,
              ...retryAfterHeaders(rate.retryAfterS ?? 10),
            },
          );
        }

        // Plausibility last: cheap semantic sanity after authenticity is proven.
        const implausible = checkPlausibility(signedEvp);
        if (implausible) {
          Logger.warn('evp.rejected', implausible, { route: '/api/evp', requestId, ipHash });
          return evpRejected(signedEvp.id, implausible, 422, hctx);
        }

        Logger.info('evp.accepted', {
          route: '/api/evp',
          requestId,
          ipHash,
          latencyMs: Date.now() - startTime,
        });

        return json(
          {
            id: signedEvp.id,
            decision: 'accepted',
            reason: null,
            serverTime: new Date().toISOString(),
          },
          200,
          { ...cors, 'X-Request-Id': requestId },
        );
      }),
    );

    // -------------------------------------------------- EVP demo token (dev)
    router.add(
      'POST',
      '/api/evp/demo-token',
      tracked('POST /api/evp/demo-token', async () => {
        if (secret === null) return missingSecret(hctx);

        // Module 21 §1: "short-lived signed demo template; rate-limited". Without
        // this, the endpoint is a free forger — any caller could mint a valid
        // signature and spend the 1-per-10-s budget of the source it names.
        const gate = await budgetGuard.checkEvp(ipHash, 'demo-client');
        if (!gate.allow) {
          EdgeMetrics.recordRateLimit('evp');
          return json(
            {
              error: {
                code: gate.reason ?? 'RATE_LIMITED',
                message: 'Too many demo requests. Try again later.',
                requestId,
              },
            },
            429,
            {
              ...cors,
              'X-Request-Id': requestId,
              ...retryAfterHeaders(gate.retryAfterS ?? 10),
            },
          );
        }

        const nowMs = Date.now();
        const evpData = {
          id: `evp-demo-${nowMs}`,
          lane: 'NB-TR',
          distanceM: 300,
          speedMps: 15,
          tRequestS: 0,
          nonce: crypto.randomUUID().slice(0, 8),
          source: 'demo-client',
          ts: nowMs,
        };
        const signature = await signHex(secret, canonicalJson(evpData as never));
        return json({ ...evpData, signature }, 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    // -------------------------------------------------------------- replays
    router.add(
      'POST',
      '/api/replay',
      tracked('POST /api/replay', async (request) => {
        const gate = await budgetGuard.checkReplay(ipHash);
        if (!gate.allow) {
          EdgeMetrics.recordRateLimit('replay');
          return errorResponse(
            'RATE_LIMITED',
            'Too many replay uploads. Try again later.',
            429,
            requestId,
            { ...cors, ...retryAfterHeaders(gate.retryAfterS ?? 3600) },
          );
        }

        const body = await readBody<{ id?: unknown; blob?: unknown }>(request, LIMITS.replay, hctx);
        if ('response' in body) return body.response;

        const id = typeof body.value?.id === 'string' ? body.value.id : '';
        const blob = typeof body.value?.blob === 'string' ? body.value.blob : '';
        if (id.length < 8 || blob.length === 0) {
          return errorResponse('INVALID_REQUEST', 'Replay id and blob are required.', 400, requestId, cors);
        }

        // Module 22 §7: the idempotency key is the content hash, not the id the
        // client typed. A retry after a network error therefore returns the id
        // the first attempt was stored under, and 200 rather than a second 201.
        const contentHash = await sha256Hex(blob);
        const saved = await room.saveReplayIdempotent(id, blob, contentHash);
        Logger.info('replay.saved', {
          route: '/api/replay',
          requestId,
          ipHash,
          metadata: { deduplicated: saved.deduplicated },
        });
        return json(
          { success: true, id: saved.id, deduplicated: saved.deduplicated },
          saved.deduplicated ? 200 : 201,
          { ...cors, 'X-Request-Id': requestId },
        );
      }),
    );

    router.add(
      'GET',
      '/api/replay/:id',
      tracked('GET /api/replay/:id', async (_request, params) => {
        const state = await room.getReplayState(params.id ?? '');
        if (state.state === 'missing') {
          return errorResponse('NOT_FOUND', 'Replay not found.', 404, requestId, cors);
        }
        if (state.state === 'expired') {
          return errorResponse('EXPIRED', 'Replay has expired.', 410, requestId, cors);
        }
        return json({ id: params.id, blob: state.blob }, 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    // -------------------------------------------------------------- copilot
    router.add(
      'POST',
      '/api/copilot/diagnose',
      tracked('POST /api/copilot/diagnose', async (request) => {
        const body = await readBody<{ window?: unknown }>(request, LIMITS.copilot, hctx);
        if ('response' in body) return body.response;

        const windowData = body.value?.window;
        if (windowData === null || typeof windowData !== 'object') {
          return errorResponse(
            'INVALID_REQUEST',
            'A diagnosis window object is required.',
            400,
            requestId,
            cors,
          );
        }

        const result = await copilot.diagnose(windowData, ipHash);
        logCopilotCall(
          requestId,
          startTime,
          result.source,
          result.tokens.in,
          result.tokens.out,
          result.costMicroUsd,
          '/api/copilot/diagnose',
        );
        recordCopilotMetrics(result.source, result.costMicroUsd);

        return json(toDiagnoseWire(result), 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'POST',
      '/api/copilot/explain',
      tracked('POST /api/copilot/explain', async (request) => {
        const body = await readBody<{ decisionLog?: unknown }>(request, LIMITS.explain, hctx);
        if ('response' in body) return body.response;

        const result = await copilot.explain(body.value?.decisionLog ?? body.value);
        recordCopilotMetrics(result.source, result.costMicroUsd);
        return json(toExplainWire(result), 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'POST',
      '/api/copilot/chat',
      tracked('POST /api/copilot/chat', async (request) => {
        const body = await readBody<{ question?: unknown; sessionId?: unknown; snapshot?: unknown }>(
          request,
          LIMITS.chat,
          hctx,
        );
        if ('response' in body) return body.response;

        const question = typeof body.value?.question === 'string' ? body.value.question : '';
        if (question.trim().length === 0 || question.length > CHAT_MAX_QUESTION_CHARS) {
          return errorResponse(
            'INVALID_REQUEST',
            `A question of at most ${CHAT_MAX_QUESTION_CHARS} characters is required.`,
            400,
            requestId,
            cors,
          );
        }

        // Module 24 §5: the browser may ship its bounded twin snapshot so the
        // read-only tools can resolve against measured evidence. Re-validated
        // here, again, with the zod schema — the wire is never trusted.
        let snapshot: ChatSnapshot | null = null;
        if (body.value?.snapshot !== undefined && body.value.snapshot !== null) {
          const parsedSnapshot = ChatSnapshotSchema.safeParse(body.value.snapshot);
          if (!parsedSnapshot.success) {
            const issue = parsedSnapshot.error.issues[0];
            return errorResponse(
              'INVALID_REQUEST',
              `snapshot failed validation: ${issue ? `${issue.path.join('.') || '(root)'} ${issue.message}` : 'schema mismatch'}`,
              400,
              requestId,
              cors,
            );
          }
          snapshot = parsedSnapshot.data;
        }

        const result = await copilot.chat(question, ipHash, snapshot);
        logCopilotCall(
          requestId,
          startTime,
          result.source,
          result.tokens.in,
          result.tokens.out,
          result.costMicroUsd,
          '/api/copilot/chat',
        );
        recordCopilotMetrics(result.source, result.costMicroUsd);

        return json(toChatWire(result), 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'POST',
      '/api/copilot/advisory',
      tracked('POST /api/copilot/advisory', async (request) => {
        const body = await readBody<{ diagnosis?: unknown }>(request, LIMITS.advisory, hctx);
        if ('response' in body) return body.response;

        const parsed = DiagnosisV1Schema.safeParse(body.value?.diagnosis);
        if (!parsed.success) {
          return errorResponse(
            'INVALID_REQUEST',
            'A DiagnosisV1 object is required.',
            400,
            requestId,
            cors,
          );
        }

        const result = await copilot.advisory(parsed.data, ipHash);
        recordCopilotMetrics(result.source, result.costMicroUsd);
        return json(toAdvisoryWire(result), 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    // ------------------------------------------------------------ websockets
    router.add(
      'GET',
      '/ws/:room',
      tracked('GET /ws/:room', async (request, params) => {
        const stub = resolveRoomStub(env, ctx, params.room ?? '');
        if (!stub) {
          return errorResponse(
            'PROVIDER_UNAVAILABLE',
            'Live rooms are not available in this deployment.',
            503,
            requestId,
            { ...cors, ...retryAfterHeaders(30) },
          );
        }
        EdgeMetrics.setWsConnections(EdgeMetrics.getSnapshot().wsConnections + 1);
        return stub.fetch(request);
      }),
    );

    // ------------------------------------------------------------- MongoDB Persistence
    router.add(
      'GET',
      '/api/db/status',
      tracked('GET /api/db/status', async () => {
        const status = await dbManager.getStatus();
        return json(status, 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'GET',
      '/api/db/runs',
      tracked('GET /api/db/runs', async (request) => {
        const reqUrl = new URL(request.url);
        const limit = Math.min(100, Math.max(1, Number.parseInt(reqUrl.searchParams.get('limit') || '20', 10)));
        const skip = Math.max(0, Number.parseInt(reqUrl.searchParams.get('skip') || '0', 10));
        const runs = await dbRepo.listRuns(limit, skip);
        return json(runs, 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'POST',
      '/api/db/runs',
      tracked('POST /api/db/runs', async (request) => {
        const body = await readBody<any>(request, LIMITS.db, hctx);
        if ('response' in body) return body.response;
        const data = body.value;
        if (!data || typeof data.runId !== 'string') {
          return errorResponse('INVALID_REQUEST', 'runId string is required.', 400, requestId, cors);
        }
        const saved = await dbRepo.saveRun({
          runId: data.runId,
          seed: Number(data.seed) || 42,
          scenarioId: String(data.scenarioId || 'urban-peak'),
          config: data.config || {},
          startTime: data.startTime || new Date().toISOString(),
          endTime: data.endTime,
          durationS: Number(data.durationS) || 0,
          status: data.status || 'completed',
          metricsSummary: data.metricsSummary,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          updatedAt: new Date(),
        });
        return json({ ok: true, run: saved }, 201, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'GET',
      '/api/db/runs/:runId',
      tracked('GET /api/db/runs/:runId', async (_request, params) => {
        const runId = params.runId || '';
        if (!runId) return errorResponse('INVALID_REQUEST', 'runId is required.', 400, requestId, cors);
        const run = await dbRepo.getRun(runId);
        if (!run) {
          return errorResponse('NOT_FOUND', `Run "${runId}" not found.`, 404, requestId, cors);
        }
        return json(run, 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'POST',
      '/api/db/runs/:runId/telemetry',
      tracked('POST /api/db/runs/:runId/telemetry', async (request, params) => {
        const runId = params.runId || '';
        if (!runId) return errorResponse('INVALID_REQUEST', 'runId is required.', 400, requestId, cors);
        const body = await readBody<{ records?: any[] }>(request, LIMITS.db, hctx);
        if ('response' in body) return body.response;
        const records = Array.isArray(body.value?.records) ? body.value.records : [];
        const formatted = records.map((r) => ({
          runId,
          simTimeS: Number(r.simTimeS) || 0,
          lane: r.lane,
          vehicleCount: Number(r.vehicleCount) || 0,
          queueLengthM: Number(r.queueLengthM) || 0,
          occupancyPct: Number(r.occupancyPct) || 0,
          sumWeightedWaitS: Number(r.sumWeightedWaitS) || 0,
          maxWaitS: Number(r.maxWaitS) || 0,
          nearestEmsDistanceM: r.nearestEmsDistanceM ?? null,
          timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
        }));
        const count = await dbRepo.recordTelemetryBatch(formatted);
        return json({ ok: true, inserted: count }, 201, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'GET',
      '/api/db/runs/:runId/telemetry',
      tracked('GET /api/db/runs/:runId/telemetry', async (request, params) => {
        const runId = params.runId || '';
        if (!runId) return errorResponse('INVALID_REQUEST', 'runId is required.', 400, requestId, cors);
        const reqUrl = new URL(request.url);
        const lane = reqUrl.searchParams.get('lane') || undefined;
        const limit = Math.min(1000, Number.parseInt(reqUrl.searchParams.get('limit') || '500', 10));
        const telemetry = await dbRepo.getTelemetry(runId, lane, limit);
        return json({ runId, count: telemetry.length, telemetry }, 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'POST',
      '/api/db/runs/:runId/evp',
      tracked('POST /api/db/runs/:runId/evp', async (request, params) => {
        const runId = params.runId || '';
        if (!runId) return errorResponse('INVALID_REQUEST', 'runId is required.', 400, requestId, cors);
        const body = await readBody<any>(request, LIMITS.evp, hctx);
        if ('response' in body) return body.response;
        const ev = body.value;
        const recorded = await dbRepo.recordEvp({
          runId,
          eventId: ev.eventId || crypto.randomUUID(),
          emsId: ev.emsId || 'ems-unknown',
          lane: ev.lane || 'NB-TR',
          stage: ev.stage || 'PRECLEAR',
          distanceM: Number(ev.distanceM) || 45,
          speedMps: Number(ev.speedMps) || 12.5,
          decision: ev.decision || 'accepted',
          reason: ev.reason,
          shortfallS: ev.shortfallS,
          simTimeS: Number(ev.simTimeS) || 0,
          timestamp: new Date(),
        });
        return json({ ok: true, event: recorded }, 201, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'GET',
      '/api/db/runs/:runId/evp',
      tracked('GET /api/db/runs/:runId/evp', async (_request, params) => {
        const runId = params.runId || '';
        if (!runId) return errorResponse('INVALID_REQUEST', 'runId is required.', 400, requestId, cors);
        const events = await dbRepo.getEvpEvents(runId);
        return json({ runId, count: events.length, events }, 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'POST',
      '/api/db/runs/:runId/signal',
      tracked('POST /api/db/runs/:runId/signal', async (request, params) => {
        const runId = params.runId || '';
        if (!runId) return errorResponse('INVALID_REQUEST', 'runId is required.', 400, requestId, cors);
        const body = await readBody<any>(request, LIMITS.evp, hctx);
        if ('response' in body) return body.response;
        const sig = body.value;
        const recorded = await dbRepo.recordSignalState({
          runId,
          simTimeS: Number(sig.simTimeS) || 0,
          phase: sig.phase ?? null,
          indication: sig.indication || 'GREEN',
          timeInStateS: Number(sig.timeInStateS) || 0,
          lanes: sig.lanes || {},
          timestamp: new Date(),
        });
        return json({ ok: true, signal: recorded }, 201, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    router.add(
      'GET',
      '/api/db/runs/:runId/export',
      tracked('GET /api/db/runs/:runId/export', async (_request, params) => {
        const runId = params.runId || '';
        if (!runId) return errorResponse('INVALID_REQUEST', 'runId is required.', 400, requestId, cors);
        const bundle = await dbRepo.exportRunBundle(runId);
        if (!bundle) {
          return errorResponse('NOT_FOUND', `Run "${runId}" not found for export.`, 404, requestId, cors);
        }
        return json(bundle, 200, { ...cors, 'X-Request-Id': requestId });
      }),
    );

    // -------------------------------------------------------------- resolve
    const matched = router.match(req.method, url.pathname);
    if (!matched) {
      const pathOnly = router.matchPath(url.pathname);
      if (pathOnly) {
        EdgeMetrics.recordRequest(url.pathname, 405);
        return errorResponse(
          'METHOD_NOT_ALLOWED',
          `Method ${req.method} is not allowed for this route.`,
          405,
          requestId,
          { ...cors, Allow: pathOnly.methods.join(', ') },
        );
      }
      EdgeMetrics.recordRequest(url.pathname, 404);
      return errorResponse('NOT_FOUND', 'Route not found.', 404, requestId, cors);
    }

    try {
      const response = await matched.handler(req, matched.params);
      // `toJSON` keeps the header name canonical without re-adding it twice.
      return response;
    } catch (err) {
      Logger.error('server.internal', err instanceof Error ? err.name : 'UNKNOWN', {
        route: url.pathname,
        requestId,
      });
      EdgeMetrics.recordRequest(url.pathname, 500);
      return errorResponse('INTERNAL', 'Internal Server Error', 500, requestId, cors);
    }
  },
};

// ------------------------------------------------------------------ helpers

function tracked(route: string, handler: Handler): Handler {
  return async (req, params) => {
    const res = await handler(req, params);
    EdgeMetrics.recordRequest(route, res.status);
    return res;
  };
}

type BodyResult<T> = { value: T } | { response: Response };

/** Content type gate + size limit + parse, folded into one result type. */
async function readBody<T>(req: Request, maxBytes: number, hctx: HandlerContext): Promise<BodyResult<T>> {
  if (!isJsonRequest(req)) {
    return {
      response: errorResponse(
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.',
        415,
        hctx.requestId,
        hctx.cors,
      ),
    };
  }

  try {
    return { value: await readJson<T>(req, maxBytes) };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'INVALID_JSON';
    if (code === 'PAYLOAD_TOO_LARGE') {
      return {
        response: errorResponse(
          'PAYLOAD_TOO_LARGE',
          'Payload exceeds the permitted size.',
          413,
          hctx.requestId,
          hctx.cors,
        ),
      };
    }
    return {
      response: errorResponse('INVALID_JSON', 'Malformed JSON payload.', 400, hctx.requestId, hctx.cors),
    };
  }
}

/** Module 22 §2.3: EVP rejections use the decision envelope, not the error one. */
function evpRejected(
  id: string,
  reason: string,
  status: number,
  hctx: HandlerContext,
): Response {
  return json(
    { id, decision: 'rejected', reason, serverTime: new Date().toISOString() },
    status,
    { ...hctx.cors, 'X-Request-Id': hctx.requestId },
  );
}

/**
 * Module 21 §3: `EVP_HMAC_SECRET` was never set on this deployment, so the
 * gateway cannot prove who sent a preemption request. Module 22 §2.1 maps an
 * unavailable dependency to `503 PROVIDER_UNAVAILABLE`.
 */
function missingSecret(hctx: HandlerContext): Response {
  Logger.warn('evp.rejected', 'PROVIDER_UNAVAILABLE', { route: '/api/evp', requestId: hctx.requestId });
  return errorResponse(
    'PROVIDER_UNAVAILABLE',
    'EVP signing is not configured on this deployment.',
    503,
    hctx.requestId,
    hctx.cors,
  );
}

function recordCopilotMetrics(source: string, costMicroUsd: number): void {
  if (source === 'template') {
    EdgeMetrics.recordAiCall('template', 'fallback', 0);
    return;
  }
  EdgeMetrics.recordAiCall(source, 'success', costMicroUsd);
}

function logCopilotCall(
  requestId: string,
  startTime: number,
  source: string,
  tokensIn: number,
  tokensOut: number,
  costMicroUsd: number,
  route = '/api/copilot/diagnose',
): void {
  Logger.logPromptExecution(
    requestId,
    {
      provider: source,
      model: source === 'template' ? 'deterministic-template' : 'muse-spark-1.3',
      promptVersion: 'v1.0.0',
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - startTime,
      // Dollars for the log line; the wire keeps dollars too (Module 22 §6).
      costUsdEstimate: Number((costMicroUsd / 1_000_000).toFixed(6)),
      cacheHit: false,
    },
    route,
  );
}
