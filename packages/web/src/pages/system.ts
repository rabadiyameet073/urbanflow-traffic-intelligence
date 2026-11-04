/**
 * System Explorer — the dedicated, video-ready "how it works" page (`/system`).
 *
 * Module 30/51 rules apply unchanged: vanilla TypeScript, no framework, no `innerHTML`,
 * styling through CSS tokens only, flat matte SVG icons, WCAG AA contrast, and full
 * keyboard accessibility. Deep-links any section via URL hash.
 */
import { h, setClass } from '../ui/dom.js';
import {
  ABOUT_ACHIEVEMENTS,
  ABOUT_BLOCKS,
  ABOUT_INNOVATIONS,
  ARCH_EDGES,
  ARCH_LAYERS,
  ARCH_NODES,
  COMPONENTS,
  FLOW_PRESETS,
  PROJECT_TREE,
  RUBRIC,
  THEME_FIT,
  WORKFLOWS,
} from './system-data.js';
import type {
  ArchNode,
  ArchEdge,
  ComponentCard,
  FlowPreset,
  TreeNode,
  Workflow,
  WorkflowStep,
} from './system-data.js';
export { buildLiveView } from './system-live.js';
import { buildLiveView } from './system-live.js';

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

function bandY(row: number): number {
  return PAD_TOP + (row - 1) * ROW_GAP;
}

const DIAGRAM_W = PAD_X * 2 + 3 * COL_GAP - (COL_GAP - NODE_W);
const DIAGRAM_H = PAD_TOP + 4 * ROW_GAP - (ROW_GAP - NODE_H) + 28;

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

// --- Architecture View with Flow Presets & Step Breakdown -----------------------

export function buildArchitectView(): HTMLElement {
  let activeFlowId = 'full';
  let activePreset = FLOW_PRESETS.find((f) => f.id === activeFlowId) ?? FLOW_PRESETS[0]!;

  const detail = h('div', {
    class: 'sys-detail',
    attrs: { id: 'arch-detail', role: 'status', 'aria-live': 'polite' },
  });

  const flowBanner = h('div', { class: 'sys-flow-banner', text: activePreset.description });
  const flowStepsHolder = h('div', { class: 'sys-flow-steps-wrap' });

  const renderDetail = (node: ArchNode): void => {
    const inbound = ARCH_EDGES.filter((e) => e.to === node.id);
    const outbound = ARCH_EDGES.filter((e) => e.from === node.id);

    detail.replaceChildren(
      h('h3', { class: 'sys-detail-title', text: node.title }),
      h('p', { class: 'sys-detail-sub', text: node.subtitle }),
      h('p', { class: 'sys-detail-body', text: node.detail }),
      h(
        'ul',
        { class: 'sys-detail-list' },
        node.bullets.map((b) => h('li', { text: b })),
      ),
      h('p', { class: 'sys-rel-label', text: 'Inbound Data Flows' }),
      h(
        'div',
        { class: 'sys-rel-chips' },
        inbound.length > 0
          ? inbound.map((e) => h('span', { class: 'sys-rel-chip', text: `← ${e.label} (from ${e.from})` }))
          : [h('span', { class: 'sys-rel-none', text: 'Ingress root' })],
      ),
      h('p', { class: 'sys-rel-label', text: 'Outbound Data Flows' }),
      h(
        'div',
        { class: 'sys-rel-chips' },
        outbound.length > 0
          ? outbound.map((e) => h('span', { class: 'sys-rel-chip', text: `→ ${e.label} (to ${e.to})` }))
          : [h('span', { class: 'sys-rel-none', text: 'Terminal sink' })],
      ),
    );
  };

  const renderFlowSteps = (preset: FlowPreset): void => {
    flowStepsHolder.replaceChildren(
      h('h4', { class: 'sys-flow-steps-head', text: `Active Flow Steps: ${preset.title}` }),
      h(
        'div',
        { class: 'sys-flow-steps-grid' },
        preset.steps.map((st) =>
          h('div', { class: 'sys-flow-step-card' }, [
            h('div', { class: 'sys-flow-step-top' }, [
              h('span', { class: 'sys-flow-step-num', text: `Step ${st.step}` }),
              h('span', { class: 'sys-flow-step-proto', text: st.protocol }),
            ]),
            h('h5', { class: 'sys-flow-step-title', text: st.title }),
            h('p', { class: 'sys-flow-step-detail', text: st.detail }),
          ]),
        ),
      ),
    );
  };

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

  const edgeElements: { edge: ArchEdge; path: SVGElement }[] = [];

  // Edges under nodes.
  for (const edge of ARCH_EDGES) {
    const from = ARCH_NODES.find((n) => n.id === edge.from);
    const to = ARCH_NODES.find((n) => n.id === edge.to);
    if (!from || !to) continue;
    const d = edgePath(from, to);
    const pathEl = s('path', { class: `sys-edge sys-edge-${edge.kind}`, d });
    svg.append(pathEl);
    edgeElements.push({ edge, path: pathEl });

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

  const nodeMap = new Map<string, SVGGElement>();

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
    nodeMap.set(node.id, g);
    svg.append(g);
  }

  const applyFlowPreset = (preset: FlowPreset): void => {
    activeFlowId = preset.id;
    activePreset = preset;
    flowBanner.textContent = preset.description;
    renderFlowSteps(preset);

    const activeNodes = new Set(preset.nodeIds);
    for (const [id, el] of nodeMap) {
      setClass(el, 'is-flow-active', activeNodes.has(id));
    }

    for (const { edge, path } of edgeElements) {
      const isEdgeActive = activeNodes.has(edge.from) && activeNodes.has(edge.to);
      setClass(path, 'is-flow-active', isEdgeActive);
    }
  };

  const flowButtons = FLOW_PRESETS.map((preset) =>
    h(
      'button',
      {
        class: `sys-flow-btn${preset.id === activeFlowId ? ' is-active' : ''}`,
        attrs: { type: 'button' },
        on: {
          click: (e) => {
            document.querySelectorAll('.sys-flow-btn').forEach((b) => setClass(b, 'is-active', b === e.currentTarget));
            applyFlowPreset(preset);
          },
        },
        text: preset.shortLabel,
      },
    ),
  );

  const flowBar = h('div', { class: 'sys-flow-bar' }, [
    h('span', { class: 'sys-flow-label', text: 'Flow Simulator:' }),
    ...flowButtons,
  ]);

  // Initial selection.
  renderDetail(ARCH_NODES[0]!);
  applyFlowPreset(activePreset);
  const firstNode = nodeMap.get(ARCH_NODES[0]!.id);
  if (firstNode) setClass(firstNode, 'is-selected', true);

  const liveConsole = buildBackendLiveConsole();

  return h('div', { class: 'sys-architect-section' }, [
    flowBar,
    flowBanner,
    h('div', { class: 'sys-two-col' }, [
      h('div', { class: 'sys-diagram-wrap' }, [svg]),
      detail,
    ]),
    flowStepsHolder,
    liveConsole,
  ]);
}

