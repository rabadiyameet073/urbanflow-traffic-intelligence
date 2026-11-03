# Skill: worker-protocol

**Use when:** Changing messages between main thread and the simulation worker.

**Read first:** `technical-architecture/31`, `backend-engineering/22`, Rule 12

## Rules

1. Messages are a discriminated union with a `type` and `v` (protocol version); handle with an exhaustive `switch` and `assertNever`.
2. Frame data travels as transferable `ArrayBuffer`s with the documented layout; the worker reuses a pool.
3. Commands (`init`, `run`, `pause`, `setSpeed`, `requestPhase`, `injectEvp`, `snapshot`, `restore`) are idempotent where possible and acknowledged by `seq`.
4. Back-pressure: the worker drops stale frames rather than queueing.
5. Validate messages with zod in dev builds; strip in production.
6. Worker errors surface as typed `error` messages, never silent.

## Good / Bad

- ✅ `postMessage({type:'frame', v:1, seq, buf}, [buf])`
- ❌ `postMessage(JSON.stringify(state))` every tick.

## Landmines

- Transferred buffers are detached; the worker must re-allocate or pool them.
- Do not share clocks: the worker advances by ticks, not `Date`.
