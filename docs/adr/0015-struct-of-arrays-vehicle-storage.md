# ADR-015: Struct-of-arrays vehicle storage, no allocation in tick loop
- Status: Accepted
- Date: 2026-10-31
- Deciders: UrbanFlow Architecture Team

## Context
High-frequency simulation loops (10 Hz or 100x headless speed) allocate thousands of vehicle objects per second if using object-oriented collections (`new Vehicle()`), triggering frequent Garbage Collection (GC) pauses that ruin frame rates.

## Options
- (a) Struct-of-arrays (SoA) backed by typed arrays (`Float32Array`, `Int32Array`, `Uint8Array`) with reusable slot free-lists.
- (b) Array of vehicle objects (`Array<Vehicle>`) with `push`/`splice`.

## Decision
Adopt option (a). Pre-allocate fixed typed arrays per lane (`posM`, `speedMps`, `accelMps2`, `typeIdx`, `flags`). Vehicle exits recycle slots to a free list. Zero dynamic heap allocation occurs in the hot physics tick.

## Consequences
- Positive: Predictable L1/L2 cache locality, zero GC pressure, sustains > 150x real-time speed in headless benchmarks.
- Negative: Low-level indexing logic localized to `packages/core/src/sim/lane.ts`.

## Evidence
`packages/bench/test/bench.test.ts` executes 3600 sim-seconds in < 2 seconds.

