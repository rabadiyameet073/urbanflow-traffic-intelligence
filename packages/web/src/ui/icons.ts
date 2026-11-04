/**
 * Module 40 / Module 51: inline SVG icon set (replaces every pictographic
 * emoji in the interface).
 *
 * Style: single 24×24 viewBox, 1.75 stroke, `currentColor`, round joins — a
 * consistent line family (the same grammar the Koboyo icon set the brief points
 * at uses: one grid, one stroke weight, no fills for decorative colour). Icons
 * are built with `document.createElementNS`, never parsed from a string, so the
 * A9 "no innerHTML" rule that `ui/dom.ts` exists to protect stays clean.
 *
 * Every icon is decorative by default (`aria-hidden`, `focusable=false`): the
 * accessible name always comes from the accompanying text or an `aria-label`,
 * never from the glyph — so state is never conveyed by the icon alone
 * (Modules 40 §2.4 / 41 §1.5 redundant-encoding rule is preserved by the label).
 */

const NS = 'http://www.w3.org/2000/svg';

interface IconPath {
  /** SVG path `d`. */
  d: string;
  /** When true the subpath is filled with `currentColor` instead of stroked. */
  filled?: boolean;
}

function render(paths: readonly IconPath[], label?: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', label ? 'false' : 'true');
  svg.setAttribute('focusable', 'false');
  if (label) svg.setAttribute('role', 'img');
  if (label) svg.setAttribute('aria-label', label);

  for (const { d, filled } of paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', filled ? 'currentColor' : 'none');
    if (!filled) {
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.75');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
    }
    svg.append(p);
  }
  return svg;
}

