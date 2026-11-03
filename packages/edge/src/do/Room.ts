/**
 * Module 21 §6: SQLite-backed Durable Object `Room`.
 *
 * One object per room code plus the reserved `__global__` id for counters.
 * Single-threaded per object, so a single `INSERT OR IGNORE` gives an atomic
 * nonce check-and-insert without an explicit transaction (Module 26 §3).
 *
 * TTLs are enforced by a DO alarm (Module 21 §6.2) rather than by request-time
 * sweeps, so an idle room still purges itself.
 */
import { KAFKA_TOPICS } from '@urbanflow/core';
import type { Env } from '../env.js';

/** Module 21 §6.2: nonces live 5 minutes; the alarm tick doubles as the
 * Module 22 §3 heartbeat (server pings every 30 s) and TTL sweep. */
const NONCE_TTL_MS = 5 * 60 * 1000;
const RL_WINDOW_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const AI_USAGE_RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 30 * 1000;
/** Module 21 §1: replay blobs expire after 7 days. */
const REPLAY_TTL_MS = 7 * 86_400_000;

/** Module 22 §3: WebSocket transport limits. */
const WS_MAX_VIEWERS = 50;
const WS_MAX_MESSAGE_BYTES = 16 * 1024;
const WS_MAX_MESSAGES_PER_SEC = 20;
const WS_MAX_POLICY_STRIKES = 3;
/** Module 22 §3: envelope `{v, type, seq, t, payload}`; `v` is fixed at 1. */
const WS_ENVELOPE_V = 1;
const WS_ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
// Module 02 §3: the broadcasted types are the frozen topic names — derived from
// the contract, never re-typed here (Rule 12 §4).
const WS_TYPES = new Set<string>([
  KAFKA_TOPICS.laneTelemetry.name,
  KAFKA_TOPICS.signalState.name,
  KAFKA_TOPICS.laneMetrics.name,
  KAFKA_TOPICS.emergencyEvents.name,
  'ping',
  'pong',
  'hello',
]);

export interface DailyUsage {
  calls: number;
  costMicroUsd: number;
}

interface SqlCursor {
  rowsWritten?: number;
}

export class Room {
  private ctx: any; // AUDIT-OK(A5): DurableObjectState shim — real types need @cloudflare/workers-types (Rule 18)
  private env: Env;

  // In-isolate fallbacks, used only when the SQLite storage backend is absent
  // (unit tests and `wrangler dev` without the DO binding).
  private memoryNonces = new Set<string>();
  private memoryRateLimits = new Map<string, number>();
  private memoryReplays = new Map<string, { blob: string; expiresAt: number }>();
  /** Module 22 §7: content hash → id, so a retried upload does not fork the blob. */
  private memoryReplayHashes = new Map<string, string>();
  private memoryAiUsage = new Map<string, DailyUsage>();

  /** Envelope `seq` for server-originated frames (Module 22 §3: per sender). */
  private wsSeq = 0;

  constructor(ctx: any, env: Env) { // AUDIT-OK(A5): DurableObjectState shim (Rule 18)
    this.ctx = ctx;
    this.env = env;
    this.initSql();
    void this.scheduleCleanup();
  }

  private get sql(): any { // AUDIT-OK(A5): SqlStorage shim — same binding-type rationale (Rule 18)
    return this.ctx?.storage?.sql ?? null;
  }

