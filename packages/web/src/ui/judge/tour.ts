/**
 * Module 43: Judge Mode (90-second self-playing, interruptible tour)
 * Drives the real app across 6 choreographed stages with concise captions (<= 12 words).
 * Interruptible means *pause and skip*, not just stop: a judge who needs a beat
 * on stage three must be able to hold it, and one who has seen the opener must
 * be able to move on.
 */
import { store } from '../../state/store.js';
import { emsClearanceCaption } from './bench-summary.js';

export interface TourStage {
  startS: number;
  endS: number;
  caption: string;
  action: () => void;
}

export const JUDGE_TOUR_STAGES: readonly TourStage[] = [
  {
    startS: 0,
    endS: 10,
    caption: 'Same cars, same seed. Two controllers.',
    action: () => {
      store.resetScenario('ns-heavy-tide', 42);
      store.speed.set(5.0);
    },
  },
  {
    startS: 10,
    endS: 25,
    caption: 'Uneven demand: adaptive clears queues faster.',
    action: () => {
      store.speed.set(20.0);
    },
  },
  {
    startS: 25,
    endS: 45,
    caption: emsClearanceCaption,
    action: () => {
      store.speed.set(5.0);
      // The worker spawns the ambulance in *both* twins and submits the request
      // for the adaptive one, so the comparison keeps identical arrivals (§5).
      void store.requestPreemption('NB-TR');
    },
  },
  {
    startS: 45,
    endS: 60,
    caption: 'Muse Spark diagnoses. It can only propose.',
    action: () => {
      // Applied to both twins at the same tick, as every edit must be.
      store.injectIncident('BLOCKED', 'NB-TR', 40.0, 300);
    },
  },
  {
    startS: 60,
    endS: 75,
    caption: 'Safety Kernel rejects unsafe changes.',
    action: () => {
      // Deliberately empty: the counter shown here is the Kernel's own
      // `violationsPrevented`, incremented when a controller asks for something
      // illegal. Bumping a mock number for the camera would be a lie, and the
      // rejections happen on their own during a normal run.
    },
  },
  {
    startS: 75,
    endS: 90,
    caption: 'Measured, with confidence intervals. Ties shown.',
    action: () => {
      store.speed.set(5.0);
    },
  },
];

export class JudgeTourController {
  private timer: number | null = null;
  private currentStageIndex: number = 0;
  private elapsedSeconds: number = 0;
  private paused = false;

  public get isPaused(): boolean {
    return this.paused;
  }

  public start(): void {
    this.stop();
    this.currentStageIndex = 0;
    this.elapsedSeconds = 0;
    this.paused = false;
    this.publishStage(0);
    JUDGE_TOUR_STAGES[0]!.action();

    this.timer = window.setInterval(() => this.advance(1), 1000);
  }

  /** Hold the current beat: the sim keeps running, the narration stops. */
  public togglePause(): void {
    if (this.timer === null) return; // not active
    if (this.paused) {
      this.paused = false;
      this.timer = window.setInterval(() => this.advance(1), 1000);
    } else {
      this.paused = true;
      clearInterval(this.timer);
      this.timer = null;
    }
    this.publishStage(this.currentStageIndex);
  }

  /** Jump to the next stage now; past the last stage, the tour ends. */
  public skip(): void {
    const next = this.currentStageIndex + 1;
    if (next >= JUDGE_TOUR_STAGES.length) {
      this.stop();
      return;
    }
    this.elapsedSeconds = JUDGE_TOUR_STAGES[next]!.startS;
    this.currentStageIndex = next;
    this.publishStage(next);
    JUDGE_TOUR_STAGES[next]!.action();
    // A skip while paused stays paused: skipping is about the *caption*
    // timeline, resuming is an explicit separate press.
  }

  private advance(seconds: number): void {
    if (this.paused) return;
    this.elapsedSeconds += seconds;
    const stage = JUDGE_TOUR_STAGES.find(
      (s) => this.elapsedSeconds >= s.startS && this.elapsedSeconds < s.endS,
    );

    if (stage) {
      const idx = JUDGE_TOUR_STAGES.indexOf(stage);
      if (idx !== this.currentStageIndex) {
        this.currentStageIndex = idx;
        stage.action();
        this.publishStage(idx);
      }
    } else if (this.elapsedSeconds >= 90) {
      this.stop();
    }
  }

  private publishStage(idx: number): void {
    store.judgeTour.set({
      active: true,
      stepIndex: idx,
      caption: JUDGE_TOUR_STAGES[idx]!.caption,
      paused: this.paused,
    });
  }

  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.paused = false;
    store.judgeTour.set({
      active: false,
      stepIndex: 0,
      caption: '',
      paused: false,
    });
  }
}

export const judgeTour = new JudgeTourController();
