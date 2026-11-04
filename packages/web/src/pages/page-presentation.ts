import { h } from '../ui/dom.js';
import { buildAboutView, buildGlobalNav, buildJudgingView, buildLiveView } from './system.js';

function mount(): void {
  const root = document.getElementById('presentation-app');
  if (!root) return;

  const hero = h('section', { class: 'sys-page-hero' }, [
    h('span', { class: 'badge badge-mode', text: 'META GLOBAL AI DEVELOPER HACKATHON' }),
    h('h1', { class: 'sys-page-title', text: 'Presentation Plan & Demo Script' }),
    h('p', {
      class: 'sys-page-subtitle',
      text: 'The hackathon evaluation criteria — Impact 30 %, Meta AI 25 %, Technical Depth 20 %, Presentation 25 % — each mapped to evidence in this repo, plus the 2.5-minute demo script and the live twin benchmark.',
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
    h('span', { text: 'Everything demonstrated in the video is open source, covered by the automated test suite, and reproducible locally with pnpm dev.' }),
  ]);

  root.append(buildGlobalNav('presentation'), hero, rubricView, liveHeader, liveView, aboutHeader, aboutView, footer);
}

mount();