export const ICONS = {
  /** Koboyo-style Traffic Intelligence Radar Beacon Logo (Matches UrbanFlow AI brand identity). */
  logo: (): SVGSVGElement =>
    render([
      // Outer concentric radar telemetry ring
      { d: 'M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9z' },
      // Inner dynamic radar pulse sweep arc
      { d: 'M12 6.5a5.5 5.5 0 1 1-4.8 8.1' },
      // Luminous core emitter node
      { d: 'M12 10.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5z', filled: true },
    ], 'UrbanFlow AI Logo'),
  /** Solid triangle — "resume / run". */
  play: (): SVGSVGElement => render([{ d: 'M8 5v14l11-7z', filled: true }]),
  /** Two bars — "pause". */
  pause: (): SVGSVGElement =>
    render([{ d: 'M7 5v14' }, { d: 'M17 5v14' }]),
  /** Medical cross in a rounded body — "emergency / ambulance". */
  ambulance: (): SVGSVGElement =>
    render([
      { d: 'M12 6v12' },
      { d: 'M6 12h12' },
    ]),
  /** Half-filled disc — theme / appearance. */
  theme: (): SVGSVGElement =>
    render([
      { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
      { d: 'M12 3v18a9 9 0 0 0 0-18z', filled: true },
    ]),
  /** Keyboard — shortcut help. */
  keyboard: (): SVGSVGElement =>
    render([
      { d: 'M3 8h18v8H3z' },
      { d: 'M7 12h.01' },
      { d: 'M11 12h.01' },
      { d: 'M15 12h.01' },
      { d: 'M8 16h8' },
    ]),
  /** Eight-point asterisk — the reduce-motion control. */
  motion: (): SVGSVGElement =>
    render([
      { d: 'M12 4v16' },
      { d: 'M4 12h16' },
      { d: 'M6.5 6.5l11 11' },
      { d: 'M17.5 6.5l-11 11' },
    ]),
  /** Checkmark — confirm / compliant. */
  check: (): SVGSVGElement => render([{ d: 'M20 6 9 17l-5-5' }]),
  /** Cross — reject / mismatch. */
  close: (): SVGSVGElement =>
    render([{ d: 'M18 6 6 18' }, { d: 'M6 6l12 12' }]),
  /** Triangle with an exclamation — warning. */
  warning: (): SVGSVGElement =>
    render([
      { d: 'M12 4 22 20H2z' },
      { d: 'M12 10v4' },
      { d: 'M12 17h.01' },
    ]),
  /** Down arrow — "lower is better" positive delta. */
  arrowDown: (): SVGSVGElement =>
    render([{ d: 'M12 5v14' }, { d: 'M6 13l6 6 6-6' }]),
  /** Up arrow — negative delta. */
  arrowUp: (): SVGSVGElement =>
    render([{ d: 'M12 19V5' }, { d: 'M6 11l6-6 6 6' }]),
  /** Equals — parity / no significant difference. */
  parity: (): SVGSVGElement =>
    render([{ d: 'M6 9h12' }, { d: 'M6 15h12' }]),
  /** Filled dot — "GO / green" indicator (also the safety-clear marker). */
  dot: (): SVGSVGElement =>
    render([{ d: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z', filled: true }]),
  /** Small circle outline — pending / idle indicator. */
  circle: (): SVGSVGElement =>
    render([{ d: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z' }]),
  /** Sound On speaker with acoustic waves. */
  soundOn: (): SVGSVGElement =>
    render([
      { d: 'M11 5L6 9H2v6h4l5 4V5z' },
      { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' },
      { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' },
    ]),
  /** Sound Off muted speaker. */
  soundOff: (): SVGSVGElement =>
    render([
      { d: 'M11 5L6 9H2v6h4l5 4V5z' },
      { d: 'M23 9l-6 6' },
      { d: 'M17 9l6 6' },
    ]),
  /** Sparkle / AI intelligence. */
  sparkle: (): SVGSVGElement =>
    render([
      { d: 'M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z' },
    ]),
  /** Lightning bolt — stress / instant action. */
  zap: (): SVGSVGElement =>
    render([
      { d: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
    ]),
  /** Database disk stack — persistence / MongoDB. */
  database: (): SVGSVGElement =>
    render([
      { d: 'M12 3c-4.97 0-9 1.34-9 3v12c0 1.66 4.03 3 9 3s9-1.34 9-3V6c0-1.66-4.03-3-9-3z' },
      { d: 'M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3' },
      { d: 'M3 6c0 1.66 4.03 3 9 3s9-1.34 9-3' },
    ]),
  /** Circular arrow — refresh / re-sync. */
  refresh: (): SVGSVGElement =>
    render([
      { d: 'M20 11a8 8 0 1 0-2.3 6.3' },
      { d: 'M20 4v7h-7' },
    ]),
  /** Down-arrow into a tray — save / persist. */
  save: (): SVGSVGElement =>
    render([
      { d: 'M12 4v9' },
      { d: 'M8 10l4 4 4-4' },
      { d: 'M5 19h14' },
    ]),
  /** Steering-wheel gauge — speed / kinematics. */
  gauge: (): SVGSVGElement =>
    render([
      { d: 'M12 13l4-4' },
      { d: 'M4 18a9 9 0 1 1 16 0' },
    ]),
  /** Koboyo sun — light theme. */
  sun: (): SVGSVGElement =>
    render([
      { d: 'M12 2v2' },
      { d: 'M12 20v2' },
      { d: 'M2 12h2' },
      { d: 'M20 12h2' },
      { d: 'm4.93 4.93 1.41 1.41' },
      { d: 'm17.66 17.66 1.41 1.41' },
      { d: 'm4.93 19.07 1.41-1.41' },
      { d: 'm17.66 6.34 1.41-1.41' },
      { d: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z' },
    ]),
  /** Koboyo moon — dark theme. */
  moon: (): SVGSVGElement =>
    render([{ d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z' }]),
  /** Koboyo clock/timer — phase time. */
  timer: (): SVGSVGElement =>
    render([
      { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
      { d: 'M12 6v6l4 2' },
    ]),
  /** Koboyo cloud / edge gateway. */
  cloud: (): SVGSVGElement =>
    render([{ d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' }]),
  /** Koboyo security shield check — HMAC authentication. */
  shieldCheck: (): SVGSVGElement =>
    render([
      { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
      { d: 'm9 12 2 2 4-4' },
    ]),
  /** Koboyo AI bot / copilot. */
  bot: (): SVGSVGElement =>
    render([
      { d: 'M12 8V4' },
      { d: 'M9 2h6' },
      { d: 'M4 8h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z' },
      { d: 'M9 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', filled: true },
      { d: 'M15 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', filled: true },
      { d: 'M8 17h8' },
    ]),
  /** Koboyo terminal / console. */
  terminal: (): SVGSVGElement =>
    render([
      { d: 'm4 17 6-6-6-6' },
      { d: 'M12 19h8' },
    ]),
  /** Koboyo arrow up-down — bidirectional corridor / arterial. */
  arrowUpDown: (): SVGSVGElement =>
    render([
      { d: 'm7 15 5 5 5-5' },
      { d: 'm7 9 5-5 5 5' },
    ]),
  /** Koboyo arrow left-right — cross street. */
  arrowLeftRight: (): SVGSVGElement =>
    render([
      { d: 'm15 7 5 5-5 5' },
      { d: 'm9 7-5 5 5 5' },
    ]),
  /** Koboyo external link / popout. */
  externalLink: (): SVGSVGElement =>
    render([
      { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' },
      { d: 'M15 3h6v6' },
      { d: 'm10 14 11-11' },
    ]),
  /** Koboyo flask / traffic lab experiments. */
  flask: (): SVGSVGElement =>
    render([
      { d: 'M9 3h6' },
      { d: 'M10 3v6l-4 7a2 2 0 0 0 1.7 3h8.6a2 2 0 0 0 1.7-3l-4-7V3' },
      { d: 'M8.5 15h7' },
    ]),
  /** Koboyo presentation / easel display. */
  presentation: (): SVGSVGElement =>
    render([
      { d: 'M2 3h20' },
      { d: 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3' },
      { d: 'm7 21 5-5 5 5' },
    ]),
  /** Koboyo layers / architectural hierarchy. */
  layers: (): SVGSVGElement =>
    render([
      { d: 'm12 2 10 5-10 5-10-5 10-5z' },
      { d: 'm2 17 10 5 10-5' },
      { d: 'm2 12 10 5 10-5' },
    ]),
  /** Koboyo 2x2 grid / component matrix. */
  grid: (): SVGSVGElement =>
    render([
      { d: 'M3 3h7v7H3z' },
      { d: 'M14 3h7v7h-7z' },
      { d: 'M14 14h7v7h-7z' },
      { d: 'M3 14h7v7H3z' },
    ]),
  /** Koboyo droplet / fuel consumption. */
  droplet: (): SVGSVGElement =>
    render([
      { d: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z' },
    ]),
  /** Koboyo leaf / eco / CO2 prevention. */
  leaf: (): SVGSVGElement =>
    render([
      { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z' },
      { d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' },
    ]),
} as const;

/** Convenience: wrap an icon builder with an accessible label. */
export function labeledIcon(
  build: () => SVGSVGElement,
  label: string,
): SVGSVGElement {
  const svg = build();
  svg.setAttribute('aria-hidden', 'false');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  return svg;
}
