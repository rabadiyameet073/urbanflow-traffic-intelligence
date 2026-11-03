/**
 * Module 31 §3.1: pure world ↔ canvas coordinate mapping.
 *
 * The simulation works in world metres with the intersection centre at the
 * origin and +y pointing north. The renderer works in canvas pixels with +y
 * pointing down. Both conversions live here, are total, and are round-trip
 * exact, so the renderer never carries its own private copy of the mapping —
 * a duplicated mapping is how vehicle glyphs drift off their lanes.
 *
 * Right-hand traffic (ADR 0020): on a northbound approach the through lane sits
 * at a *positive* x offset from the centreline, which is the driver's right.
 */
import { LANES, LaneId } from '../contracts.js';

/** One lane's width in metres; two lanes per approach ⇒ 7 m kerb to kerb. */
export const LANE_WIDTH_M = 3.5;

export interface LaneAnchor {
  /** Stop-line point of this lane, in world metres. */
  x: number;
  y: number;
  /** Unit heading of travel, in world metres. */
  dx: number;
  dy: number;
}

function buildAnchors(): Record<LaneId, LaneAnchor> {
  const out = {} as Record<LaneId, LaneAnchor>;
  for (const lane of LANES) {
    const approach = lane.slice(0, 2);
    // Through lanes hug the centreline; left-turn lanes sit outboard of them.
    const lateral = LANE_WIDTH_M * (lane.endsWith('-L') ? 1.5 : 0.5);
    if (approach === 'NB') {
      out[lane] = { x: lateral, y: 0, dx: 0, dy: 1 };
    } else if (approach === 'SB') {
      out[lane] = { x: -lateral, y: 0, dx: 0, dy: -1 };
    } else if (approach === 'EB') {
      out[lane] = { x: 0, y: -lateral, dx: 1, dy: 0 };
    } else {
      out[lane] = { x: 0, y: lateral, dx: -1, dy: 0 };
    }
  }
  return out;
}

const ANCHORS = buildAnchors();

export function laneAnchor(lane: LaneId): LaneAnchor {
  return ANCHORS[lane];
}

/**
 * Quadrant heading for an axis-aligned anchor, in radians measured from +x.
 *
 * Rule 07 §3 forbids `Math.atan2` on sim paths — libm results can differ in
 * the last bit between engines — and every anchor heading here is axis-aligned
 * by construction (`buildAnchors`), so the four cases are exact constants.
 */
function axisHeadingRad(dx: number, dy: number): number {
  if (dx === 1) return 0;
  if (dx === -1) return Math.PI;
  return dy === 1 ? Math.PI / 2 : -Math.PI / 2;
}

/** Heading of travel for a lane, in radians, measured from +x. */
export function laneHeadingRad(lane: LaneId): number {
  const a = ANCHORS[lane];
  return axisHeadingRad(a.dx, a.dy);
}

/**
 * World position of a vehicle `distanceFromStopM` upstream of its stop line.
 *
 * `pos` in the simulator grows *upstream*, so the offset direction is the
 * negative of the lane's heading. Lane tracking is exact: a vehicle never
 * changes lane, so its lateral component is constant.
 */
export function vehicleWorld(
  lane: LaneId,
  distanceFromStopM: number,
): { x: number; y: number; headingRad: number } {
  const a = ANCHORS[lane];
  return {
    x: a.x - a.dx * distanceFromStopM,
    y: a.y - a.dy * distanceFromStopM,
    headingRad: axisHeadingRad(a.dx, a.dy),
  };
}

export interface Viewport {
  widthPx: number;
  heightPx: number;
  /** Canvas pixels per world metre. */
  pxPerMetre: number;
  centerXPx: number;
  centerYPx: number;
}

/**
 * Metres of world visible on each side of the centre at the current size.
 *
 * 60 m shows roughly a 15-vehicle queue per lane at the densities the scenarios
 * use, while keeping a 4.5 m car large enough to read as a car rather than a
 * dot. Vehicles beyond it are culled, not shrunk (§3 "Culling").
 */
export const VIEWPORT_HALF_EXTENT_M = 60;

/**
 * Derive a viewport from the canvas backing-store size.
 *
 * `pxPerMetre` is fixed by the shorter axis so that a square junction stays
 * square on a non-square canvas, and ±25 m of approach is always visible.
 */
export function viewportFor(widthPx: number, heightPx: number): Viewport {
  const shortest = Math.min(widthPx, heightPx);
  return {
    widthPx,
    heightPx,
    pxPerMetre: shortest / 2 / VIEWPORT_HALF_EXTENT_M,
    centerXPx: widthPx / 2,
    centerYPx: heightPx / 2,
  };
}

/** World metres → canvas pixels. Exact inverse of `canvasToWorld`. */
export function worldToCanvas(
  x: number,
  y: number,
  viewport: Viewport,
): { px: number; py: number } {
  return {
    px: viewport.centerXPx + x * viewport.pxPerMetre,
    py: viewport.centerYPx - y * viewport.pxPerMetre,
  };
}

/** Canvas pixels → world metres. Exact inverse of `worldToCanvas`. */
export function canvasToWorld(
  px: number,
  py: number,
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: (px - viewport.centerXPx) / viewport.pxPerMetre,
    y: (viewport.centerYPx - py) / viewport.pxPerMetre,
  };
}

export type Polygon = ReadonlyArray<readonly [number, number]>;

/**
 * Even-odd point-in-polygon test (Module 31 §3, lane hit testing).
 *
 * Pure and allocation-free so it can run on every canvas click, and unit-tested
 * against the boundary and the wrap-around edge case.
 */
export function pointInPolygon(px: number, py: number, polygon: Polygon): boolean {
  let inside = false;
  const n = polygon.length;
  if (n < 3) return false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i] as readonly [number, number];
    const pj = polygon[j] as readonly [number, number];
    // Strict comparison pair keeps a point on a horizontal edge out of the
    // result exactly once, so adjacent lane polygons never both claim it.
    const straddles = pi[1] > py !== pj[1] > py;
    if (!straddles) continue;
    const xCross = ((pj[0] - pi[0]) * (py - pi[1])) / (pj[1] - pi[1]) + pi[0];
    if (px < xCross) inside = !inside;
  }
  return inside;
}

/** The approach a canvas click landed in, or `null` outside every lane. */
export function laneAtWorldPoint(
  x: number,
  y: number,
  laneLengthM: number,
): LaneId | null {
  for (const lane of LANES) {
    const a = ANCHORS[lane];
    // Project the point onto the lane's own axes: `along` is metres upstream of
    // the stop line, `across` is metres off the lane centreline.
    const along = -(x - a.x) * a.dx - (y - a.y) * a.dy;
    const across = -(x - a.x) * a.dy + (y - a.y) * a.dx;
    if (along >= 0 && along <= laneLengthM && Math.abs(across) <= LANE_WIDTH_M / 2) {
      return lane;
    }
  }
  return null;
}