function buildBackendLiveConsole(): HTMLElement {
  const terminal = h('pre', {
    class: 'sys-backend-output-terminal',
    text: '// Ready. Click any live test button above to execute round-trip Edge Gateway API queries.\n// Connected to Cloudflare Worker edge runtime (proxied at /api -> port 8787).',
  });

  const latencyChip = h('span', { class: 'sys-backend-pill', text: 'Latency: -- ms' });
  const statusChip = h('span', { class: 'sys-backend-pill', text: 'HTTP: --' });
  const timeChip = h('span', { class: 'sys-backend-pill', text: 'Timestamp: --' });

  const setStatus = (status: number | string, ms: number, body: string, isOk: boolean): void => {
    statusChip.textContent = `HTTP: ${status}`;
    latencyChip.textContent = `Latency: ${ms} ms`;
    timeChip.textContent = `Timestamp: ${new Date().toLocaleTimeString()}`;
    terminal.textContent = body;
    setClass(statusChip, 'is-live', isOk);
  };

  const testHealthBtn = h(
    'button',
    {
      class: 'sys-backend-btn',
      attrs: { type: 'button' },
      on: {
        click: async () => {
          terminal.textContent = '⏳ Querying GET /api/health ...';
          const t0 = performance.now();
          try {
            const res = await fetch('/api/health');
            const ms = Math.round(performance.now() - t0);
            const data = await res.json();
            setStatus(res.status, ms, JSON.stringify(data, null, 2), res.ok);
          } catch (err) {
            setStatus('ERR', Math.round(performance.now() - t0), String(err), false);
          }
        },
      },
    },
    ['📡 1. Query Edge Health (/api/health)'],
  );

  const testEvpBtn = h(
    'button',
    {
      class: 'sys-backend-btn',
      attrs: { type: 'button' },
      on: {
        click: async () => {
          terminal.textContent = '⏳ Minting signed token and dispatching POST /api/evp ...';
          const t0 = performance.now();
          try {
            const tokenRes = await fetch('/api/evp/demo-token', { method: 'POST' });
            if (!tokenRes.ok) {
              const errData = await tokenRes.json();
              setStatus(tokenRes.status, Math.round(performance.now() - t0), JSON.stringify(errData, null, 2), false);
              return;
            }
            const signedToken = await tokenRes.json();
            const evpRes = await fetch('/api/evp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(signedToken),
            });
            const ms = Math.round(performance.now() - t0);
            const data = await evpRes.json();
            setStatus(evpRes.status, ms, JSON.stringify(data, null, 2), evpRes.ok);
          } catch (err) {
            setStatus('ERR', Math.round(performance.now() - t0), String(err), false);
          }
        },
      },
    },
    ['2. Test HMAC-signed preemption request (/api/evp)'],
  );

  const testCopilotBtn = h(
    'button',
    {
      class: 'sys-backend-btn',
      attrs: { type: 'button' },
      on: {
        click: async () => {
          terminal.textContent = '⏳ Querying POST /api/copilot/diagnose ...';
          const t0 = performance.now();
          try {
            const payload = {
              window: {
                avgQueueM: 42.5,
                peakQueueM: 88.0,
                maxWaitS: 41.2,
                throughputVph: 1120,
                spillback: false,
                criticalLane: 'NB-TR',
                measuredDelayS: 12.8,
              },
            };
            const res = await fetch('/api/copilot/diagnose', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const ms = Math.round(performance.now() - t0);
            const data = await res.json();
            setStatus(res.status, ms, JSON.stringify(data, null, 2), res.ok);
          } catch (err) {
            setStatus('ERR', Math.round(performance.now() - t0), String(err), false);
          }
        },
      },
    },
    ['🤖 3. Test Meta AI Copilot Diagnosis (/api/copilot/diagnose)'],
  );

  return h('div', { class: 'sys-backend-live-wrap' }, [
    h('div', { class: 'sys-backend-header-row' }, [
      h('div', {}, [
        h('h4', { class: 'sys-flow-steps-head', text: 'Live Edge Gateway & Cloud Telemetry Console' }),
        h('p', {
          class: 'sys-hint',
          text: 'Interactive live HTTP/JSON queries to Cloudflare Worker Edge Gateway and MongoDB Atlas cluster. Run real-time queries for gateway health, HMAC-SHA256 authenticated emergency preemption, and Meta AI Copilot inference.',
        }),
      ]),
      h('div', { class: 'sys-backend-badge-row' }, [
        h('span', { class: 'sys-backend-pill is-live', text: '● GATEWAY ACTIVE' }),
        h('span', { class: 'sys-backend-pill', text: 'CLOUDFLARE WORKER' }),
        h('span', { class: 'sys-backend-pill', text: 'MONGODB ATLAS' }),
      ]),
    ]),
    h('div', { class: 'sys-backend-actions' }, [testHealthBtn, testEvpBtn, testCopilotBtn]),
    h('div', { class: 'sys-backend-meta-bar' }, [statusChip, latencyChip, timeChip]),
    terminal,
  ]);
}

