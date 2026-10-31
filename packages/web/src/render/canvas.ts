/**
 * Module 40 & Module 31: 60 FPS Canvas Twin Renderer
 * Draws intersection geometry, signal indications with redundant glyphs,
 * and vehicles styled with Okabe-Ito colors and distinct shapes.
 */
import {
  SimEngine,
  SignalState,
  LANES,
  LaneId,
  VEHICLE_SPECS,
} from '@urbanflow/core';
import { getCanvasPalette } from './palette.js';

export class TwinCanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  public render(sim: SimEngine, signal: SignalState): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const palette = getCanvasPalette();

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const roadWidth = Math.min(width, height) * 0.28;
    const laneWidth = roadWidth / 4;

    // 1. Draw Asphalt Roads
    ctx.fillStyle = palette.road;
    // Vertical road (North-South)
    ctx.fillRect(cx - roadWidth / 2, 0, roadWidth, height);
    // Horizontal road (East-West)
    ctx.fillRect(0, cy - roadWidth / 2, width, roadWidth);

    // 2. Draw Lane Markings & Stop Lines
    ctx.strokeStyle = palette.roadMarking;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);

    // Center divider lines
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - roadWidth / 2);
    ctx.moveTo(cx, cy + roadWidth / 2); ctx.lineTo(cx, height);
    ctx.moveTo(0, cy); ctx.lineTo(cx - roadWidth / 2, cy);
    ctx.moveTo(cx + roadWidth / 2, cy); ctx.lineTo(width, cy);
    ctx.stroke();

    // Solid stop lines
    ctx.setLineDash([]);
    ctx.strokeStyle = palette.stopLine;
    ctx.lineWidth = 3;
    ctx.beginPath();
    // North stop line (SB approach)
    ctx.moveTo(cx - roadWidth / 2, cy - roadWidth / 2); ctx.lineTo(cx, cy - roadWidth / 2);
    // South stop line (NB approach)
    ctx.moveTo(cx, cy + roadWidth / 2); ctx.lineTo(cx + roadWidth / 2, cy + roadWidth / 2);
    // West stop line (EB approach)
    ctx.moveTo(cx - roadWidth / 2, cy); ctx.lineTo(cx - roadWidth / 2, cy + roadWidth / 2);
    // East stop line (WB approach)
    ctx.moveTo(cx + roadWidth / 2, cy - roadWidth / 2); ctx.lineTo(cx + roadWidth / 2, cy);
    ctx.stroke();

    // 3. Draw Signal Heads with Redundant Glyphs (● GO, ▲ CLEAR, ■ STOP)
    const drawSignalHead = (x: number, y: number, ind: 'G' | 'Y' | 'R', label: string) => {
      ctx.save();
      const color = ind === 'G' ? palette.go : ind === 'Y' ? palette.caution : palette.stop;
      const glyph = ind === 'G' ? '●' : ind === 'Y' ? '▲' : '■';

      ctx.fillStyle = '#070A0E';
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
      ctx.restore();
    };

    // Signal Heads positions
    drawSignalHead(cx + laneWidth, cy + roadWidth / 2 + 16, signal.lanes['NB-TR'] ?? 'R', 'NB-TR');
    drawSignalHead(cx - laneWidth, cy - roadWidth / 2 - 16, signal.lanes['SB-TR'] ?? 'R', 'SB-TR');
    drawSignalHead(cx - roadWidth / 2 - 16, cy + laneWidth, signal.lanes['EB-TR'] ?? 'R', 'EB-TR');
    drawSignalHead(cx + roadWidth / 2 + 16, cy - laneWidth, signal.lanes['WB-TR'] ?? 'R', 'WB-TR');

    // 4. Draw Vehicles on Each Lane
    const scalePxPerMeter = (roadWidth / 2) / 25.0; // 25 meters mapped to half-road offset

    for (let l = 0; l < LANES.length; l++) {
      const laneId = LANES[l]!;
      const lane = sim.lanes[laneId]!;

      for (let i = 0; i < lane.count; i++) {
        const slot = lane.order[i] as number;
        const distFromStopM = lane.pos[slot] as number;
        const typ = lane.getVehicleType(slot);
        const spec = VEHICLE_SPECS[typ];
        const isEms = typ === 'AMBULANCE';

        // Choose color
        let fill = palette.car;
        if (typ === 'BIKE') fill = palette.bike;
        else if (typ === 'BUS') fill = palette.bus;
        else if (typ === 'TRUCK') fill = palette.truck;
        else if (isEms) fill = palette.ambulance;

        // Position coordinates based on approach lane
        let vx = cx;
        let vy = cy;
        let vWidth = 8;
        let vHeight = Math.max(12, spec.lengthM * scalePxPerMeter);

        if (laneId.startsWith('NB')) {
          // Approaching from bottom moving up
          const offsetLane = laneId.endsWith('-L') ? laneWidth / 2 : laneWidth * 1.5;
          vx = cx + offsetLane;
          vy = cy + roadWidth / 2 + distFromStopM * scalePxPerMeter;
        } else if (laneId.startsWith('SB')) {
          // Approaching from top moving down
          const offsetLane = laneId.endsWith('-L') ? laneWidth / 2 : laneWidth * 1.5;
          vx = cx - offsetLane;
          vy = cy - roadWidth / 2 - distFromStopM * scalePxPerMeter;
        } else if (laneId.startsWith('EB')) {
          // Approaching from left moving right
          const offsetLane = laneId.endsWith('-L') ? laneWidth / 2 : laneWidth * 1.5;
          vx = cx - roadWidth / 2 - distFromStopM * scalePxPerMeter;
          vy = cy + offsetLane;
          // Transpose dimensions for horizontal lanes
          const temp = vWidth; vWidth = vHeight; vHeight = temp;
        } else if (laneId.startsWith('WB')) {
          // Approaching from right moving left
          const offsetLane = laneId.endsWith('-L') ? laneWidth / 2 : laneWidth * 1.5;
          vx = cx + roadWidth / 2 + distFromStopM * scalePxPerMeter;
          vy = cy - offsetLane;
          const temp = vWidth; vWidth = vHeight; vHeight = temp;
        }

        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(vx - vWidth / 2, vy - vHeight / 2, vWidth, vHeight, 2);
        ctx.fill();

        // Ambulance Light Bar (<= 2 Hz pulse)
        if (isEms) {
          ctx.fillStyle = (Math.floor(Date.now() / 350) % 2 === 0) ? '#FF4444' : '#00A2FF';
          ctx.beginPath();
          ctx.arc(vx, vy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}
