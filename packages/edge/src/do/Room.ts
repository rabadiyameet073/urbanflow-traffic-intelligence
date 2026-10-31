/**
 * Module 21: SQLite-backed Durable Object Room & Global Counters
 */
import { Env } from '../env.js';

export class Room {
  private ctx: any;
  private env: Env;
  private memoryNonces = new Set<string>();
  private memoryRateLimits = new Map<string, number>();
  private memoryReplays = new Map<string, { blob: string; expiresAt: number }>();
  private memoryAiUsage = new Map<string, { calls: number; costMicroUsd: number }>();

  constructor(ctx: any, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.initSql();
  }

  private initSql(): void {
    if (this.ctx?.storage?.sql) {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, seen_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS rl (bucket TEXT NOT NULL, window_start INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (bucket, window_start));
        CREATE TABLE IF NOT EXISTS replays (id TEXT PRIMARY KEY, blob TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS ai_usage (day TEXT NOT NULL, key TEXT NOT NULL, calls INTEGER NOT NULL, cost_micro_usd INTEGER NOT NULL, PRIMARY KEY (day, key));
        CREATE INDEX IF NOT EXISTS idx_nonces_seen ON nonces(seen_at);
        CREATE INDEX IF NOT EXISTS idx_replays_exp ON replays(expires_at);
      `);
    }
  }

  /**
   * Atomic check-and-insert for nonce. Returns true if nonce is fresh and was inserted; false if replay.
   */
  public async checkAndInsertNonce(nonce: string, nowMs = Date.now()): Promise<boolean> {
    if (this.ctx?.storage?.sql) {
      try {
        const rows = [...this.ctx.storage.sql.exec('SELECT nonce FROM nonces WHERE nonce = ?', nonce)];
        if (rows.length > 0) return false;
        this.ctx.storage.sql.exec('INSERT INTO nonces (nonce, seen_at) VALUES (?, ?)', nonce, nowMs);
        return true;
      } catch {
        return false;
      }
    }
    // Fallback in-memory
    if (this.memoryNonces.has(nonce)) return false;
    this.memoryNonces.add(nonce);
    return true;
  }

  /**
   * Sliding window rate limiter. Returns true if request is allowed.
   */
  public async checkRateLimit(bucket: string, limit: number, windowSeconds = 60, nowMs = Date.now()): Promise<boolean> {
    const windowStart = Math.floor(nowMs / (windowSeconds * 1000));
    const key = `${bucket}:${windowStart}`;

    if (this.ctx?.storage?.sql) {
      try {
        const rows = [...this.ctx.storage.sql.exec('SELECT n FROM rl WHERE bucket = ? AND window_start = ?', bucket, windowStart)];
        const current = rows.length > 0 ? (rows[0].n as number) : 0;
        if (current >= limit) return false;
        this.ctx.storage.sql.exec(
          'INSERT INTO rl (bucket, window_start, n) VALUES (?, ?, 1) ON CONFLICT(bucket, window_start) DO UPDATE SET n = n + 1',
          bucket,
          windowStart,
        );
        return true;
      } catch {
        return true;
      }
    }

    const current = this.memoryRateLimits.get(key) ?? 0;
    if (current >= limit) return false;
    this.memoryRateLimits.set(key, current + 1);
    return true;
  }

  /**
   * Store replay blob (max 200 KB, 7 days retention)
   */
  public async saveReplay(id: string, blob: string, nowMs = Date.now()): Promise<void> {
    const expiresAt = nowMs + 7 * 86400 * 1000;
    if (this.ctx?.storage?.sql) {
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO replays (id, blob, created_at, expires_at) VALUES (?, ?, ?, ?)',
        id,
        blob,
        nowMs,
        expiresAt,
      );
      return;
    }
    this.memoryReplays.set(id, { blob, expiresAt });
  }

  public async getReplay(id: string, nowMs = Date.now()): Promise<string | null> {
    if (this.ctx?.storage?.sql) {
      const rows = [...this.ctx.storage.sql.exec('SELECT blob, expires_at FROM replays WHERE id = ?', id)];
      if (rows.length === 0) return null;
      if ((rows[0].expires_at as number) < nowMs) return null;
      return rows[0].blob as string;
    }
    const item = this.memoryReplays.get(id);
    if (!item || item.expiresAt < nowMs) return null;
    return item.blob;
  }

  /**
   * Record AI token usage and integer micro-USD cost
   */
  public async recordAiUsage(key: string, costMicroUsd: number, nowMs = Date.now()): Promise<void> {
    const day = new Date(nowMs).toISOString().slice(0, 10);
    if (this.ctx?.storage?.sql) {
      this.ctx.storage.sql.exec(
        `INSERT INTO ai_usage (day, key, calls, cost_micro_usd)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(day, key) DO UPDATE SET calls = calls + 1, cost_micro_usd = cost_micro_usd + ?`,
        day,
        key,
        costMicroUsd,
        costMicroUsd,
      );
      return;
    }
    const current = this.memoryAiUsage.get(`${day}:${key}`) ?? { calls: 0, costMicroUsd: 0 };
    this.memoryAiUsage.set(`${day}:${key}`, {
      calls: current.calls + 1,
      costMicroUsd: current.costMicroUsd + costMicroUsd,
    });
  }
}
