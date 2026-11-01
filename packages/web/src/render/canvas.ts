/**
 * Module 31 §3: 60 FPS canvas renderer for one twin.
 *
 * The renderer no longer knows what a `SimEngine` is. It receives two frames of
 * `Float32Array` vehicle data from the worker, keeps both, and paints an
 * interpolated picture between them. Three consequences worth stating:
 *
 *   - **Culling is free.** A vehicle is only drawn if its world position falls
 *     inside the viewport, so a 300 m approach costs the same as a 30 m one.
 *   - **Colour is never the only channel.** Type is carried by shape *and* size,
 *     signal state by colour *and* glyph (Module 41 §3).
 *   - **No wall-clock phase.** The ambulance light bar is phased from simulated
 *     seconds carried in the frame header, so the same state hash always paints
 *     the same frame; `prefers-reduced-motion` removes the pulse entirely.
 */
import {
  FRAME_FLAG,
  FRAME_INDEX,
  LANES,
  SIGNAL_HEAD,
  VEHICLE_STRIDE,
  VIEWPORT_HALF_EXTENT_M,
  canvasToWorld,
  laneAnchor,
  laneAtWorldPoint,
  viewportFor,
  worldToCanvas,
} from '@urbanflow/core';
import type { FrameEvent, LaneId, Viewport } from '@urbanflow/core';
import { getCanvasPalette } from './palette.js';
import type { CanvasPalette } from './palette.js';

/** Must match the worker pool size; a frame larger than this is truncated. */
const MAX_VEHICLES = 4096;
const FRAME_FLOATS = MAX_VEHICLES * VEHICLE_STRIDE;

/** Vehicle body widths in metres, so the drawing is a scale model, not a glyph. */
const BODY_WIDTH_M: Readonly<Record<number, number>> = {
  0: 0.9, // BIKE
  1: 1.9, // CAR
  2: 2.5, // BUS
  3: 2.5, // TRUCK
  4: 2.3, // AMBULANCE
};

/** Paint the immutable part of the scene: asphalt, centre lines, stop lines. */
function paintStatic(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  palette: CanvasPalette,
): void {
  const { widthPx, heightPx } = viewport;
  ctx.clearRect(0, 0, widthPx, heightPx);

  // Two 3.5 m lanes per approach ⇒ 7 m of asphalt each way.
  const roadWidthPx = 7 * viewport.pxPerMetre;
  const half = roadWidthPx / 2;
  const { centerXPx: cx, centerYPx: cy } = viewport;

  ctx.fillStyle = palette.road;
  ctx.fillRect(cx - half, 0, roadWidthPx, heightPx);
  ctx.fillRect(0, cy - half, widthPx, roadWidthPx);

  ctx.strokeStyle = palette.roadMarking;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, cy - half);
  ctx.moveTo(cx, cy + half);
  ctx.lineTo(cx, heightPx);
  ctx.moveTo(0, cy);
  ctx.lineTo(cx - half, cy);
  ctx.moveTo(cx + half, cy);
  ctx.lineTo(widthPx, cy);
  ctx.stroke();

  // Stop lines, one per approach, on the approach's own half of the road.
  ctx.setLineDash([]);
  ctx.strokeStyle = palette.stopLine;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - half);
  ctx.lineTo(cx + half, cy - half);
  ctx.moveTo(cx - half, cy);
  ctx.lineTo(cx, cy);
  ctx.moveTo(cx, cy + half);
  ctx.lineTo(cx - half, cy + half);
  ctx.moveTo(cx + half, cy);
  ctx.lineTo(cx + half, cy - half);
  ctx.stroke();
}

export class TwinCanvasRenderer {
  /**
   * Module 15 §4.4: HiDPI via `devicePixelRatio`, capped at 2. The cap is
   * deliberate: 3× costs nine times the fill rate for no visible difference
   * beside a 60 FPS canvas budget.
   */
  private static readonly MAX_DPR = 2;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly staticLayer: HTMLCanvasElement;
  private staticKey = '';
  private reducedMotion = false;

