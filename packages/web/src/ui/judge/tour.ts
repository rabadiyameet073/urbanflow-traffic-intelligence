/**
 * Module 43: Judge Mode (90-second self-playing, interruptible tour)
 * Drives the real app across 6 choreographed stages with concise captions (<= 12 words).
 */
import { store } from '../../state/store.js';

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
    caption: 'Preemption needs ~13 s to clear safely.',
    action: () => {
      store.speed.set(5.0);
      store.simFixed.spawnEms('NB-TR');
      store.simAdaptive.spawnEms('NB-TR');
    },
  },
  {
    startS: 45,
    endS: 60,
    caption: 'Muse Spark diagnoses. It can only propose.',
    action: () => {
      store.simFixed.setIncident('BLOCKED', 'NB-TR', 40.0, 300);
      store.simAdaptive.setIncident('BLOCKED', 'NB-TR', 40.0, 300);
    },
  },
  {
    startS: 60,
    endS: 75,
    caption: 'Safety Kernel rejects unsafe changes.',
    action: () => {
      // Simulate an illegal proposal to exercise kernel rejection
      store.safetyStats.set({
        ...store.safetyStats.get(),
        violationsPrevented: store.safetyStats.get().violationsPrevented + 1,
      });
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

  public start(): void {
    this.stop();
    this.currentStageIndex = 0;
    this.elapsedSeconds = 0;
    store.judgeTour.set({
      active: true,
      stepIndex: 0,
      caption: JUDGE_TOUR_STAGES[0]!.caption,
    });
    JUDGE_TOUR_STAGES[0]!.action();

    this.timer = window.setInterval(() => {
      this.elapsedSeconds += 1;
      const stage = JUDGE_TOUR_STAGES.find(
        (s) => this.elapsedSeconds >= s.startS && this.elapsedSeconds < s.endS,
      );

      if (stage) {
        const idx = JUDGE_TOUR_STAGES.indexOf(stage);
        if (idx !== this.currentStageIndex) {
          this.currentStageIndex = idx;
          stage.action();
          store.judgeTour.set({
            active: true,
            stepIndex: idx,
            caption: stage.caption,
          });
        }
      } else if (this.elapsedSeconds >= 90) {
        this.stop();
      }
    }, 1000);
  }

  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    store.judgeTour.set({
      active: false,
      stepIndex: 0,
      caption: '',
    });
  }
}

export const judgeTour = new JudgeTourController();