  private initSql(): void {
    const sql = this.sql;
    if (!sql) return;

    sql.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, seen_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rl (bucket TEXT NOT NULL, window_start INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (bucket, window_start));
      CREATE TABLE IF NOT EXISTS replays (id TEXT PRIMARY KEY, blob TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
            -- Module 22 §7: "content hash to same id". Kept in its own table so
            -- the replays table shape stays exactly as Module 21 §6.2 declares it.
            CREATE TABLE IF NOT EXISTS replay_hashes (content_hash TEXT PRIMARY KEY, id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ai_usage (day TEXT NOT NULL, key TEXT NOT NULL, calls INTEGER NOT NULL, cost_micro_usd INTEGER NOT NULL, PRIMARY KEY (day, key));
      CREATE INDEX IF NOT EXISTS idx_nonces_seen ON nonces(seen_at);
      CREATE INDEX IF NOT EXISTS idx_replays_exp ON replays(expires_at);
    `);

    // Forward-only, idempotent migration bookkeeping (Module 26 §3).
    const version = [...sql.exec('SELECT v FROM schema_version LIMIT 1')];
    if (version.length === 0) {
      sql.exec('INSERT INTO schema_version (v) VALUES (?)', 1);
    }
  }

  // ---------------------------------------------------------------- nonces

  /**
   * Atomic check-and-insert. Returns `true` when the nonce was fresh and stored,
   * `false` on replay. One statement ⇒ no read-then-write race.
   */
  public async checkAndInsertNonce(nonce: string, nowMs = Date.now()): Promise<boolean> {
    const sql = this.sql;
    if (sql) {
      try {
        const cursor = sql.exec(
          'INSERT OR IGNORE INTO nonces (nonce, seen_at) VALUES (?, ?)',
          nonce,
          nowMs,
        ) as SqlCursor;
        if (typeof cursor.rowsWritten === 'number') {
          return cursor.rowsWritten > 0;
        }
        const changes = [...sql.exec('SELECT changes() AS c')];
        return Number(changes[0]?.c ?? 1) > 0;
      } catch {
        // Storage failure must fail closed: an unverifiable nonce is a replay risk.
        return false;
      }
    }

    if (this.memoryNonces.has(nonce)) return false;
    this.memoryNonces.add(nonce);
    return true;
  }

  // ------------------------------------------------------------ rate limits

  /** Fixed-window counter. Returns `true` when the request is allowed. */
  public async checkRateLimit(
    bucket: string,
    limit: number,
    windowSeconds = 60,
    nowMs = Date.now(),
  ): Promise<boolean> {
    const windowStart = Math.floor(nowMs / (windowSeconds * 1000));
    const key = `${bucket}:${windowStart}`;

    const sql = this.sql;
    if (sql) {
      try {
        const rows = [
          ...sql.exec('SELECT n FROM rl WHERE bucket = ? AND window_start = ?', bucket, windowStart),
        ];
        const current = rows.length > 0 ? Number(rows[0].n) : 0;
        if (current >= limit) return false;
        sql.exec(
          `INSERT INTO rl (bucket, window_start, n) VALUES (?, ?, 1)
           ON CONFLICT(bucket, window_start) DO UPDATE SET n = n + 1`,
          bucket,
          windowStart,
        );
        return true;
      } catch {
        // Fail open for throttling only; the AI budget guard has its own cap.
        return true;
      }
    }

    const current = this.memoryRateLimits.get(key) ?? 0;
    if (current >= limit) return false;
    this.memoryRateLimits.set(key, current + 1);
    return true;
  }

  // ---------------------------------------------------------------- replays

  /** Store a replay blob. Retention is 7 days unless the caller says otherwise. */
  public async saveReplay(id: string, blob: string, nowMs = Date.now()): Promise<void> {
    const expiresAt = nowMs + REPLAY_TTL_MS;
    const sql = this.sql;
    if (sql) {
      sql.exec(
        'INSERT OR REPLACE INTO replays (id, blob, created_at, expires_at) VALUES (?, ?, ?, ?)',
        id,
        blob,
        nowMs,
        expiresAt,
      );
      void this.scheduleCleanup(nowMs);
      return;
    }
    this.memoryReplays.set(id, { blob, expiresAt });
  }

  /**
   * Module 22 §7: "Replay store — content hash → same id returned".
   *
   * A client that retries an upload after a network error must not end up with
   * two copies of the same twenty-minute run under two ids. The hash table is
   * separate from `replays` so the declared shape of that table is untouched.
   * An expired hash falls through and stores the new blob under the new id.
   */
  public async saveReplayIdempotent(
    id: string,
    blob: string,
    contentHash: string,
    nowMs = Date.now(),
  ): Promise<{ id: string; deduplicated: boolean }> {
    const sql = this.sql;
    if (sql) {
      const known = [
        ...sql.exec(
          'SELECT h.id AS id, r.expires_at AS expires_at FROM replay_hashes h JOIN replays r ON r.id = h.id WHERE h.content_hash = ?',
          contentHash,
        ),
      ];
      if (known.length > 0 && Number(known[0].expires_at) >= nowMs) {
        return { id: String(known[0].id), deduplicated: true };
      }

      sql.exec(
        'INSERT OR REPLACE INTO replays (id, blob, created_at, expires_at) VALUES (?, ?, ?, ?)',
        id,
        blob,
        nowMs,
        nowMs + REPLAY_TTL_MS,
      );
      sql.exec(
        'INSERT OR REPLACE INTO replay_hashes (content_hash, id) VALUES (?, ?)',
        contentHash,
        id,
      );
      void this.scheduleCleanup(nowMs);
      return { id, deduplicated: false };
    }

    const previousId = this.memoryReplayHashes.get(contentHash);
    if (previousId) {
      const previous = this.memoryReplays.get(previousId);
      if (previous && previous.expiresAt >= nowMs) {
        return { id: previousId, deduplicated: true };
      }
    }
    this.memoryReplays.set(id, { blob, expiresAt: nowMs + REPLAY_TTL_MS });
    this.memoryReplayHashes.set(contentHash, id);
    return { id, deduplicated: false };
  }

  /** `EXPIRED` (410) is distinguishable from `NOT_FOUND` (404) here. */
  public async getReplayState(
    id: string,
    nowMs = Date.now(),
  ): Promise<{ state: 'ok'; blob: string } | { state: 'missing' } | { state: 'expired' }> {
    const sql = this.sql;
    if (sql) {
      const rows = [...sql.exec('SELECT blob, expires_at FROM replays WHERE id = ?', id)];
      if (rows.length === 0) return { state: 'missing' };
      if (Number(rows[0].expires_at) < nowMs) return { state: 'expired' };
      return { state: 'ok', blob: String(rows[0].blob) };
    }
    const item = this.memoryReplays.get(id);
    if (!item) return { state: 'missing' };
    if (item.expiresAt < nowMs) return { state: 'expired' };
    return { state: 'ok', blob: item.blob };
  }

  public async getReplay(id: string, nowMs = Date.now()): Promise<string | null> {
    const state = await this.getReplayState(id, nowMs);
    return state.state === 'ok' ? state.blob : null;
  }

  // --------------------------------------------------------------- AI usage

  /** Money is stored as integer micro-USD, never floats (Module 26 §3). */
  public async recordAiUsage(
    key: string,
    costMicroUsd: number,
    nowMs = Date.now(),
  ): Promise<void> {
    const day = new Date(nowMs).toISOString().slice(0, 10);
    const cost = Math.max(0, Math.round(costMicroUsd));

    const sql = this.sql;
    if (sql) {
      sql.exec(
        `INSERT INTO ai_usage (day, key, calls, cost_micro_usd) VALUES (?, ?, 1, ?)
         ON CONFLICT(day, key) DO UPDATE SET calls = calls + 1, cost_micro_usd = cost_micro_usd + ?`,
        day,
        key,
        cost,
        cost,
      );
      return;
    }

    const current = this.memoryAiUsage.get(`${day}:${key}`) ?? { calls: 0, costMicroUsd: 0 };
    this.memoryAiUsage.set(`${day}:${key}`, {
      calls: current.calls + 1,
      costMicroUsd: current.costMicroUsd + cost,
    });
  }

  public async getDailyUsage(key = '__global__', nowMs = Date.now()): Promise<DailyUsage> {
    const day = new Date(nowMs).toISOString().slice(0, 10);
    const sql = this.sql;
    if (sql) {
      try {
        const rows = [
          ...sql.exec('SELECT calls, cost_micro_usd FROM ai_usage WHERE day = ? AND key = ?', day, key),
        ];
        if (rows.length > 0) {
          return { calls: Number(rows[0].calls), costMicroUsd: Number(rows[0].cost_micro_usd) };
        }
        return { calls: 0, costMicroUsd: 0 };
      } catch {
        return { calls: 0, costMicroUsd: 0 };
      }
    }
    return this.memoryAiUsage.get(`${day}:${key}`) ?? { calls: 0, costMicroUsd: 0 };
  }

  /** Best-effort `do_storage_bytes` gauge (Module 16 §4.2). */
  public async getStorageBytes(): Promise<number> {
    const sql = this.sql;
    const size = sql?.databaseSize;
    if (typeof size === 'number' && Number.isFinite(size)) return size;
    return 0;
  }

  // --------------------------------------------------------------- TTL alarm

  private async scheduleCleanup(nowMs = Date.now()): Promise<void> {
    const storage = this.ctx?.storage;
    if (!storage?.setAlarm || !this.sql) return;
    try {
      const existing = await storage.getAlarm?.();
      if (existing !== null && existing !== undefined) return;
      await storage.setAlarm(nowMs + CLEANUP_INTERVAL_MS);
    } catch {
      // Alarms are best effort; a failure must never fail the request.
    }
  }

  /** DO alarm entrypoint: purge everything past its TTL (Module 21 §6.2). */
  public async alarm(): Promise<void> {
    const nowMs = Date.now();
    if (this.ctx?.getWebSockets) this.sendHeartbeat();
    const sql = this.sql;
    if (sql) {
      try {
        sql.exec('DELETE FROM nonces WHERE seen_at < ?', nowMs - NONCE_TTL_MS);
        sql.exec('DELETE FROM replays WHERE expires_at < ?', nowMs);
        // A hash whose blob has expired must not resurrect an id that now 410s.
        sql.exec('DELETE FROM replay_hashes WHERE id NOT IN (SELECT id FROM replays)');
        sql.exec('DELETE FROM rl WHERE window_start < ?', Math.floor((nowMs - RL_WINDOW_RETENTION_MS) / 1000));
        const cutoffDay = new Date(nowMs - AI_USAGE_RETENTION_DAYS * 86_400_000)
          .toISOString()
          .slice(0, 10);
        sql.exec('DELETE FROM ai_usage WHERE day < ?', cutoffDay);
      } catch {
        // Never throw from an alarm; a re-run next minute is harmless.
      }
    } else {
      this.purgeMemory(nowMs);
    }

    const storage = this.ctx?.storage;
    if (storage?.setAlarm) {
      await storage.setAlarm(nowMs + CLEANUP_INTERVAL_MS);
    }
  }

  private purgeMemory(nowMs: number): void {
    for (const [key, entry] of this.memoryReplays) {
      if (entry.expiresAt < nowMs) {
        this.memoryReplays.delete(key);
        this.memoryReplayHashes.delete(key);
      }
    }
    // Hashes can outlive their blob only if a delete raced the sweep above.
    for (const [hash, id] of this.memoryReplayHashes) {
      if (!this.memoryReplays.has(id)) this.memoryReplayHashes.delete(hash);
    }
    for (const key of this.memoryRateLimits.keys()) {
      const windowStart = Number(key.split(':').pop());
      if (Number.isFinite(windowStart) && windowStart * 1000 < nowMs - RL_WINDOW_RETENTION_MS) {
        this.memoryRateLimits.delete(key);
      }
    }
    // In-memory nonces are bounded by the room lifetime; cap them defensively.
    if (this.memoryNonces.size > 20_000) this.memoryNonces.clear();
  }

  // ------------------------------------------------------------------- WS

  /**
   * Module 22 §3 heartbeat: server pings every 30 s; a client treats two
   * missed pongs as a dead connection. Best effort — a dead peer is dropped
   * by the runtime, and a heartbeat failure must never break the alarm.
   */
  private sendHeartbeat(): void {
    let peers: WebSocket[];
    try {
      peers = this.ctx.getWebSockets() as WebSocket[];
    } catch {
      return;
    }
    if (peers.length === 0) return;
    const frame = JSON.stringify({
      v: WS_ENVELOPE_V,
      type: 'ping',
      seq: ++this.wsSeq,
      t: new Date().toISOString(),
      payload: {},
    });
    for (const ws of peers) {
      try {
        ws.send(frame);
      } catch {
        // Unreachable socket: the runtime closes it; keep pinging the rest.
      }
    }
  }

  /**
   * Module 21 §6.1 / Module 22 §3: hibernation-friendly WebSocket transport.
   * Per-type payload schemas live in the module 31 catalogue; this layer owns
   * the transport rules (size, rate, viewer cap, strikes, close codes).
   */
  public async fetch(req: Request): Promise<Response> {
    const upgrade = req.headers.get('upgrade');
    if (upgrade?.toLowerCase() === 'websocket') {
      return this.acceptSocket();
    }
    if (req.method === 'POST') {
      return this.handleRpc(req);
    }
    return new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  private acceptSocket(): Response {
    const existing: WebSocket[] = this.ctx?.getWebSockets ? this.ctx.getWebSockets() : [];
    if (existing.length >= WS_MAX_VIEWERS) {
      return new Response('room full', { status: 1013 });
    }

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  public async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const size =
      typeof message === 'string'
        ? new TextEncoder().encode(message).byteLength
        : message.byteLength;
    if (size > WS_MAX_MESSAGE_BYTES) {
      ws.close(1009, 'message too big');
      return;
    }

    const state = (ws.deserializeAttachment?.() ?? {}) as {
      strikes?: number;
      window?: number;
      count?: number;
    };
    const now = Date.now();
    const window = state.window ?? now;
    const count = window === now ? (state.count ?? 0) + 1 : 1;

    if (count > WS_MAX_MESSAGES_PER_SEC) {
      ws.close(1008, 'rate limited');
      return;
    }

    // Module 22 §3: zod-per-type lives in the module 31 catalogue; this layer
    // validates the transport envelope {v, type, seq, t, payload}. Anything
    // malformed is a policy strike, never a silent drop (anti-pattern §9).
    let envelope: { v?: unknown; type?: unknown; seq?: unknown; t?: unknown; payload?: unknown };
    try {
      envelope = JSON.parse(
        typeof message === 'string' ? message : new TextDecoder().decode(message),
      ) as typeof envelope;
    } catch {
      envelope = {};
    }
    const type = typeof envelope.type === 'string' ? envelope.type : '';
    const topicType = WS_TYPES.has(type) && type !== 'ping' && type !== 'pong' && type !== 'hello';
    const envelopeOk =
      WS_TYPES.has(type) &&
      envelope.v === WS_ENVELOPE_V &&
      Number.isSafeInteger(envelope.seq) &&
      (envelope.seq as number) >= 0 &&
      typeof envelope.t === 'string' &&
      WS_ISO_TIME.test(envelope.t) &&
      (!topicType || (envelope.payload !== null && typeof envelope.payload === 'object'));

    if (!envelopeOk) {
      // Unknown type ⇒ ignore + count; 3 strikes ⇒ close 1008 (Module 22 §3).
      const strikes = (state.strikes ?? 0) + 1;
      ws.serializeAttachment?.({ strikes, window, count });
      if (strikes >= WS_MAX_POLICY_STRIKES) ws.close(1008, 'policy violation');
      return;
    }

    ws.serializeAttachment?.({ strikes: 0, window, count });

    // Relay to the other viewers in the room.
    for (const peer of this.ctx.getWebSockets() as WebSocket[]) {
      if (peer === ws) continue;
      try {
        peer.send(typeof message === 'string' ? message : new Uint8Array(message));
      } catch {
        // A dead peer is removed by the runtime; keep relaying to the rest.
      }
    }
  }

  public async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1000 ? 1000 : 1000, 'closing');
    } catch {
      // Already closed.
    }
  }

  // ------------------------------------------------------------------ RPC

  private async handleRpc(req: Request): Promise<Response> {
    let body: { method?: unknown; args?: unknown };
    try {
      body = (await req.json()) as { method?: unknown; args?: unknown };
    } catch {
      return rpcError('INVALID_JSON');
    }

    const method = typeof body.method === 'string' ? body.method : '';
    const args = Array.isArray(body.args) ? (body.args as never[]) : [];
    const allowed = new Set([
      'checkAndInsertNonce',
      'checkRateLimit',
      'saveReplay',
      'saveReplayIdempotent',
      'getReplayState',
      'recordAiUsage',
      'getDailyUsage',
      'getStorageBytes',
    ]);
    if (!allowed.has(method)) return rpcError('UNKNOWN_METHOD');

    try {
      const fn = (this as unknown as Record<string, (...a: never[]) => Promise<unknown>>)[method]!;
      const result = await fn.apply(this, args);
      return Response.json({ ok: true, result });
    } catch {
      return rpcError('RPC_FAILED');
    }
  }
}

function rpcError(code: string): Response {
  return Response.json({ ok: false, error: code }, { status: 200 });
}
