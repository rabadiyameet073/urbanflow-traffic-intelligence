/**
 * Module 40: CSS-Token-Derived Canvas Palette
 * Reads active CSS custom properties dynamically per theme change.
 */

export interface CanvasPalette {
  road: string;
  roadMarking: string;
  stopLine: string;
  text: string;
  go: string;
  caution: string;
  stop: string;
  bike: string;
  car: string;
  bus: string;
  truck: string;
  ambulance: string;
  /** Housing behind a signal head (token: `--color-canvas`). */
  signalPlate: string;
}

export function getCanvasPalette(): CanvasPalette {
  const styles = getComputedStyle(document.documentElement);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const token = (name: string, fallback: string): string =>
    styles.getPropertyValue(name).trim() || fallback;

  // Every fallback below mirrors the matching tokens.css value and is used
  // only if the stylesheet has not loaded; tokens.css stays the single source
  // of truth (Module 40 §1, Rule 19).
  return {
    road: token('--color-road', isLight ? '#E2E7ED' : '#10151C'), // AUDIT-OK(A8): token-mirror fallback
    roadMarking: isLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.25)',
    stopLine: token('--color-text-3', isLight ? '#B0BAC5' : '#455568'), // AUDIT-OK(A8): token-mirror fallback
    text: token('--color-text', '#E8EEF4'), // AUDIT-OK(A8): token-mirror fallback
    go: token('--color-go', '#2FD4A0'), // AUDIT-OK(A8): token-mirror fallback
    caution: token('--color-caution', '#F0E442'), // AUDIT-OK(A8): token-mirror fallback
    stop: token('--color-stop', '#FF8A4C'), // AUDIT-OK(A8): token-mirror fallback
    bike: token('--color-bike', '#E69F00'), // AUDIT-OK(A8): token-mirror fallback
    car: token('--color-car', '#56B4E9'), // AUDIT-OK(A8): token-mirror fallback
    bus: token('--color-bus', '#009E73'), // AUDIT-OK(A8): token-mirror fallback
    truck: token('--color-truck', '#CC79A7'), // AUDIT-OK(A8): token-mirror fallback
    ambulance: token('--color-ambulance', '#FFFFFF'), // AUDIT-OK(A8): token-mirror fallback
    signalPlate: token('--color-canvas', '#0B0F14'), // AUDIT-OK(A8): token-mirror fallback
  };
}
