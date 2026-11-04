/**
 * System Explorer — the dedicated, video-ready "how it works" page (`/system`).
 *
 * Module 30/51 rules apply unchanged: no framework, no `innerHTML`, styling
 * through classes and tokens only, SVG icons, WCAG AA contrast, and full
 * keyboard operation. The page is static-content driven (`system-data.ts`)
 * so a demo can deep-link any section via the URL hash.
 */
import { h, setClass } from '../ui/dom.js';
import {
  ARCH_EDGES,
  ARCH_LAYERS,
  ARCH_NODES,
  COMPONENTS,
  PROJECT_TREE,
  WORKFLOWS,
} from './system-data.js';
import type { ArchNode, ComponentCard, TreeNode, Workflow } from './system-data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Minimal SVG element builder — attributes only, never markup strings. */
function s(
  tag: string,
  attrs: Record<string, string | number> = {},
  children: readonly Element[] = [],
): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

function text(el: Element, value: string): void {
  el.append(document.createTextNode(value));
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Diagram geometry ------------------------------------------------------------

const NODE_W = 236;
const NODE_H = 84;
const COL_GAP = 292;
const ROW_GAP = 168;
const PAD_X = 24;
const PAD_TOP = 46;

function nodeX(n: ArchNode): number {
  return PAD_X + (n.col - 1) * COL_GAP;
}
function nodeY(n: ArchNode): number {
  return PAD_TOP + (n.row - 1) * ROW_GAP;
}

/** Band top for a layer row, shared by the rect and its label. */
function bandY(row: number): number {
  return PAD_TOP + (row - 1) * ROW_GAP;
}

const DIAGRAM_W = PAD_X * 2 + 3 * COL_GAP - (COL_GAP - NODE_W);
const DIAGRAM_H = PAD_TOP + 4 * ROW_GAP - (ROW_GAP - NODE_H) + 28;

/** Anchor between two nodes: same row → sides; different rows → top/bottom. */
function edgePath(from: ArchNode, to: ArchNode): string {
  const fx = nodeX(from) + NODE_W / 2;
  const fy = nodeY(from) + NODE_H / 2;
  const tx = nodeX(to) + NODE_W / 2;
  const ty = nodeY(to) + NODE_H / 2;

  if (from.row === to.row) {
    const x1 = fx < tx ? nodeX(from) + NODE_W : nodeX(from);
    const x2 = fx < tx ? nodeX(to) : nodeX(to) + NODE_W;
    return `M ${x1} ${fy} L ${x2} ${ty}`;
  }
  const down = to.row > from.row;
  const y1 = down ? nodeY(from) + NODE_H : nodeY(from);
  const y2 = down ? nodeY(to) : nodeY(to) + NODE_H;
  const mid = (y1 + y2) / 2;
  return `M ${fx} ${y1} C ${fx} ${mid}, ${tx} ${mid}, ${tx} ${y2}`;
}

// --- Architecture view -------------------------------------------------------------

function buildArchitectView(): HTMLElement {
  const detail = h('div', {
    class: 'sys-detail',
    attrs: { id: 'arch-detail', role: 'status', 'aria-live': 'polite' },
  });

  const renderDetail = (node: ArchNode): void => {
    detail.replaceChildren(
      h('h3', { class: 'sys-detail-title', text: node.title }),
      h('p', { class: 'sys-detail-sub', text: node.subtitle }),
      h('p', { class: 'sys-detail-body', text: node.detail }),
      h(
        'ul',
        { class: 'sys-detail-list' },
        node.bullets.map((b) => h('li', { text: b })),
      ),
    );
  };
  renderDetail(ARCH_NODES[0]!);

  const svg = s('svg', {
    class: 'sys-diagram',
    viewBox: `0 0 ${DIAGRAM_W} ${DIAGRAM_H}`,
    role: 'group',
    'aria-label': 'System architecture diagram: browser, core, edge and data layers',
  });

  // Layer bands and labels.
  const layerKeys = ['browser', 'core', 'edge', 'data'] as const;
  for (let row = 1; row <= 4; row++) {
    const key = layerKeys[row - 1]!;
    svg.append(
      s('rect', {
        class: `sys-band sys-band-${key}`,
        x: 8,
        y: bandY(row) - 14,
        width: DIAGRAM_W - 16,
        height: ROW_GAP - 12,
        rx: 10,
      }),
    );
    const label = s('text', {
      class: 'sys-band-label',
      x: 20,
      y: bandY(row) - 2,
    });
    text(label, ARCH_LAYERS[key]);
    svg.append(label);
  }

  // Edges first (under nodes).
  for (const edge of ARCH_EDGES) {
    const from = ARCH_NODES.find((n) => n.id === edge.from);
    const to = ARCH_NODES.find((n) => n.id === edge.to);
    if (!from || !to) continue;
    const d = edgePath(from, to);
    svg.append(s('path', { class: `sys-edge sys-edge-${edge.kind}`, d }));

    const lx = nodeX(from) + NODE_W / 2 + (nodeX(to) + NODE_W / 2 - nodeX(from) - NODE_W / 2) / 2;
    const ly = nodeY(from) + NODE_H / 2 + (nodeY(to) + NODE_H / 2 - nodeY(from) - NODE_H / 2) / 2;
    const label = s('text', { class: 'sys-edge-label', x: lx, y: ly - 6, 'text-anchor': 'middle' });
    text(label, edge.label);
    svg.append(label);

    if (edge.live && !reducedMotion) {
      const packet = s('circle', { class: 'sys-packet', r: 4 });
      const motion = s('animateMotion', { dur: '3.2s', repeatCount: 'indefinite', path: d });
      packet.append(motion);
      svg.append(packet);
    }
  }

  // Nodes.
  for (const node of ARCH_NODES) {
    const g = s('g', {
      class: 'sys-node',
      tabindex: '0',
      role: 'button',
      'aria-label': `${node.title}: ${node.subtitle}. Show details.`,
      'data-id': node.id,
    }) as SVGGElement;
    g.append(
      s('rect', {
        class: `sys-node-box sys-layer-${node.layer}`,
        x: nodeX(node),
        y: nodeY(node),
        width: NODE_W,
        height: NODE_H,
        rx: 8,
      }),
    );
    const title = s('text', { class: 'sys-node-title', x: nodeX(node) + 14, y: nodeY(node) + 28 });
    text(title, node.title);
    const sub = s('text', { class: 'sys-node-sub', x: nodeX(node) + 14, y: nodeY(node) + 48 });
    text(sub, node.subtitle);
    const layerTag = s('text', { class: 'sys-node-layer', x: nodeX(node) + 14, y: nodeY(node) + 68 });
    text(layerTag, node.layer.toUpperCase());
    g.append(title, sub, layerTag);

    const select = (): void => {
      svg.querySelectorAll('.sys-node').forEach((el) => setClass(el, 'is-selected', el === g));
      renderDetail(node);
    };
    g.addEventListener('click', select);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
    svg.append(g);
  }

  const first = svg.querySelector('.sys-node');
  if (first) setClass(first, 'is-selected', true);

  return h('div', { class: 'sys-two-col' }, [
    h('div', { class: 'sys-diagram-wrap' }, [svg]),
    detail,
  ]);
}

// --- Structure view ----------------------------------------------------------------

function buildTree(node: TreeNode, depth: number): HTMLElement {
  if (!node.children || node.children.length === 0) {
    return h('div', { class: 'sys-leaf' }, [
      h('span', { class: 'mono sys-leaf-name', text: node.name }),
      h('span', { class: 'sys-leaf-desc', text: node.desc }),
    ]);
  }
  return h('details', { class: 'sys-tree', attrs: { open: depth < 1 ? '' : null } }, [
    h('summary', { class: 'sys-tree-summary' }, [
      h('span', { class: 'mono sys-tree-name', text: node.name }),
      h('span', { class: 'sys-tree-desc', text: node.desc }),
    ]),
    h(
      'div',
      { class: 'sys-tree-children' },
      node.children.map((c) => buildTree(c, depth + 1)),
    ),
  ]);
}

function buildStructureView(): HTMLElement {
  return h('section', { class: 'sys-structure', label: 'Project structure' }, [
    h('p', {
      class: 'sys-hint',
      text: 'Expand any directory to see what lives there and why. The dependency rule holds everywhere: core imports nothing but zod, and nothing depends on web.',
    }),
    h(
      'div',
      { class: 'sys-tree-root' },
      PROJECT_TREE.map((n) => buildTree(n, 0)),
    ),
  ]);
}

// --- Components view -----------------------------------------------------------------

function buildComponentsView(): HTMLElement {
  const detail = h('div', {
    class: 'sys-detail',
    attrs: { id: 'component-detail', role: 'status', 'aria-live': 'polite' },
  });
  const cards = new Map<string, HTMLElement>();

  const titleOf = (id: string): string => COMPONENTS.find((c) => c.id === id)?.title ?? id;

  const renderDetail = (card: ComponentCard): void => {
    detail.replaceChildren(
      h('h3', { class: 'sys-detail-title', text: card.title }),
      h('span', { class: 'badge', text: card.pkg }),
      h('p', { class: 'sys-detail-body', text: card.role }),
      h('p', { class: 'sys-rel-label', text: 'Depends on' }),
      h(
        'div',
        { class: 'sys-rel-chips' },
        card.dependsOn.length > 0
          ? card.dependsOn.map((d) => h('span', { class: 'sys-rel-chip', text: titleOf(d) }))
          : [h('span', { class: 'sys-rel-none', text: 'nothing in this graph' })],
      ),
      h('p', { class: 'sys-rel-label', text: 'Used by' }),
      h(
        'div',
        { class: 'sys-rel-chips' },
        card.usedBy.length > 0
          ? card.usedBy.map((u) => h('span', { class: 'sys-rel-chip', text: titleOf(u) }))
          : [h('span', { class: 'sys-rel-none', text: 'top of the graph — a leaf consumer' })],
      ),
    );
  };

  const select = (card: ComponentCard): void => {
    const related = new Set([...card.dependsOn, ...card.usedBy]);
    for (const [id, el] of cards) {
      setClass(el, 'is-selected', id === card.id);
      setClass(el, 'is-related', related.has(id));
      setClass(el, 'is-dim', !related.has(id) && id !== card.id);
    }
    renderDetail(card);
  };

  const grid = h('div', { class: 'sys-comp-grid' });
  for (const card of COMPONENTS) {
    const el = h(
      'button',
      {
        class: `sys-comp sys-comp-${card.pkg}`,
        attrs: { type: 'button', 'data-id': card.id },
        on: { click: () => select(card) },
      },
      [
        h('span', { class: 'sys-comp-title', text: card.title }),
        h('span', { class: 'sys-comp-pkg', text: card.pkg }),
        h('span', { class: 'sys-comp-role', text: card.role }),
      ],
    );
    cards.set(card.id, el);
    grid.append(el);
  }

  select(COMPONENTS[0]!);

  return h('div', { class: 'sys-two-col sys-two-col-wide-left' }, [
    h('div', { class: 'sys-comp-scroll' }, [grid]),
    detail,
  ]);
}

// --- Workflows view ------------------------------------------------------------------

function buildWorkflowView(workflow: Workflow, onSwitch: (id: string) => void): HTMLElement {
  let index = 0;
  let timer: number | null = null;

  const titleEl = h('h3', { class: 'sys-wf-step-title' });
  const bodyEl = h('p', { class: 'sys-wf-step-body' });
  const dotsEl = h('div', { class: 'sys-wf-dots', attrs: { role: 'list' } });
  const barEl = h('div', { class: 'sys-wf-progress', attrs: { role: 'progressbar', 'aria-label': 'Workflow step' } });
  const fillEl = h('div', { class: 'sys-wf-progress-fill' });
  barEl.append(fillEl);

  const playBtn = h(
    'button',
    {
      class: 'btn btn-primary',
      attrs: { type: 'button' },
      on: { click: () => togglePlay() },
    },
    [h('span', { text: 'Play' })],
  );
  const prevBtn = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { type: 'button', 'aria-label': 'Previous step' },
      on: { click: () => go(index - 1) },
    },
    ['Prev'],
  );
  const nextBtn = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { type: 'button', 'aria-label': 'Next step' },
      on: { click: () => go(index + 1) },
    },
    ['Next'],
  );

  const render = (): void => {
    const step = workflow.steps[index]!;
    titleEl.textContent = `${index + 1}. ${step.title}`;
    bodyEl.textContent = step.text;
    fillEl.style.setProperty('--sys-wf-progress', `${((index + 1) / workflow.steps.length) * 100}%`);
    barEl.setAttribute('aria-valuenow', String(index + 1));
    barEl.setAttribute('aria-valuemin', '1');
    barEl.setAttribute('aria-valuemax', String(workflow.steps.length));
    dotsEl.replaceChildren(
      ...workflow.steps.map((stepDef, i) =>
        h('span', {
          class: `sys-wf-dot${i === index ? ' is-active' : ''}`,
          attrs: { role: 'listitem', 'aria-label': `Step ${i + 1}: ${stepDef.title}` },
        }),
      ),
    );
  };

  const go = (i: number): void => {
    index = Math.max(0, Math.min(workflow.steps.length - 1, i));
    render();
  };

  const stop = (): void => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    playBtn.replaceChildren(h('span', { text: 'Play' }));
  };

  const togglePlay = (): void => {
    if (timer !== null) {
      stop();
      return;
    }
    if (index >= workflow.steps.length - 1) go(0);
    playBtn.replaceChildren(h('span', { text: 'Pause' }));
    timer = window.setInterval(() => {
      if (index >= workflow.steps.length - 1) stop();
      else go(index + 1);
    }, 4200);
  };

  render();

  const picker = h(
    'div',
    { class: 'sys-wf-tabs', attrs: { role: 'tablist', 'aria-label': 'Workflows' } },
    WORKFLOWS.map((w) =>
      h('button', {
        class: `sys-wf-tab${w.id === workflow.id ? ' is-active' : ''}`,
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(w.id === workflow.id) },
        on: { click: () => onSwitch(w.id) },
        text: w.title,
      }),
    ),
  );

  return h('div', { class: 'sys-wf' }, [
    picker,
    h('p', { class: 'sys-wf-summary', text: workflow.summary }),
    h('div', { class: 'sys-wf-stage' }, [titleEl, bodyEl]),
    barEl,
    dotsEl,
    h('div', { class: 'sys-wf-controls' }, [prevBtn, playBtn, nextBtn]),
  ]);
}