// --- Project Structure View with Live Search -------------------------------------

function buildTree(node: TreeNode, depth: number, filter: string, parentPath = ''): HTMLElement | null {
  const matchesSelf = filter === '' || node.name.toLowerCase().includes(filter) || node.desc.toLowerCase().includes(filter);
  // Directory entries in PROJECT_TREE are spelled with a trailing slash
  // ('packages/', 'src/control/'); stripping it before joining is what keeps
  // the generated GitHub links free of doubled slashes ('.../packages//core/...').
  const trimSlash = (segment: string): string => segment.endsWith('/') ? segment.slice(0, -1) : segment;
  const currentPath = parentPath ? `${trimSlash(parentPath)}/${trimSlash(node.name)}` : trimSlash(node.name);

  let matchingChildren: HTMLElement[] = [];
  if (node.children) {
    for (const child of node.children) {
      const renderedChild = buildTree(child, depth + 1, filter, currentPath);
      if (renderedChild) matchingChildren.push(renderedChild);
    }
  }

  if (!matchesSelf && matchingChildren.length === 0) return null;

  if (!node.children || node.children.length === 0) {
    return h('div', { class: 'sys-leaf' }, [
      h(
        'a',
        {
          class: 'mono sys-leaf-name sys-tree-link',
          attrs: {
            href: `https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/${currentPath}`,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: `Open ${currentPath} on GitHub`,
          },
        },
        [node.name, ' ↗'],
      ),
      node.badge ? h('span', { class: 'sys-tree-badge', text: node.badge }) : null,
      h('span', { class: 'sys-leaf-desc', text: node.desc }),
    ]);
  }

  const shouldOpen = filter !== '' || depth < 1;

  return h('details', { class: 'sys-tree', attrs: { open: shouldOpen ? '' : null } }, [
    h('summary', { class: 'sys-tree-summary' }, [
      h(
        'a',
        {
          class: 'mono sys-tree-name sys-tree-link',
          attrs: {
            href: `https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/tree/main/${currentPath}`,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: `Browse ${currentPath} on GitHub`,
          },
          on: {
            click: (e) => e.stopPropagation(),
          },
        },
        [node.name, ' ↗'],
      ),
      node.badge ? h('span', { class: 'sys-tree-badge', text: node.badge }) : null,
      h('span', { class: 'sys-tree-desc', text: node.desc }),
    ]),
    h('div', { class: 'sys-tree-children' }, matchingChildren),
  ]);
}

