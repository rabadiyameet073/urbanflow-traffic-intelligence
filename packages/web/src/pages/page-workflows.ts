import { h } from '../ui/dom.js';
import { buildGlobalNav, buildWorkflowsView } from './system.js';

function mount(): void {
  const root = document.getElementById('workflows-app');
  if (!root) return;

  const hero = h('section', { class: 'sys-page-hero' }, [
    h('span', { class: 'badge badge-mode', text: 'STATE-MACHINE ANIMATED WALKTHROUGHS' }),
    h('h1', { class: 'sys-page-title', text: '⚡ Dynamic Workflows & Process Visualizations' }),
    h('p', {
      class: 'sys-page-subtitle',
      text: 'Step-by-step interactive walkthroughs of the 10 Hz Simulation Loop, Emergency Vehicle Preemption lifecycle, Dual Digital Twin Replay, and the Events-to-Answers Big-Data Pipeline.',
    }),
  ]);

  const view = buildWorkflowsView();

  const footer = h('footer', { class: 'sys-footer' }, [
    h('span', { class: 'mono', text: 'UrbanFlow AI · /workflows.html — verified deterministic invariants' }),
    h('span', { text: 'Use Play Tour to auto-advance through states or use Previous/Next to step through manual checkpoints.' }),
  ]);

  root.append(buildGlobalNav('workflows'), hero, view, footer);
}

mount();
