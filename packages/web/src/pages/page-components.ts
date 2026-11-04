import { h } from '../ui/dom.js';
import { buildComponentsView, buildGlobalNav } from './system.js';

function mount(): void {
  const root = document.getElementById('components-app');
  if (!root) return;

  const hero = h('section', { class: 'sys-page-hero' }, [
    h('span', { class: 'badge badge-mode', text: 'CLEF MODEL COMPONENT MATRIX' }),
    h('h1', { class: 'sys-page-title', text: '🧩 Clef Model Components & Live Dependency Graph' }),
    h('p', {
      class: 'sys-page-subtitle',
      text: 'Interactive component matrix featuring 23 modular units. Click any component card to highlight its direct imports (blue) and downstream consumers (purple) in real time.',
    }),
  ]);

  const view = buildComponentsView();

  const footer = h('footer', { class: 'sys-footer' }, [
    h('span', { class: 'mono', text: 'UrbanFlow AI · /components.html — single-writer kernel & zero circular dependencies' }),
    h('span', { text: 'Click dependency chips on the right panel to navigate smoothly through the architecture graph.' }),
  ]);

  root.append(buildGlobalNav('components'), hero, view, footer);
}

mount();