export function buildStructureView(): HTMLElement {
  let searchFilter = '';
  const treeRoot = h('div', { class: 'sys-tree-root' });

  const renderTree = (): void => {
    treeRoot.replaceChildren();
    const elements: HTMLElement[] = [];
    for (const n of PROJECT_TREE) {
      const el = buildTree(n, 0, searchFilter.toLowerCase().trim());
      if (el) elements.push(el);
    }
    if (elements.length === 0) {
      treeRoot.append(h('p', { class: 'sys-rel-none', text: 'No files match your search filter.' }));
    } else {
      treeRoot.append(...elements);
    }
  };

  const searchInput = h('input', {
    class: 'sys-search-input',
    attrs: {
      type: 'search',
      placeholder: 'Search files & directories (e.g. kernel, hmac, evp, mongo)...',
      'aria-label': 'Search project files',
    },
    on: {
      input: (e) => {
        searchFilter = (e.target as HTMLInputElement).value;
        renderTree();
      },
    },
  });

  const expandAllBtn = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { type: 'button' },
      on: {
        click: () => {
          treeRoot.querySelectorAll('details').forEach((d) => (d.open = true));
        },
      },
    },
    ['Expand All'],
  );

  const collapseAllBtn = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { type: 'button' },
      on: {
        click: () => {
          treeRoot.querySelectorAll('details').forEach((d) => (d.open = false));
        },
      },
    },
    ['Collapse All'],
  );

  const searchBar = h('div', { class: 'sys-search-bar' }, [
    searchInput,
    h('div', { class: 'sys-search-actions' }, [expandAllBtn, collapseAllBtn]),
  ]);

  renderTree();

  return h('section', { class: 'sys-structure', label: 'Project structure' }, [
    h('p', {
      class: 'sys-hint',
      text: 'Hierarchical view of the monorepo structure. The dependency rule holds universally: core imports nothing but zod, and nothing depends on web. Every directory serves a distinct, audited purpose.',
    }),
    searchBar,
    treeRoot,
  ]);
}

// --- Clef Model Components View with Dependency Graph Highlighting --------------

