import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { coolingTime, cycleAt } from './cycle';

describe('cycleAt: термический цикл в точке — значение по всем шагам', () => {
  test('3 вершины, 2 шага, веса 0.5/0.25/0.25 → [200, 50]', () => {
    const steps = [new Float32Array([100, 200, 400]), new Float32Array([20, 100, 60])];

    const curve = cycleAt(steps, [0, 1, 2], new THREE.Vector3(0.5, 0.25, 0.25));

    // шаг 0: 50 + 50 + 100 = 200; шаг 1: 10 + 25 + 15 = 50
    expect(Array.from(curve)).toEqual([200, 50]);
  });
});

describe('coolingTime: t8/5 — время остывания с 800 до 500 °C, в шагах', () => {
  test('[20, 1000, 900, 700, 600, 400, 300] → 800 °C на шаге 2.5, 500 °C на 4.5 → 2 шага (нагрев через 800 не считается)', () => {
    const curve = new Float32Array([20, 1000, 900, 700, 600, 400, 300]);

    expect(coolingTime(curve, 800, 500)).toBeCloseTo(2);
  });

  test('не остыла ниже 500 °C до конца расчёта → null', () => {
    expect(coolingTime(new Float32Array([20, 1000, 900, 700, 600]), 800, 500)).toBeNull();
  });

  test('не нагревалась до 800 °C (далеко от шва) → null', () => {
    expect(coolingTime(new Float32Array([20, 300, 250, 200]), 800, 500)).toBeNull();
  });
});
