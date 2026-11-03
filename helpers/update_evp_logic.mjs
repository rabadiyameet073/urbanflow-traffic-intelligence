import fs from 'node:fs';

// 1. Update kernel.ts
{
  let s = fs.readFileSync('packages/core/src/control/kernel.ts', 'utf8');

  // Replace EVP override in GREEN
  const target1 = `      // EVP override (takes precedence if preemption is active)
      if (evp && evp.stage === 'PRECLEAR' && evp.targetPhase !== this.currentPhase) {
        desiredPhase = evp.targetPhase;
      }

      // Check anti-starvation (MAX_RED_WAIT_S = 120s)
      for (const p of PHASES) {
        if (p !== this.currentPhase && this.redWaitTimesS[p] >= TIMING.MAX_RED_WAIT_S) {
          desiredPhase = p;
          this.violationsPrevented.STARVATION_EXCEEDED++;
          break;
        }
      }`;

  const replace1 = `      // EVP override (takes precedence if preemption is active)
      if (evp && (evp.stage === 'PRECLEAR' || evp.stage === 'EMS_GREEN') && evp.targetPhase !== this.currentPhase) {
        desiredPhase = evp.targetPhase;
      } else if (!evp || evp.stage === 'IDLE' || evp.stage === 'RECOVERY') {
        // Check anti-starvation (MAX_RED_WAIT_S = 120s) ONLY when not preempting
        for (const p of PHASES) {
          if (p !== this.currentPhase && this.redWaitTimesS[p] >= TIMING.MAX_RED_WAIT_S) {
            desiredPhase = p;
            this.violationsPrevented.STARVATION_EXCEEDED++;
            break;
          }
        }
      }`;

  s = s.replace(target1, replace1);
  if (!s.includes('ONLY when not preempting')) {
    s = s.replace(target1.replace(/\n/g, '\r\n'), replace1.replace(/\n/g, '\r\n'));
  }

  // Replace minGreen
  s = s.replace(
    "const minGreen = evp && evp.stage === 'PRECLEAR' ? 3.0 : TIMING.G_MIN_S;",
    "const minGreen = evp && (evp.stage === 'PRECLEAR' || evp.stage === 'EMS_GREEN') ? 0 : TIMING.G_MIN_S;"
  );

  // Routing in YELLOW
  const targetYellow = `    } else if (this.indication === 'YELLOW') {
      // SAFETY: I5 — YELLOW cannot be shortened by any caller, including EVP (3.5s)`;
  const replaceYellow = `    } else if (this.indication === 'YELLOW') {
      if (evp && (evp.stage === 'PRECLEAR' || evp.stage === 'EMS_GREEN')) {
        this.pendingNextPhase = evp.targetPhase;
      }
      // SAFETY: I5 — YELLOW cannot be shortened by any caller, including EVP (3.5s)`;

  s = s.replace(targetYellow, replaceYellow);
  if (!s.includes('this.pendingNextPhase = evp.targetPhase;\n      // SAFETY: I5 — YELLOW')) {
    s = s.replace(targetYellow.replace(/\n/g, '\r\n'), replaceYellow.replace(/\n/g, '\r\n'));
  }

  // Routing in ALL_RED
  const targetAllRed = `    } else if (this.indication === 'ALL_RED') {
      // SAFETY: I5 — ALL_RED cannot be shortened by any caller, including EVP (2.0s)`;
  const replaceAllRed = `    } else if (this.indication === 'ALL_RED') {
      if (evp && (evp.stage === 'PRECLEAR' || evp.stage === 'EMS_GREEN')) {
        this.pendingNextPhase = evp.targetPhase;
      }
      // SAFETY: I5 — ALL_RED cannot be shortened by any caller, including EVP (2.0s)`;

  s = s.replace(targetAllRed, replaceAllRed);
  if (!s.includes('this.pendingNextPhase = evp.targetPhase;\n      // SAFETY: I5 — ALL_RED')) {
    s = s.replace(targetAllRed.replace(/\n/g, '\r\n'), replaceAllRed.replace(/\n/g, '\r\n'));
  }

  fs.writeFileSync('packages/core/src/control/kernel.ts', s, 'utf8');
  console.log('kernel.ts updated successfully');
}