export function buildComponentsView(): HTMLElement {
  let activePackage = 'all';
  let activeQuery = '';
  const detail = h('div', {
    class: 'sys-detail',
    attrs: { id: 'component-detail', role: 'status', 'aria-live': 'polite' },
  });
  const cards = new Map<string, HTMLElement>();
  const countLabel = h('span', { class: 'sys-comp-count', text: `${COMPONENTS.length} of ${COMPONENTS.length} components` });

  const titleOf = (id: string): string => COMPONENTS.find((c) => c.id === id)?.title ?? id;

  const select = (card: ComponentCard): void => {
    const deps = new Set(card.dependsOn);
    const users = new Set(card.usedBy);

    for (const [id, el] of cards) {
      setClass(el, 'is-selected', id === card.id);
      setClass(el, 'is-dep', deps.has(id));
      setClass(el, 'is-user', users.has(id));
      setClass(el, 'is-dim', !deps.has(id) && !users.has(id) && id !== card.id);
    }

    detail.replaceChildren(
      h('h3', { class: 'sys-detail-title', text: card.title }),
      h('span', { class: 'badge', text: card.pkg.toUpperCase() }),
      h('p', { class: 'sys-detail-body', text: card.role }),
      h('p', { class: 'sys-rel-label', text: 'Invariants Enforced' }),
      h('p', { class: 'sys-detail-body mono', text: card.invariants }),
      h('p', { class: 'sys-rel-label', text: 'Direct Source Code Hyperlink' }),
      h('div', { class: 'sys-file-link-row' }, [
        h(
          'a',
          {
            class: 'sys-code-link',
            attrs: {
              href: `https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/${card.filePath}`,
              target: '_blank',
              rel: 'noopener noreferrer',
              title: `Open ${card.filePath} on GitHub`,
            },
          },
          [card.filePath],
        ),
      ]),
      h('p', { class: 'sys-rel-label', text: 'Depends On (Imports)' }),
      h(
        'div',
        { class: 'sys-rel-chips' },
        card.dependsOn.length > 0
          ? card.dependsOn.map((d) =>
              h(
                'button',
                {
                  class: 'sys-rel-chip sys-rel-chip-link',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      const target = COMPONENTS.find((c) => c.id === d);
                      if (target) select(target);
                    },
                  },
                  text: titleOf(d),
                },
              ),
            )
          : [h('span', { class: 'sys-rel-none', text: 'Root module (no internal dependencies)' })],
      ),
      h('p', { class: 'sys-rel-label', text: 'Used By (Consumers)' }),
      h(
        'div',
        { class: 'sys-rel-chips' },
        card.usedBy.length > 0
          ? card.usedBy.map((u) =>
              h(
                'button',
                {
                  class: 'sys-rel-chip sys-rel-chip-link',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      const target = COMPONENTS.find((c) => c.id === u);
                      if (target) select(target);
                    },
                  },
                  text: titleOf(u),
                },
              ),
            )
          : [h('span', { class: 'sys-rel-none', text: 'Top consumer (dashboard / harness endpoint)' })],
      ),
    );
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

  const filterCards = (pkg = activePackage, q = activeQuery): void => {
    activePackage = pkg;
    activeQuery = q.trim().toLowerCase();
    let visibleCount = 0;
    for (const card of COMPONENTS) {
      const el = cards.get(card.id);
      if (!el) continue;
      const matchesPkg = activePackage === 'all' || card.pkg === activePackage;
      const matchesQuery =
        activeQuery === '' ||
        card.title.toLowerCase().includes(activeQuery) ||
        card.id.toLowerCase().includes(activeQuery) ||
        card.role.toLowerCase().includes(activeQuery) ||
        card.invariants.toLowerCase().includes(activeQuery);
      const visible = matchesPkg && matchesQuery;
      el.style.display = visible ? 'flex' : 'none';
      if (visible) visibleCount++;
    }
    countLabel.textContent = `${visibleCount} of ${COMPONENTS.length} components`;
  };

  const searchInput = h('input', {
    class: 'sys-comp-search-input',
    attrs: {
      type: 'search',
      placeholder: `Search ${COMPONENTS.length} Clef model components (e.g. kernel, evp, copilot, idm, pipeline)...`,
      'aria-label': 'Search Clef model components',
    },
    on: {
      input: (e) => {
        filterCards(activePackage, (e.target as HTMLInputElement).value);
      },
    },
  });

  const searchRow = h('div', { class: 'sys-comp-search-bar' }, [
    searchInput,
    countLabel,
  ]);

  const pkgFilters = ['all', 'core', 'web', 'edge', 'pipeline', 'db', 'bench'].map((pkg) =>
    h(
      'button',
      {
        class: `sys-pkg-btn${pkg === activePackage ? ' is-active' : ''}`,
        attrs: { type: 'button' },
        on: {
          click: (e) => {
            document.querySelectorAll('.sys-pkg-btn').forEach((b) => setClass(b, 'is-active', b === e.currentTarget));
            filterCards(pkg, activeQuery);
          },
        },
        text: pkg.toUpperCase(),
      },
    ),
  );

  const filterBar = h('div', { class: 'sys-pkg-filters' }, [
    h('span', { class: 'sys-flow-label', text: 'Filter by Package:' }),
    ...pkgFilters,
  ]);

  select(COMPONENTS[0]!);

  return h('section', { class: 'sys-components-section' }, [
    h('p', {
      class: 'sys-hint',
      text: 'Interactive dependency relationship model. Click any component to highlight its direct dependencies (green) and dependents (blue). Click dependency chips in the side panel to navigate the architecture graph.',
    }),
    searchRow,
    filterBar,
    h('div', { class: 'sys-two-col sys-two-col-wide-left' }, [
      h('div', { class: 'sys-comp-scroll' }, [grid]),
      detail,
    ]),
  ]);
}

// --- Dynamic Interactive Workflow SVG Visualizer -------------------------------

