import { describe, expect, test } from 'vitest';
import { playbackStep } from './playback';

describe('playbackStep: шаг по прошедшему времени, а не +1 за кадр', () => {
  test('старт 40 из 45, 10 шагов/с, прошло 750 мс → 47 → по кругу → 2', () => {
    expect(playbackStep(40, 750, 10, 45)).toBe(2);
  });

  test('прошло 99 мс при 10 шагах/с — ещё не время → тот же шаг 40', () => {
    expect(playbackStep(40, 99, 10, 45)).toBe(40);
  });
});
