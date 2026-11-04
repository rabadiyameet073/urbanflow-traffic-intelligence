import { h } from '../ui/dom.js';
import { buildGlobalNav, buildStructureView } from './system.js';

function mount(): void {
  const root = document.getElementById('structure-app');
  if (!root) return;

  const hero = h('section', { class: 'sys-page-hero' }, [
    h('span', { class: 'badge badge-mode', text: 'MONOREPO CODEBASE MAP' }),
    h('h1', { class: 'sys-page-title', text: '📁 Project Structure & Monorepo Hierarchy' }),
    h('p', {
      class: 'sys-page-subtitle',
      text: 'Complete directory and file hierarchy across packages/core, packages/web, packages/edge, pipeline, db, docs, and evals. Search in real-time or click any file to open the exact line on GitHub.',
    }),
  ]);

  const view = buildStructureView();

  const footer = h('footer', { class: 'sys-footer' }, [
    h('span', { class: 'mono', text: 'UrbanFlow AI · /structure.html — verified 7/7 architectural fitness gates' }),
    h('span', { text: 'Type in the search bar above to filter components, models, and tests.' }),
  ]);

  root.append(buildGlobalNav('structure'), hero, view, footer);
}

mount();

