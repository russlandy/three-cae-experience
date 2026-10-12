import { describe, expect, test } from 'vitest';
import { stepAtX } from './chart';

describe('stepAtX: клик по графику → шаг времени', () => {
  const plot = { left: 40, width: 440 };

  test.each([
    ['левый край области графика', 40, 0],
    ['середина: 220/440 · 44', 260, 22],
    ['правый край', 480, 44],
    ['левее графика (подписи оси) — прижать к 0', 10, 0],
    ['правее графика — прижать к 44', 600, 44],
  ])('%s → %i', (_, x, step) => {
    expect(stepAtX(x as number, plot, 45)).toBe(step);
  });
});