// --- Page shell ----------------------------------------------------------------------

interface Section {
  id: string;
  label: string;
  build: () => HTMLElement;
}

function buildPage(): void {
  const root = document.getElementById('system-app');
  if (!root) return;

  const sections: readonly Section[] = [
    { id: 'architecture', label: 'Architecture & data flow', build: buildArchitectView },
    { id: 'structure', label: 'Project structure', build: buildStructureView },
    { id: 'components', label: 'Components & relationships', build: buildComponentsView },
    { id: 'workflows', label: 'Workflows', build: () => buildWorkflows() },
  ];

  const panels = new Map<string, HTMLElement>();
  const tabs = sections.map((sec) => {
    const panel = h('section', { class: 'sys-panel', attrs: { id: `panel-${sec.id}`, role: 'tabpanel' } });
    panels.set(sec.id, panel);
    return h('button', {
      class: 'sys-tab',
      attrs: {
        type: 'button',
        role: 'tab',
        id: `tab-${sec.id}`,
        'aria-controls': `panel-${sec.id}`,
        'aria-selected': 'false',
      },
      on: { click: () => activate(sec.id) },
      text: sec.label,
    });
  });

  let current = '';
  const built = new Set<string>();

  function activate(id: string): void {
    const sec = sections.find((x) => x.id === id) ?? sections[0]!;
    current = sec.id;
    const panel = panels.get(sec.id)!;
    if (!built.has(sec.id)) {
      panel.replaceChildren(sec.build());
      built.add(sec.id);
    }
    panels.forEach((el, pid) => setClass(el, 'is-active', pid === current));
    for (const tab of tabs) {
      const on = tab.id === `tab-${sec.id}`;
      setClass(tab, 'is-active', on);
      tab.setAttribute('aria-selected', String(on));
    }
    history.replaceState(null, '', `#${sec.id}`);
  }

  function buildWorkflows(): HTMLElement {
    let activeId = WORKFLOWS[0]!.id;
    const holder = h('div', { class: 'sys-wf-holder' });
    const render = (): void => {
      const wf = WORKFLOWS.find((w) => w.id === activeId) ?? WORKFLOWS[0]!;
      holder.replaceChildren(
        buildWorkflowView(wf, (id) => {
          activeId = id;
          render();
        }),
      );
    };
    render();
    return holder;
  }

  const header = h('header', { class: 'sys-header' }, [
    h('div', { class: 'sys-brand' }, [
      h('span', { class: 'badge badge-mode', text: 'SIMULATION-ONLY PROTOTYPE' }),
      h('h1', { class: 'sys-title', text: 'UrbanFlow AI — System Explorer' }),
      h('p', {
        class: 'sys-tagline',
        text: 'Frontend to backend, tick to terabyte: how the platform is built and why it is trustworthy.',
      }),
    ]),
    h('a', {
      class: 'btn btn-secondary',
      attrs: { href: '/', id: 'sys-back-link' },
      text: 'Open live simulation',
    }),
  ]);

  const nav = h('nav', { class: 'sys-tabs', attrs: { role: 'tablist', 'aria-label': 'System explorer sections' } }, tabs);
  const main = h('main', { class: 'sys-main', attrs: { id: 'main' } }, [...panels.values()]);
  const footer = h('footer', { class: 'sys-footer' }, [
    h('span', { class: 'mono', text: 'packages/web · system.html — deterministic content, vanilla TS, no framework' }),
    h('span', { text: 'Every number shown in the live app is measured; every claim here is transcribed from the repository.' }),
  ]);

  root.append(header, nav, main, footer);

  const fromHash = window.location.hash.replace('#', '');
  activate(sections.some((x) => x.id === fromHash) ? fromHash : 'architecture');
}

buildPage();
