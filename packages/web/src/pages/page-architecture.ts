import { h } from '../ui/dom.js';
import { buildArchitectView, buildGlobalNav } from './system.js';

function mount(): void {
  const root = document.getElementById('arch-app');
  if (!root) return;

  const hero = h('section', { class: 'sys-page-hero' }, [
    h('span', { class: 'badge badge-mode', text: 'DISTRIBUTED DATA FLOW ENGINE' }),
    h('h1', { class: 'sys-page-title', text: 'Architecture & End-to-End Data Flow' }),
    h('p', {
      class: 'sys-page-subtitle',
      text: 'Four-tier distributed architecture spanning zero-blocking browser UI, Web Worker simulation core, Cloudflare edge gateway with HMAC security, Meta Llama AI Copilot, streaming Parquet data lake, and MongoDB operational store.',
    }),
  ]);

  const view = buildArchitectView();

  const footer = h('footer', { class: 'sys-footer' }, [
    h('span', { class: 'mono', text: 'UrbanFlow AI · /architecture.html — vanilla TypeScript, WCAG 2.2 AA' }),
    h('span', { text: 'Select flow presets above to trace animated data packets and inspect wire schemas.' }),
  ]);

  root.append(buildGlobalNav('architecture'), hero, view, footer);
}

mount();

