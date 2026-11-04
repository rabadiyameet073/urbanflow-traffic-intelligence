import { h } from './dom.js';
import { ICONS } from './icons.js';

export interface NavPage {
  id: string;
  href: string;
  label: string;
}

export const GLOBAL_NAV_PAGES: readonly NavPage[] = [
  { id: 'dashboard', href: '/', label: 'Simulation Dashboard' },
  { id: 'architecture', href: '/architecture.html', label: 'Architecture & Flow' },
  { id: 'structure', href: '/structure.html', label: 'Project Structure' },
  { id: 'components', href: '/components.html', label: 'Clef Components' },
  { id: 'workflows', href: '/workflows.html', label: 'Dynamic Workflows' },
  { id: 'presentation', href: '/presentation.html', label: 'Evaluation & Rubric' },
  { id: 'system', href: '/system.html', label: 'All-In-One Hub' },
];

export function getNavIcon(id: string): SVGSVGElement {
  switch (id) {
    case 'dashboard':
    case 'sim':
      return ICONS.gauge();
    case 'architecture':
      return ICONS.layers();
    case 'structure':
      return ICONS.database();
    case 'components':
      return ICONS.grid();
    case 'workflows':
      return ICONS.refresh();
    case 'presentation':
      return ICONS.presentation();
    case 'system':
      return ICONS.externalLink();
    default:
      return ICONS.circle();
  }
}

export function initGlobalTheme(): void {
  try {
    const saved = localStorage.getItem('uf_v1_theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch {
    // Local storage unavailable
  }
}

export function buildGlobalNav(activePage: string): HTMLElement {
  initGlobalTheme();

  const getTheme = (): 'dark' | 'light' =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

  const themeIconWrap = h('span', { class: 'sys-theme-icon-wrap' }, [
    getTheme() === 'light' ? ICONS.sun() : ICONS.moon(),
  ]);
  const themeLabel = h('span', {
    class: 'sys-theme-label mono',
    text: getTheme() === 'light' ? ' Light' : ' Dark',
  });

  const updateThemeUI = (theme: 'light' | 'dark') => {
    themeIconWrap.replaceChildren(theme === 'light' ? ICONS.sun() : ICONS.moon());
    themeLabel.textContent = theme === 'light' ? ' Light' : ' Dark';
  };

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
          updateThemeUI(next);
        },
      },
    },
    [themeIconWrap, themeLabel],
  );

  window.addEventListener('storage', (e) => {
    if (e.key === 'uf_v1_theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
      document.documentElement.setAttribute('data-theme', e.newValue);
      updateThemeUI(e.newValue);
    }
  });

  const isCurrent = (p: NavPage): boolean => {
    if (p.id === activePage) return true;
    if (activePage === 'dashboard' && (p.id === 'sim' || p.id === 'dashboard')) return true;
    if (activePage === 'sim' && (p.id === 'sim' || p.id === 'dashboard')) return true;
    return false;
  };

  return h('header', { class: 'sys-global-header' }, [
    h('div', { class: 'sys-global-brand' }, [
      h('span', { class: 'badge badge-mode', text: 'META AI HACKATHON' }),
      h('a', { class: 'sys-global-title', attrs: { href: '/' } }, [
        ICONS.logo(),
        h('span', { text: 'UrbanFlow AI' }),
      ]),
    ]),
    h('nav', { class: 'sys-global-nav', attrs: { 'aria-label': 'Platform showcase navigation' } }, [
      ...GLOBAL_NAV_PAGES.map((p) =>
        h(
          'a',
          {
            class: `sys-nav-pill ${isCurrent(p) ? 'is-active' : ''}`,
            attrs: {
              href: p.href,
              'aria-current': isCurrent(p) ? 'page' : undefined,
            },
          },
          [getNavIcon(p.id), ' ', p.label],
        ),
      ),
      themeToggleBtn,
    ]),
  ]);
}
