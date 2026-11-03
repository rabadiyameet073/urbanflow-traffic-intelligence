import fs from 'node:fs';

// 1. Update packages/web/src/state/store.ts
{
  let s = fs.readFileSync('packages/web/src/state/store.ts', 'utf8');

  s = s.replace(
    'public requestPreemption(lane: LaneId, distanceM?: number): Promise<EvpDecisionResponse> {',
    'public requestPreemption(lane: LaneId, distanceM = 45): Promise<EvpDecisionResponse> {'
  );

  s = s.replace(
    'public spawnVehicle(lane: LaneId, type: VehicleType, count = 1, distanceM?: number): void {',
    'public spawnVehicle(lane: LaneId, type: VehicleType, count = 1, distanceM = 45): void {'
  );

  s = s.replace(
    'public spawnEms(lane: LaneId): void {\n    this.client.spawnEms(lane);\n  }',
    'public spawnEms(lane: LaneId, distanceM = 45): void {\n    void this.requestPreemption(lane, distanceM);\n  }'
  );

  s = s.replace(
    'void this.requestPreemption(lane);',
    'void this.requestPreemption(lane, distanceM);'
  );

  fs.writeFileSync('packages/web/src/state/store.ts', s, 'utf8');
  console.log('store.ts updated');
}

// 2. Update packages/web/src/worker/sim.worker.ts
{
  let s = fs.readFileSync('packages/web/src/worker/sim.worker.ts', 'utf8');

  // Add postFrames() immediately upon spawning commands so canvas reflects spawn without 1 tick delay
  s = s.replace(
    "case 'spawnEms':\n      world?.spawnEms(command.lane);\n      publish(true);\n      break;",
    "case 'spawnEms':\n      world?.spawnEms(command.lane);\n      publish(true);\n      postFrames();\n      break;"
  );

  s = s.replace(
    "case 'spawnVehicle':\n      world?.spawnVehicle(command.lane, command.vehicleType, command.count, command.distanceM);\n      publish(true);\n      break;",
    "case 'spawnVehicle':\n      world?.spawnVehicle(command.lane, command.vehicleType, command.count, command.distanceM);\n      publish(true);\n      postFrames();\n      break;"
  );

  s = s.replace(
    "post({ v: WORKER_PROTOCOL_VERSION, type: 'preemptionResult', result });\n      publish(true);\n      break;",
    "post({ v: WORKER_PROTOCOL_VERSION, type: 'preemptionResult', result });\n      publish(true);\n      postFrames();\n      break;"
  );

  fs.writeFileSync('packages/web/src/worker/sim.worker.ts', s, 'utf8');
  console.log('sim.worker.ts updated');
}

// 3. Update packages/core/src/sim/engine.ts
{
  let s = fs.readFileSync('packages/core/src/sim/engine.ts', 'utf8');

  // Give spawned non-EMS vehicles initial road speed when spawned in approach (pos <= 60)
  const oldInsert = `          // An ambulance arrives doing its cruise speed; anything written into
          // the middle of a live lane is a stationary obstruction, which is the
          // only honest reading of "a vehicle that was not there a tick ago".
          isEms ? TIMING.EMS_CRUISE_MPS : 0,`;

  const newInsert = `          // An ambulance arrives doing cruise speed; other vehicles enter with approach speed
          isEms
            ? TIMING.EMS_CRUISE_MPS
            : Math.min(spec.maxSpeedMps, this.config.speedLimitMps * 0.8),`;

  s = s.replace(oldInsert, newInsert);
  if (!s.includes('enter with approach speed')) {
    s = s.replace(oldInsert.replace(/\n/g, '\r\n'), newInsert.replace(/\n/g, '\r\n'));
  }

  fs.writeFileSync('packages/core/src/sim/engine.ts', s, 'utf8');
  console.log('engine.ts updated');
}

