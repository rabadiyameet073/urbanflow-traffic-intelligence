/**
 * Module 21 §2/§6: Room facade.
 *
 * The gateway must talk to the same interface whether the Durable Object
 * binding is present (production: `env.ROOM` stub, RPC over `fetch`) or absent
 * (unit tests, `wrangler dev` without the binding: in-isolate `Room`).
 * Without this seam the worker would call methods that only exist on the
 * in-process class, and every nonce/rate-limit write would throw.
 */
import type { Env } from '../env.js';
import { Room, type DailyUsage } from './Room.js';

export type ReplayState =
  | { state: 'ok'; blob: string }
  | { state: 'missing' }
  | { state: 'expired' };

export interface RoomFacade {
  checkAndInsertNonce(nonce: string, nowMs?: number): Promise<boolean>;
  checkRateLimit(bucket: string, limit: number, windowSeconds?: number, nowMs?: number): Promise<boolean>;
  saveReplay(id: string, blob: string, nowMs?: number): Promise<void>;
  /** Module 22 §7: the same content hash always resolves to the same id. */
  saveReplayIdempotent(
    id: string,
    blob: string,
    contentHash: string,
    nowMs?: number,
  ): Promise<{ id: string; deduplicated: boolean }>;
  getReplayState(id: string, nowMs?: number): Promise<ReplayState>;
  recordAiUsage(key: string, costMicroUsd: number, nowMs?: number): Promise<void>;
  getDailyUsage(key?: string, nowMs?: number): Promise<DailyUsage>;
  getStorageBytes(): Promise<number>;
}

interface DurableObjectStubLike {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
}

/** Public view of a room stub, used to forward WebSocket upgrades verbatim. */
export type RoomStubLike = DurableObjectStubLike;

interface RoomNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

const RPC_URL = 'https://room.internal/rpc';

/** Talks to a Durable Object stub over the reserved internal RPC route. */
export class RemoteRoom implements RoomFacade {
  constructor(private readonly stub: DurableObjectStubLike) {}

  private async call<T>(method: string, args: unknown[]): Promise<T> {
    const res = await this.stub.fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, args }),
    });
    if (!res.ok) throw new Error(`ROOM_RPC_HTTP_${res.status}`);

    const body = (await res.json()) as { ok: boolean; result?: T; error?: string };
    if (!body.ok) throw new Error(body.error ?? 'ROOM_RPC_FAILED');
    return body.result as T;
  }

  checkAndInsertNonce(nonce: string, nowMs?: number): Promise<boolean> {
    return this.call<boolean>('checkAndInsertNonce', [nonce, nowMs]);
  }

  checkRateLimit(bucket: string, limit: number, windowSeconds?: number, nowMs?: number): Promise<boolean> {
    return this.call<boolean>('checkRateLimit', [bucket, limit, windowSeconds, nowMs]);
  }

  saveReplay(id: string, blob: string, nowMs?: number): Promise<void> {
    return this.call<void>('saveReplay', [id, blob, nowMs]);
  }

  saveReplayIdempotent(
    id: string,
    blob: string,
    contentHash: string,
    nowMs?: number,
  ): Promise<{ id: string; deduplicated: boolean }> {
    return this.call<{ id: string; deduplicated: boolean }>('saveReplayIdempotent', [
      id,
      blob,
      contentHash,
      nowMs,
    ]);
  }

  getReplayState(id: string, nowMs?: number): Promise<ReplayState> {
    return this.call<ReplayState>('getReplayState', [id, nowMs]);
  }

  recordAiUsage(key: string, costMicroUsd: number, nowMs?: number): Promise<void> {
    return this.call<void>('recordAiUsage', [key, costMicroUsd, nowMs]);
  }

  getDailyUsage(key?: string, nowMs?: number): Promise<DailyUsage> {
    return this.call<DailyUsage>('getDailyUsage', [key, nowMs]);
  }

  getStorageBytes(): Promise<number> {
    return this.call<number>('getStorageBytes', []);
  }
}

/**
 * In-isolate fallback. Module 21 §2 forbids module-scope mutable state in the
 * gateway, and this is the one deliberate exception: it only exists when the
 * `ROOM` binding is missing (tests / local dev), never in production where
 * `RemoteRoom` is used.
 */
let fallbackRoom: Room | null = null;

function localRoom(env: Env, ctx: unknown): Room {
  if (!fallbackRoom) fallbackRoom = new Room(ctx, env);
  return fallbackRoom;
}

export function resolveGlobalRoom(env: Env, ctx: unknown): RoomFacade {
  const ns = env.ROOM as RoomNamespaceLike | undefined;
  if (ns?.idFromName && ns?.get) {
    return new RemoteRoom(ns.get(ns.idFromName('__global__')));
  }
  return localRoom(env, ctx);
}

export function resolveRoom(env: Env, ctx: unknown, roomCode: string): RoomFacade {
  const ns = env.ROOM as RoomNamespaceLike | undefined;
  if (ns?.idFromName && ns?.get) {
    return new RemoteRoom(ns.get(ns.idFromName(roomCode)));
  }
  return localRoom(env, ctx);
}

/**
 * Raw stub for transport-level upgrades. Returns `null` without a binding: the
 * in-isolate fallback has no `acceptWebSocket`, so pretending to upgrade would
 * hand the client a dead socket.
 */
export function resolveRoomStub(env: Env, ctx: unknown, roomCode: string): RoomStubLike | null {
  const ns = env.ROOM as RoomNamespaceLike | undefined;
  if (ns?.idFromName && ns?.get) {
    return ns.get(ns.idFromName(roomCode));
  }
  return null;
}

/** Test seam: drops the in-isolate fallback between suites. */
export function resetFallbackRoom(): void {
  fallbackRoom = null;
}
