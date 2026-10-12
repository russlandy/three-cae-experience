import type { Viewer } from './viewer';

/**
 * Шаг при проигрывании — по прошедшему времени от старта, по кругу.
 * Не «+1 за кадр»: тогда скорость зависела бы от частоты экрана (на 144 Гц в 2.4 раза быстрее, чем на 60)
 * и от пропущенных кадров.
 */
export function playbackStep(startStep: number, elapsedMs: number, stepsPerSecond: number, count: number): number {
  return (startStep + Math.floor((elapsedMs * stepsPerSecond) / 1000)) % count;
}

/**
 * Проигрывание шагов времени. Встроено в рендер по требованию так же, как инерция орбиты (шаг 4):
 * пока играем, слушатель onBeforeRender снова запрашивает кадр — цикл крутится; пауза — запросов
 * больше нет, и requestAnimationFrame останавливается сам.
 */
export class Player {
  playing = false;
  stepsPerSecond = 8;

  private startTime = 0;
  private startStep = 0;
  private viewer: Viewer;
  private count: () => number;
  private current: () => number;
  private onStep: (step: number) => void;

  constructor(viewer: Viewer, count: () => number, current: () => number, onStep: (step: number) => void) {
    this.viewer = viewer;
    this.count = count;
    this.current = current;
    this.onStep = onStep;
    viewer.onBeforeRender(() => {
      if (!this.playing) return;
      const step = playbackStep(this.startStep, performance.now() - this.startTime, this.stepsPerSecond, this.count());
      if (step !== this.current()) this.onStep(step);
      viewer.requestRender(); // следующий кадр — пока играем
    });
  }

  play() {
    this.playing = true;
    this.startTime = performance.now();
    this.startStep = this.current();
    this.viewer.requestRender();
  }

  pause() {
    this.playing = false;
  }

  /** Шаг сменили снаружи (ползунок, график) — продолжаем отсчёт уже от него */
  restartFrom(step: number) {
    this.startStep = step;
    this.startTime = performance.now();
  }
}