function renderWorkflowSvg(workflowId: string, currentStep: number): SVGElement {
  const svg = s('svg', {
    class: 'sys-wf-svg',
    viewBox: '0 0 860 140',
    role: 'img',
    'aria-label': `Interactive workflow visualization for ${workflowId}, step ${currentStep + 1}`,
  });

  const wf = WORKFLOWS.find((w) => w.id === workflowId) ?? WORKFLOWS[0]!;
  const n = wf.steps.length;
  const startX = 50;
  const spacing = Math.min(130, (860 - 100) / Math.max(1, n - 1));
  const centerY = 70;

  // Connecting path between steps
  let pathD = `M ${startX} ${centerY}`;
  for (let i = 1; i < n; i++) {
    pathD += ` L ${startX + i * spacing} ${centerY}`;
  }
  svg.append(s('path', { class: 'sys-edge sys-edge-command', d: pathD }));

  // Animated packet moving towards current active step
  if (!reducedMotion) {
    const activeX = startX + currentStep * spacing;
    const packet = s('circle', { class: 'sys-packet', cx: activeX, cy: centerY, r: 6 });
    svg.append(packet);
  }

  // Draw stage nodes
  for (let i = 0; i < n; i++) {
    const step = wf.steps[i]!;
    const cx = startX + i * spacing;
    const isActive = i === currentStep;
    const isPast = i < currentStep;

    const g = s('g', {
      class: `sys-wf-stage-node${isActive ? ' is-active' : ''}${isPast ? ' is-past' : ''}`,
      transform: `translate(${cx - 48}, ${centerY - 32})`,
    });

    g.append(
      s('rect', {
        x: 0,
        y: 0,
        width: 96,
        height: 64,
        rx: 8,
      }),
    );

    const stepNum = s('text', {
      x: 48,
      y: 20,
      'text-anchor': 'middle',
      class: 'sys-wf-stage-code',
    });
    text(stepNum, step.stageCode ?? `STEP ${i + 1}`);

    const label = s('text', {
      x: 48,
      y: 38,
      'text-anchor': 'middle',
    });
    const shortTitle = step.title.length > 14 ? step.title.slice(0, 12) + '…' : step.title;
    text(label, shortTitle);

    const stateTag = s('text', {
      x: 48,
      y: 52,
      'text-anchor': 'middle',
      class: 'sys-wf-stage-code',
    });
    text(stateTag, isActive ? '● ACTIVE' : isPast ? '✓ DONE' : '○ QUEUED');

    g.append(stepNum, label, stateTag);
    svg.append(g);
  }

  return svg;
}

// --- Dynamic Workflow View ------------------------------------------------------

function buildWorkflowView(workflow: Workflow, onSwitch: (id: string) => void): HTMLElement {
  let index = 0;
  let timer: number | null = null;

  const svgWrap = h('div', { class: 'sys-wf-svg-wrap' });
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
    [h('span', { text: 'Play Auto-Tour' })],
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
    svgWrap.replaceChildren(renderWorkflowSvg(workflow.id, index));
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
    playBtn.replaceChildren(h('span', { text: 'Play Auto-Tour' }));
  };

  const togglePlay = (): void => {
    if (timer !== null) {
      stop();
      return;
    }
    if (index >= workflow.steps.length - 1) go(0);
    playBtn.replaceChildren(h('span', { text: 'Pause Tour' }));
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
        on: {
          click: () => {
            stop();
            onSwitch(w.id);
          },
        },
        text: w.title,
      }),
    ),
  );

  return h('div', { class: 'sys-wf' }, [
    picker,
    h('p', { class: 'sys-wf-summary', text: workflow.summary }),
    svgWrap,
    h('div', { class: 'sys-wf-stage' }, [titleEl, bodyEl]),
    barEl,
    dotsEl,
    h('div', { class: 'sys-wf-controls' }, [prevBtn, playBtn, nextBtn]),
  ]);
}

// --- Judging Rubric & Hackathon Video Demo Script --------------------------------

export function buildJudgingView(onGo?: (id: string) => void): HTMLElement {
  const themes = h(
    'div',
    { class: 'sys-theme-grid' },
    THEME_FIT.map((t) =>
      h('div', { class: 'sys-theme' }, [
        h('h3', { class: 'sys-theme-name', text: t.name }),
        h('p', { class: 'sys-theme-verdict', text: t.verdict }),
      ]),
    ),
  );

  const cards = h(
    'div',
    { class: 'sys-rubric-grid' },
    RUBRIC.map((r) => {
      const fill = h('div', { class: 'sys-rubric-weight-fill' });
      fill.style.setProperty('--sys-rubric-weight', `${r.weight}%`);
      return h('article', { class: 'sys-rubric' }, [
        h('header', { class: 'sys-rubric-head' }, [
          h('h3', { class: 'sys-rubric-title', text: r.criterion }),
          h('span', { class: 'sys-rubric-pct mono', text: `${r.weight}%` }),
        ]),
        h(
          'div',
          {
            class: 'sys-rubric-weight',
            attrs: {
              role: 'progressbar',
              'aria-label': r.criterion,
              'aria-valuenow': String(r.weight),
              'aria-valuemin': '0',
              'aria-valuemax': '100',
            },
          },
          [fill],
        ),
        h('p', { class: 'sys-rubric-look', text: `What Judges Look For: ${r.judgesLookFor}` }),
        h('p', { class: 'sys-rubric-answer', text: r.ourAnswer }),
        h('p', { class: 'sys-rel-label', text: 'Show in Video Demo' }),
        h(
          'div',
          { class: 'sys-rel-chips' },
          r.show.map((link) =>
            h('button', {
              class: 'sys-rel-chip sys-rel-chip-link',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  if (onGo) onGo(link.section);
                  else window.location.href = `/system.html#${link.section}`;
                },
              },
              text: link.label,
            }),
          ),
        ),
      ]);
    }),
  );

  return h('section', { class: 'sys-judging', label: 'Hackathon pitch' }, [
    h('p', {
      class: 'sys-hint',
      text: 'Evaluation criteria from the hackathon brief, each answered with evidence that exists in this repository. Chips link to the matching architecture section.',
    }),
    themes,
    cards,
  ]);
}

