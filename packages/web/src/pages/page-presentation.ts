import { h } from '../ui/dom.js';
import { buildAboutView, buildGlobalNav, buildJudgingView, buildLiveView } from './system.js';

function mount(): void {
  const root = document.getElementById('presentation-app');
  if (!root) return;

  const hero = h('section', { class: 'sys-page-hero' }, [
    h('span', { class: 'badge badge-mode', text: 'META GLOBAL AI DEVELOPER HACKATHON' }),
    h('h1', { class: 'sys-page-title', text: '🏆 Presentation Command Center & Demo Script' }),
    h('p', {
      class: 'sys-page-subtitle',
      text: 'Dedicated evaluation center aligned to the official hackathon criteria: Impact (30%), Meta AI (25%), Technical Depth (20%), and Presentation (25%), with an interactive 2.5-minute scene-by-scene demo script and live running twin benchmarks.',
    }),
  ]);

  const rubricView = buildJudgingView();

  const liveHeader = h('div', { class: 'sys-section-header' }, [
    h('span', { class: 'badge', text: 'MEASURED PROOF' }),
    h('h2', { class: 'sys-page-title', text: 'Live Core Engine & Paired Twin Benchmark' }),
    h('p', { class: 'sys-page-subtitle', text: 'Running in real time on this browser tab: 0.1 s step, zero main-thread blocking, measuring average delay, person throughput, and emergency vehicle response.' }),
  ]);
  const liveView = buildLiveView();

  const aboutHeader = h('div', { class: 'sys-section-header' }, [
    h('span', { class: 'badge', text: 'KEY TAKEAWAYS' }),
    h('h2', { class: 'sys-page-title', text: 'Platform Innovations & Engineering Highlights' }),
  ]);
  const aboutView = buildAboutView();

  const footer = h('footer', { class: 'sys-footer' }, [
    h('span', { class: 'mono', text: 'UrbanFlow AI · /presentation.html — Meta Global AI Developer Hackathon' }),
    h('span', { text: 'Everything demonstrated in the video is open source, verified by 125+ automated tests, and reproducible locally with pnpm dev.' }),
  ]);

  root.append(buildGlobalNav('presentation'), hero, rubricView, liveHeader, liveView, aboutHeader, aboutView, footer);
}

mount();