// 2. Update evp.ts
{
  let s = fs.readFileSync('packages/core/src/control/evp.ts', 'utf8');

  const targetEvp = `    } else if (this.stage === 'EMS_GREEN') {
      // Vehicle passes stop line or exits box
      const isPastStopLine = laneObs?.nearestEmsDistanceM === null;
      if (isPastStopLine || this.stageTimeS >= TIMING.EVP_HOLD_MAX_S) {
        this.stage = 'RECOVERY';
        this.stageTimeS = 0;
      }
    }`;

  const replaceEvp = `    } else if (this.stage === 'EMS_GREEN') {
      if (laneObs?.nearestEmsDistanceM !== null && laneObs?.nearestEmsDistanceM !== undefined) {
        ems.hasReachedStopLine = true;
      }
      // Vehicle passes stop line or exits box (minimum 4s green dwell to clear)
      const isPastStopLine = ems.hasReachedStopLine && (laneObs?.nearestEmsDistanceM === null || laneObs?.nearestEmsDistanceM === undefined);
      if ((isPastStopLine && this.stageTimeS >= 4.0) || this.stageTimeS >= TIMING.EVP_HOLD_MAX_S) {
        this.stage = 'RECOVERY';
        this.stageTimeS = 0;
      }
    }`;

  s = s.replace(targetEvp, replaceEvp);
  if (!s.includes('minimum 4s green dwell to clear')) {
    s = s.replace(targetEvp.replace(/\n/g, '\r\n'), replaceEvp.replace(/\n/g, '\r\n'));
  }

  fs.writeFileSync('packages/core/src/control/evp.ts', s, 'utf8');
  console.log('evp.ts updated successfully');
}

// 3. Update twin.ts
{
  let s = fs.readFileSync('packages/core/src/worker/twin.ts', 'utf8');

  // Update submitPreemption to accept optional existingEmsId
  const oldSubmit = `  private submitPreemption(lane: LaneId, targetDistanceM?: number): EvpDecisionResponse {
    const simTimeS = this.simAdaptive.simTimeS;
    // Spawned in both twins: the arrival must be identical on both sides or the
    // comparison stops being a comparison (Module 25 §1, Module 31 §5).
    const emsId = this.spawnEmsInternal(lane, targetDistanceM);`;

  const newSubmit = `  private submitPreemption(
    lane: LaneId,
    targetDistanceM?: number,
    existingEmsId?: string,
  ): EvpDecisionResponse {
    const simTimeS = this.simAdaptive.simTimeS;
    // If vehicle is already spawned in the twins, reuse its emsId rather than duplicating
    const emsId = existingEmsId ?? this.spawnEmsInternal(lane, targetDistanceM);`;

  s = s.replace(oldSubmit, newSubmit);
  if (!s.includes('existingEmsId ?? this.spawnEmsInternal')) {
    s = s.replace(oldSubmit.replace(/\n/g, '\r\n'), newSubmit.replace(/\n/g, '\r\n'));
  }

  // Update spawnVehicleInternal to auto-preempt when AMBULANCE is spawned
  const oldSpawnV = `  private spawnVehicleInternal(
    lane: LaneId,
    type: VehicleType,
    count = 1,
    distanceM?: number,
  ): string[] {
    this.simFixed.spawnVehicle(lane, type, count, distanceM);
    return this.simAdaptive.spawnVehicle(lane, type, count, distanceM);
  }`;

  const newSpawnV = `  private spawnVehicleInternal(
    lane: LaneId,
    type: VehicleType,
    count = 1,
    distanceM?: number,
  ): string[] {
    this.simFixed.spawnVehicle(lane, type, count, distanceM);
    const emsIds = this.simAdaptive.spawnVehicle(lane, type, count, distanceM);
    if (type === 'AMBULANCE' && emsIds.length > 0) {
      const laneObs = this.simAdaptive.observe().lanes[lane];
      const dist = distanceM ?? laneObs?.nearestEmsDistanceM ?? this.simAdaptive.config.emsDetectDistanceM;
      this.submitPreemption(lane, dist, emsIds[0]);
    }
    return emsIds;
  }`;

  s = s.replace(oldSpawnV, newSpawnV);
  if (!s.includes('this.submitPreemption(lane, dist, emsIds[0]);')) {
    s = s.replace(oldSpawnV.replace(/\n/g, '\r\n'), newSpawnV.replace(/\n/g, '\r\n'));
  }

  // Update tick() to auto-detect any ambulance in approach lanes and trigger preemption immediately
  const oldTick = `    const obsAdaptive = this.simAdaptive.observe();
    this.lastAction = this.ctrlAdaptive.decide(obsAdaptive);`;

  const newTick = `    const obsAdaptive = this.simAdaptive.observe();

    // Emergency vehicle preemption logic: automatically trigger immediate preemption
    // whenever an ambulance enters any approach lane (bypassing normal cycle).
    if (this.evpAdaptive.getStatus() === null) {
      for (const lane of LANES) {
        const laneObs = obsAdaptive.lanes[lane];
        if (laneObs && laneObs.nearestEmsDistanceM !== null && laneObs.nearestEmsDistanceM !== undefined) {
          this.submitPreemption(lane, laneObs.nearestEmsDistanceM);
          break;
        }
      }
    }

    this.lastAction = this.ctrlAdaptive.decide(obsAdaptive);`;

  s = s.replace(oldTick, newTick);
  if (!s.includes('// Emergency vehicle preemption logic: automatically trigger immediate preemption')) {
    s = s.replace(oldTick.replace(/\n/g, '\r\n'), newTick.replace(/\n/g, '\r\n'));
  }

  fs.writeFileSync('packages/core/src/worker/twin.ts', s, 'utf8');
  console.log('twin.ts updated successfully');
}