// --- Overview view -----------------------------------------------------------------

export function buildAboutView(): HTMLElement {
  const blocks = h(
    'div',
    { class: 'sys-about-blocks' },
    ABOUT_BLOCKS.map((b) =>
      h('article', { class: 'sys-about-block' }, [
        h('h3', { class: 'sys-detail-title', text: b.heading }),
        h('p', { class: 'sys-detail-body', text: b.body }),
      ]),
    ),
  );

  const stats = h(
    'div',
    { class: 'sys-stat-grid', attrs: { role: 'list' } },
    ABOUT_ACHIEVEMENTS.map((a) =>
      h('div', { class: 'sys-stat', attrs: { role: 'listitem' } }, [
        h('span', { class: 'sys-stat-num mono', text: a.stat }),
        h('span', { class: 'sys-stat-label', text: a.label }),
      ]),
    ),
  );

  const innovations = h(
    'div',
    { class: 'sys-about-innov-grid' },
    ABOUT_INNOVATIONS.map((i) =>
      h('article', { class: 'sys-about-innov' }, [
        h('h3', { class: 'sys-about-innov-title', text: i.title }),
        h('p', { class: 'sys-detail-body', text: i.body }),
      ]),
    ),
  );

  return h('section', { class: 'sys-about', label: 'Project overview' }, [
    h('p', {
      class: 'sys-hint',
      text: 'Start here on camera: the problem, the architecture in one paragraph, what is genuinely new, and what has been measured rather than claimed. Every stat below is provable elsewhere on this page or in the test suite.',
    }),
    blocks,
    stats,
    innovations,
  ]);
}

// --- Page Shell ------------------------------------------------------------------

