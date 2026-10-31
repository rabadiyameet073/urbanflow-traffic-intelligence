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
}

export function getCanvasPalette(): CanvasPalette {
  const styles = getComputedStyle(document.documentElement);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  return {
    road: isLight ? '#E2E7ED' : '#10151C',
    roadMarking: isLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.25)',
    stopLine: isLight ? '#B0BAC5' : '#455568',
    text: styles.getPropertyValue('--color-text').trim() || '#E8EEF4',
    go: styles.getPropertyValue('--color-go').trim() || '#2FD4A0',
    caution: styles.getPropertyValue('--color-caution').trim() || '#F0E442',
    stop: styles.getPropertyValue('--color-stop').trim() || '#FF8A4C',
    bike: '#E69F00',
    car: '#56B4E9',
    bus: '#009E73',
    truck: '#CC79A7',
    ambulance: '#FFFFFF',
  };
}