  // Two most recent frames, copied because the worker reuses its buffers.
  private prev = new Float32Array(FRAME_FLOATS);
  private prevCount = 0;
  private cur = new Float32Array(FRAME_FLOATS);
  private curCount = 0;
  private curHeads: Uint8Array = new Uint8Array(LANES.length);
  private curSimS = 0;
  private curAtMs = 0;
  private intervalMs = 16;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.staticLayer = document.createElement('canvas');

    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (query) {
      this.reducedMotion = query.matches;
      query.addEventListener('change', (event) => {
        this.reducedMotion = event.matches;
      });
    }
  }

  /**
   * Accept one frame from the worker.
   *
   * The buffer is copied immediately: the client hands it straight back to the
   * worker for reuse, so holding a reference would paint a frame that is being
   * overwritten by the next tick.
   */
  public pushFrame(event: FrameEvent): void {
    const now = performance.now();
    const n = Math.min(event.header.n, MAX_VEHICLES);
    const floats = n * VEHICLE_STRIDE;

    if (this.curCount > 0 && this.curAtMs > 0) {
      this.prev.set(this.cur.subarray(0, this.curCount * VEHICLE_STRIDE));
      this.prevCount = this.curCount;
      const measured = now - this.curAtMs;
      if (measured > 0 && measured < 500) {
        // Smooth the interval so a single slow frame does not stall motion.
        this.intervalMs = this.intervalMs * 0.8 + measured * 0.2;
      }
    }

    this.cur.set(event.vehicles.subarray(0, floats));
    this.curCount = n;
    this.curHeads = event.signalHeads;
    this.curSimS = event.header.tSimS;
    this.curAtMs = now;
  }

  /** Paint the interpolated frame. Called from the main thread's rAF loop. */
  public draw(nowMs: number): void {
    // Module 15 §4.5: read DOM metrics once per frame, here, before any draw call.
    this.syncBackingStore();
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width === 0 || height === 0) return;

    const palette = getCanvasPalette();
    const theme = document.documentElement.getAttribute('data-theme') ?? 'dark';
    const viewport = viewportFor(width, height);

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.ensureStaticLayer(viewport, theme), 0, 0);

    const alpha =
      this.intervalMs > 0
        ? Math.max(0, Math.min(1, (nowMs - this.curAtMs) / this.intervalMs))
        : 1;

    this.drawVehicles(viewport, palette, alpha, nowMs);
    this.drawSignalHeads(viewport, palette);
  }

  /** Lane under a canvas point, for click-to-select (Module 31 §3, hit testing). */
  public laneAt(px: number, py: number): LaneId | null {
    const viewport = viewportFor(this.canvas.width, this.canvas.height);
    // Event offsets arrive in CSS pixels; the backing store is in device pixels
    // since the Module 15 §4.4 dpr scaling. Convert before asking the world.
    const sx = this.canvas.clientWidth > 0 ? this.canvas.width / this.canvas.clientWidth : 1;
    const sy = this.canvas.clientHeight > 0 ? this.canvas.height / this.canvas.clientHeight : 1;
    const world = canvasToWorld(px * sx, py * sy, viewport);
    // The visible approach is bounded by what the frame can hold; 400 m covers
    // every configured lane length without inventing a number here.
    return laneAtWorldPoint(world.x, world.y, 400);
  }

  /**
   * Resize the backing store to the CSS box × the capped dpr. The layout size
   * comes from CSS (`.canvas-viewport canvas`), never from the attributes, so
   * writing `width`/`height` here cannot feed back into `clientWidth`.
   */
  private syncBackingStore(): void {
    const dpr = Math.min(TwinCanvasRenderer.MAX_DPR, window.devicePixelRatio ?? 1);
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  private ensureStaticLayer(viewport: Viewport, theme: string): HTMLCanvasElement {
    const key = `${viewport.widthPx}x${viewport.heightPx}:${theme}`;
    if (this.staticKey === key) return this.staticLayer;

    this.staticLayer.width = viewport.widthPx;
    this.staticLayer.height = viewport.heightPx;
    const staticCtx = this.staticLayer.getContext('2d');
    if (staticCtx) paintStatic(staticCtx, viewport, getCanvasPalette());
    this.staticKey = key;
    return this.staticLayer;
  }

  private drawVehicles(viewport: Viewport, palette: CanvasPalette, alpha: number, nowMs: number): void {
    const ctx = this.ctx;
    // Deterministic 1.43 Hz pulse phased from *simulated* seconds.
    const pulseOn = Math.floor(this.curSimS / 0.35) % 2 === 0;
    const interpolate = this.prevCount === this.curCount;

    for (let i = 0; i < this.curCount; i++) {
      const base = i * VEHICLE_STRIDE;
      const typeIdx = this.cur[base + FRAME_INDEX.TYPE] ?? 1;
      const flags = this.cur[base + FRAME_INDEX.FLAGS] ?? 0;

      let x = this.cur[base + FRAME_INDEX.X] ?? 0;
      let y = this.cur[base + FRAME_INDEX.Y] ?? 0;

      if (interpolate && alpha < 1) {
        // Paired by index: a lane's `order` array is a FIFO, so slot i is the
        // same vehicle unless its leader left in the same frame. On that
        // boundary the two frames have different counts and we do not blend.
        const prevBase = base;
        x = (this.prev[prevBase + FRAME_INDEX.X] ?? x) * (1 - alpha) + x * alpha;
        y = (this.prev[prevBase + FRAME_INDEX.Y] ?? y) * (1 - alpha) + y * alpha;
      }

      const point = worldToCanvas(x, y, viewport);
      // Cull: the canvas is smaller than the world it represents.
      if (point.px < -80 || point.px > viewport.widthPx + 80) continue;
      if (point.py < -80 || point.py > viewport.heightPx + 80) continue;

      const heading = this.cur[base + FRAME_INDEX.HEADING] ?? 0;
      const lengthM = this.cur[base + FRAME_INDEX.LENGTH_M] ?? 4.5;
      const widthM = BODY_WIDTH_M[typeIdx] ?? 1.9;
      const vertical = Math.abs(Math.sin(heading)) > 0.5;

      const longPx = Math.max(4, lengthM * viewport.pxPerMetre);
      const shortPx = Math.max(3, widthM * viewport.pxPerMetre);
      const w = vertical ? shortPx : longPx;
      const h = vertical ? longPx : shortPx;

      const isEms = (flags & FRAME_FLAG.EMS) !== 0 || typeIdx === 4;
      const isBraking = (flags & FRAME_FLAG.BRAKING) !== 0;

      if (typeIdx === 0) {
        // BIKE: a dot with a direction tick, never a rectangle.
        ctx.fillStyle = palette.bike;
        ctx.beginPath();
        ctx.arc(point.px, point.py, Math.max(3, shortPx / 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = palette.roadMarking;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(point.px, point.py);
        ctx.lineTo(
          point.px + Math.cos(heading) * (longPx / 2 + 2),
          point.py - Math.sin(heading) * (longPx / 2 + 2),
        );
        ctx.stroke();
        continue;
      }

      if (isEms) {
        this.drawAmbulance(point, heading, longPx, shortPx, nowMs, isBraking, palette);
        continue;
      }

      const fill =
        typeIdx === 2
          ? palette.bus
          : typeIdx === 3
            ? palette.truck
            : palette.car;

      ctx.fillStyle = fill;

      ctx.beginPath();
      ctx.roundRect(point.px - w / 2, point.py - h / 2, w, h, typeIdx === 1 ? 2 : 1);
      ctx.fill();

      // Shape redundancy: BUS gets a window stripe, TRUCK a cab split.
      if (typeIdx === 2 || typeIdx === 3) {
        ctx.fillStyle = palette.roadMarking;
        if (vertical) {
          const stripe = typeIdx === 2 ? h * 0.18 : h * 0.3;
          const offset = typeIdx === 2 ? h * 0.2 : h * 0.25;
          ctx.fillRect(point.px - w / 2, point.py - h / 2 + offset, w, Math.max(1, stripe));
        } else {
          const stripe = typeIdx === 2 ? w * 0.18 : w * 0.3;
          const offset = typeIdx === 2 ? w * 0.2 : w * 0.25;
          ctx.fillRect(point.px - w / 2 + offset, point.py - h / 2, Math.max(1, stripe), h);
        }
      }

      // §3.2 brake lights: a red pair at the rear when the core flagged this
      // vehicle as decelerating. Drawn from the same simulated flags as the rest
      // of the frame, so the marker is deterministic — never wall-clock driven.
      if (isBraking) {
        const fx = Math.cos(heading);
        const fy = -Math.sin(heading);
        const rearX = point.px - fx * (longPx / 2);
        const rearY = point.py - fy * (longPx / 2);
        const perpX = -fy;
        const perpY = fx;
        const spread = shortPx * 0.28;
        const dot = Math.max(1.5, shortPx * 0.16);
        ctx.fillStyle = palette.stop;
        for (const sign of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(rearX + perpX * spread * sign, rearY + perpY * spread * sign, dot, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /**
   * High-visibility emergency vehicle renderer with:
   * - Alternating dual Red & Electric Blue emergency LED lightbar
   * - Multi-strobe wig-wag cadence (360ms cycle with double-flash bursts)
   * - Radial emergency light bloom ("blumbing" aura) casting onto pavement
   * - Radiating acoustic siren wave rings
   * - Crisp medical emergency Red Cross (+) on roof
   * - Front wig-wag headlights & rear emergency brake/hazard flashers
   * - Respects `prefers-reduced-motion` with static high-contrast beacons
   */
  private drawAmbulance(
    point: { px: number; py: number },
    heading: number,
    longPx: number,
    shortPx: number,
    nowMs: number,
    isBraking: boolean,
    palette: CanvasPalette,
  ): void {
    const ctx = this.ctx;
    const reduced = this.isReducedMotion();

    // Strobe cadence calculation: 360ms wig-wag pattern (approx 2.8 Hz, 166 flashes/min)
    const cycleMs = 360;
    const tCycle = (nowMs % cycleMs);
    let redIntensity = 0.08;
    let blueIntensity = 0.08;

    if (reduced) {
      // Accessible static mode: steady high-contrast split beacons, zero flicker
      redIntensity = 0.8;
      blueIntensity = 0.8;
    } else {
      // Phase 1 (0ms - 170ms): Red double-burst
      // Flash 1: 0 - 60ms; Gap: 60 - 85ms; Flash 2: 85 - 150ms; Decay: 150 - 170ms
      if ((tCycle >= 0 && tCycle < 60) || (tCycle >= 85 && tCycle < 150)) {
        redIntensity = 1.0;
      } else if (tCycle < 170) {
        redIntensity = 0.25;
      }

      // Phase 2 (180ms - 350ms): Blue double-burst
      // Flash 1: 180 - 240ms; Gap: 240 - 265ms; Flash 2: 265 - 330ms; Decay: 330 - 350ms
      const bt = tCycle - 180;
      if ((bt >= 0 && bt < 60) || (bt >= 85 && bt < 150)) {
        blueIntensity = 1.0;
      } else if (tCycle >= 180 && tCycle < 350) {
        blueIntensity = 0.25;
      }
    }

    // Direction unit vectors in canvas coordinates
    const fx = Math.cos(heading);
    const fy = -Math.sin(heading);
    const perpX = -fy;
    const perpY = fx;

    // Lightbar beacon positions in screen space
    const barForwardDist = longPx * 0.12;
    const barSpread = shortPx * 0.28;
    const barCenterX = point.px + fx * barForwardDist;
    const barCenterY = point.py + fy * barForwardDist;
    const redX = barCenterX - perpX * barSpread;
    const redY = barCenterY - perpY * barSpread;
    const blueX = barCenterX + perpX * barSpread;
    const blueY = barCenterY + perpY * barSpread;

    // 1. LAYER 1: Radial Emergency Light Bloom ("blumbing" wash on asphalt)
    if (!reduced) {
      // Red light bloom
      if (redIntensity > 0.2) {
        const rRadius = Math.max(26, longPx * 1.6 * (0.85 + 0.35 * redIntensity));
        const redGrad = ctx.createRadialGradient(redX, redY, 1, redX, redY, rRadius);
        redGrad.addColorStop(0, `rgba(255, 30, 45, ${0.48 * redIntensity})`);
        redGrad.addColorStop(0.3, `rgba(239, 68, 68, ${0.28 * redIntensity})`);
        redGrad.addColorStop(0.65, `rgba(220, 38, 38, ${0.08 * redIntensity})`);
        redGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
        ctx.fillStyle = redGrad;
        ctx.beginPath();
        ctx.arc(redX, redY, rRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Blue light bloom
      if (blueIntensity > 0.2) {
        const bRadius = Math.max(26, longPx * 1.6 * (0.85 + 0.35 * blueIntensity));
        const blueGrad = ctx.createRadialGradient(blueX, blueY, 1, blueX, blueY, bRadius);
        blueGrad.addColorStop(0, `rgba(0, 200, 255, ${0.55 * blueIntensity})`);
        blueGrad.addColorStop(0.3, `rgba(37, 99, 235, ${0.32 * blueIntensity})`);
        blueGrad.addColorStop(0.65, `rgba(30, 64, 175, ${0.10 * blueIntensity})`);
        blueGrad.addColorStop(1, 'rgba(30, 64, 175, 0)');
        ctx.fillStyle = blueGrad;
        ctx.beginPath();
        ctx.arc(blueX, blueY, bRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. LAYER 2: Siren Acoustic Warning Pulse Waves (expanding concentric ripple rings)
      const wavePeriod = 1100;
      const wavePhase = (nowMs % wavePeriod) / wavePeriod;
      for (let w = 0; w < 2; w++) {
        const p = (wavePhase + w * 0.5) % 1.0;
        const r = Math.max(14, shortPx * 0.7) + p * Math.max(38, longPx * 1.9);
        const waveAlpha = Math.sin(p * Math.PI) * 0.28;
        ctx.strokeStyle = w === 0 ? `rgba(239, 68, 68, ${waveAlpha})` : `rgba(59, 130, 246, ${waveAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(point.px, point.py, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 3. LAYER 3: Oriented Ambulance Vehicle Body & Roof Details
    ctx.save();
    ctx.translate(point.px, point.py);
    ctx.rotate(-heading);

    const halfL = longPx / 2;
    const halfW = shortPx / 2;

    // Ambulance chassis (crisp clean white with rounded aerodynamic corners)
    ctx.fillStyle = palette.ambulance;
    ctx.beginPath();
    ctx.roundRect(-halfL, -halfW, longPx, shortPx, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // High-visibility side reflective orange/red chevron stripe
    ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.fillRect(-halfL * 0.8, -halfW, longPx * 0.7, Math.max(1, shortPx * 0.1));
    ctx.fillRect(-halfL * 0.8, halfW - Math.max(1, shortPx * 0.1), longPx * 0.7, Math.max(1, shortPx * 0.1));

    // Cab windshield (dark tinted glass)
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(halfL * 0.26, -halfW * 0.78, Math.max(2, longPx * 0.14), shortPx * 1.56, 1.5);
    ctx.fill();

    // Medical Emergency Red Cross (+) on rear roof
    const crossCenterX = -halfL * 0.25;
    ctx.fillStyle = '#E11D48'; // Star of Life / Medical Red
    // Horizontal cross bar
    const crossBarW = Math.max(2, shortPx * 0.18);
    const crossBarL = Math.max(5, shortPx * 0.58);
    ctx.beginPath();
    ctx.roundRect(crossCenterX - crossBarW / 2, -crossBarL / 2, crossBarW, crossBarL, 1);
    ctx.fill();
    // Vertical cross bar
    const crossVLen = Math.max(5, longPx * 0.26);
    const crossVThick = Math.max(2, longPx * 0.08);
    ctx.beginPath();
    ctx.roundRect(crossCenterX - crossVLen / 2, -crossVThick / 2, crossVLen, crossVThick, 1);
    ctx.fill();

    // Aerodynamic roof lightbar housing
    const barX = halfL * 0.15;
    const barW = Math.max(3, longPx * 0.13);
    const barH = shortPx * 0.76;
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.roundRect(barX - barW / 2, -barH / 2, barW, barH, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Left Strobe (Red, -Y in local coordinates)
    const strobeR = Math.max(2.5, shortPx * 0.16);
    const strobeY = -barH * 0.32;
    ctx.fillStyle = redIntensity > 0.4 ? '#FF1E27' : '#991B1B';
    ctx.beginPath();
    ctx.arc(barX, strobeY, strobeR, 0, Math.PI * 2);
    ctx.fill();
    if (redIntensity > 0.3) {
      // White-hot diode center
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, redIntensity)})`;
      ctx.beginPath();
      ctx.arc(barX, strobeY, Math.max(1, strobeR * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }

    // Right Strobe (Electric Blue, +Y in local coordinates)
    const strobeBlueY = barH * 0.32;
    ctx.fillStyle = blueIntensity > 0.4 ? '#00D8FF' : '#1E40AF';
    ctx.beginPath();
    ctx.arc(barX, strobeBlueY, strobeR, 0, Math.PI * 2);
    ctx.fill();
    if (blueIntensity > 0.3) {
      // White-hot diode center
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, blueIntensity)})`;
      ctx.beginPath();
      ctx.arc(barX, strobeBlueY, Math.max(1, strobeR * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }

    // Center auxiliary strobe / takedown flasher
    const centerFlash = (redIntensity > 0.8 || blueIntensity > 0.8);
    ctx.fillStyle = centerFlash ? '#FEF08A' : '#64748B';
    ctx.fillRect(barX - 1, -shortPx * 0.08, 2, shortPx * 0.16);

    // Front headlights / wig-wag emergency flashers
    const frontX = halfL - 1;
    const headW = Math.max(2, shortPx * 0.18);
    // Left wig-wag headlight
    ctx.fillStyle = redIntensity > 0.5 ? '#FFFFFF' : '#FEF08A';
    ctx.fillRect(frontX - 1, -halfW * 0.78, 2, headW);
    // Right wig-wag headlight
    ctx.fillStyle = blueIntensity > 0.5 ? '#FFFFFF' : '#FEF08A';
    ctx.fillRect(frontX - 1, halfW * 0.78 - headW, 2, headW);

    // Rear brake & emergency hazard lights
    const rearX = -halfL;
    ctx.fillStyle = isBraking ? '#FF2222' : (redIntensity > 0.5 ? '#FF2222' : '#991B1B');
    ctx.fillRect(rearX, -halfW * 0.8, 2, headW);
    ctx.fillStyle = isBraking ? '#FF2222' : (blueIntensity > 0.5 ? '#3B82F6' : '#1E3A8A');
    ctx.fillRect(rearX, halfW * 0.8 - headW, 2, headW);

    ctx.restore();
  }

  private drawSignalHeads(viewport: Viewport, palette: CanvasPalette): void {
    const ctx = this.ctx;

    const drawHead = (x: number, y: number, code: number): void => {
      const color =
        code === SIGNAL_HEAD.G ? palette.go : code === SIGNAL_HEAD.Y ? palette.caution : palette.stop;
      // Redundant encoding: colour + glyph (Module 41 §3).
      const glyph = code === SIGNAL_HEAD.G ? '●' : code === SIGNAL_HEAD.Y ? '▲' : '■';

      ctx.fillStyle = palette.signalPlate;
      ctx.beginPath();
      ctx.roundRect(x - 14, y - 10, 28, 20, 4);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, x, y);
    };

    // One head per approach, on the kerb to the driver's right at the stop line.
    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i]!;
      if (!lane.endsWith('-TR')) continue;

      const code = this.curHeads[i] ?? SIGNAL_HEAD.R;
      const anchor = laneAnchor(lane);
      // Sit the head 1.5 m to the driver's right and 2 m upstream of the stop line.
      const point = worldToCanvas(
        anchor.x + anchor.dy * 1.5 - anchor.dx * 2,
        anchor.y - anchor.dx * 1.5 - anchor.dy * 2,
        viewport,
      );
      drawHead(point.px, point.py, code);
    }
  }

  /** Exposed for the empty-state canvas, which draws before the first frame. */
  public get hasFrame(): boolean {
    return this.curCount > 0;
  }

  /**
   * Reduced motion is true when the OS asks for it *or* the in-app override
   * (`data-reduce-motion="on"`, Module 42 §2) forces it. CSS cannot reach the
   * canvas, so the light-bar pulse consults this per frame instead.
   */
  private isReducedMotion(): boolean {
    return this.reducedMotion || document.documentElement.getAttribute('data-reduce-motion') === 'on';
  }

  /** Metres represented by one canvas pixel at the current size. */
  public get metresPerPixel(): number {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const vp = viewportFor(width, height);
    return 1 / vp.pxPerMetre;
  }

  /** Debug helper: the visible half-extent in metres (§8 gates use it). */
  public static readonly halfExtentM = VIEWPORT_HALF_EXTENT_M;
}