export function buildWorkflowsView(): HTMLElement {
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

export function initGlobalTheme(): void {
  try {
    const raw = localStorage.getItem('uf_v1_theme');
    const resolved =
      raw === 'light' ? 'light' : raw === 'dark' ? 'dark' : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', resolved);
  } catch {
    // Local storage unavailable
  }
}

export function buildGlobalNav(activePage: string): HTMLElement {
  initGlobalTheme();

  const pages = [
    { id: 'sim', href: '/', label: 'Simulation Dashboard' },
    { id: 'architecture', href: '/architecture.html', label: 'Architecture & Flow' },
    { id: 'structure', href: '/structure.html', label: 'Project Structure' },
    { id: 'components', href: '/components.html', label: 'Clef Components' },
    { id: 'workflows', href: '/workflows.html', label: 'Dynamic Workflows' },
    { id: 'presentation', href: '/presentation.html', label: 'Evaluation & Rubric' },
    { id: 'system', href: '/system.html', label: 'All-In-One Hub' },
  ];

  const getTheme = (): 'dark' | 'light' =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

  const themeLabel = h('span', {
    class: 'sys-theme-label mono',
    text: getTheme() === 'light' ? '☀️ Light' : '🌙 Dark',
  });

  const themeToggleBtn = h(
    'button',
    {
      class: 'sys-theme-toggle-btn',
      attrs: {
        type: 'button',
        id: 'btn-theme-toggle-global',
        'aria-label': 'Toggle light or dark theme',
        title: 'Switch between Dark and Light control-room theme',
      },
      on: {
        click: () => {
          const next = getTheme() === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          try {
            localStorage.setItem('uf_v1_theme', next);
          } catch {
            // storage unavailable
          }
          themeLabel.textContent = next === 'light' ? '☀️ Light' : '🌙 Dark';
        },
      },
    },
    [themeLabel],
  );

  window.addEventListener('storage', (e) => {
    if (e.key === 'uf_v1_theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
      document.documentElement.setAttribute('data-theme', e.newValue);
      themeLabel.textContent = e.newValue === 'light' ? '☀️ Light' : '🌙 Dark';
    }
  });

  return h('header', { class: 'sys-global-header' }, [
    h('div', { class: 'sys-global-brand' }, [
      h('span', { class: 'badge badge-mode', text: 'META AI HACKATHON' }),
      h('a', { class: 'sys-global-title', attrs: { href: '/' } }, ['UrbanFlow AI']),
    ]),
    h('nav', { class: 'sys-global-nav', attrs: { 'aria-label': 'Platform showcase navigation' } }, [
      ...pages.map((p) =>
        h(
          'a',
          {
            class: `sys-nav-pill ${p.id === activePage ? 'is-active' : ''}`,
            attrs: {
              href: p.href,
              'aria-current': p.id === activePage ? 'page' : undefined,
            },
          },
          [p.label],
        ),
      ),
      themeToggleBtn,
    ]),
  ]);
}

interface Section {
  id: string;
  label: string;
  build: () => HTMLElement;
}

function buildPage(): void {
  const root = document.getElementById('system-app');
  if (!root) return;

  const sections: readonly Section[] = [
    { id: 'architecture', label: 'Architecture & Data Flow', build: buildArchitectView },
    { id: 'about', label: 'Overview', build: buildAboutView },
    { id: 'structure', label: 'Project Structure', build: buildStructureView },
    { id: 'components', label: 'Components & Relationships', build: buildComponentsView },
    { id: 'workflows', label: 'Dynamic Workflows', build: buildWorkflowsView },
    { id: 'live', label: 'Live core', build: buildLiveView },
    { id: 'judging', label: 'Hackathon Rubric & Video Script', build: () => buildJudgingView(activate) },
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

  // --- Guided Demo Tour ---
  const TOUR_STEP_MS = 11000;
  let tourTimer: number | null = null;
  let tourIndex = 0;
  const tourLabel = h('span', { text: 'Play Guided Tour' });
  const tourBtn = h(
    'button',
    {
      class: 'btn btn-primary',
      attrs: { id: 'sys-tour-btn', type: 'button', 'aria-pressed': 'false' },
      label: 'Cycle through every section automatically for video recording',
      on: {
        click: () => {
          if (tourTimer !== null) {
            window.clearInterval(tourTimer);
            tourTimer = null;
            tourLabel.textContent = 'Play Guided Tour';
            tourBtn.setAttribute('aria-pressed', 'false');
            return;
          }
          tourIndex = sections.findIndex((x) => x.id === current);
          tourLabel.textContent = 'Stop Tour';
          tourBtn.setAttribute('aria-pressed', 'true');
          tourTimer = window.setInterval(() => {
            tourIndex += 1;
            if (tourIndex >= sections.length) {
              window.clearInterval(tourTimer as number);
              tourTimer = null;
              tourLabel.textContent = 'Play Guided Tour';
              tourBtn.setAttribute('aria-pressed', 'false');
              return;
            }
            activate(sections[tourIndex]!.id);
          }, TOUR_STEP_MS);
        },
      },
    },
    [tourLabel],
  );

  const header = h('header', { class: 'sys-header' }, [
    h('div', { class: 'sys-brand' }, [
      h('span', { class: 'badge badge-mode', text: 'META GLOBAL AI DEVELOPER HACKATHON' }),
      h('h1', { class: 'sys-title', text: 'UrbanFlow AI — Clef System Explorer' }),
      h('p', {
        class: 'sys-tagline',
        text: 'Interactive walkthrough of the architecture, data flow, safety invariants, workflows and Meta AI integration, built from the contents of this repository.',
      }),
    ]),
    h('div', { class: 'sys-header-actions' }, [
      tourBtn,
      h('a', {
        class: 'btn btn-secondary',
        attrs: { href: '/', id: 'sys-back-link' },
        text: 'Open Live Simulation',
      }),
    ]),
  ]);

  const nav = h('nav', { class: 'sys-tabs', attrs: { role: 'tablist', 'aria-label': 'System explorer sections' } }, tabs);
  const main = h('main', { class: 'sys-main', attrs: { id: 'main' } }, [...panels.values()]);
  const footer = h('footer', { class: 'sys-footer' }, [
    h('span', { class: 'mono', text: 'packages/web · system.html — deterministic, vanilla TypeScript, zero framework' }),
    h('span', { text: 'Every metric shown in the live dashboard is measured; every architectural invariant is proven in test suites.' }),
  ]);

  root.append(buildGlobalNav('system'), header, nav, main, footer);

  const fromHash = window.location.hash.replace('#', '');
  activate(sections.some((x) => x.id === fromHash) ? fromHash : 'architecture');

  window.addEventListener('hashchange', () => {
    const id = window.location.hash.replace('#', '');
    if (sections.some((x) => x.id === id)) activate(id);
  });
}

buildPage();
