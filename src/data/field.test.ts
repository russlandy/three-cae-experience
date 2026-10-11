import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { generateField, seamFromBox, valueAt, type FieldParams } from './field';

// Шов вдоль X: от −120 до 120 мм, источник проходит его за 25 шагов (по 10 мм), потом 10 шагов остывания
const params: FieldParams = {
  seam: { start: new THREE.Vector3(-120, 0, 0), end: new THREE.Vector3(120, 0, 0) },
  travelSteps: 25,
  cooldownSteps: 10,
  sigma: 18,
  peak: 1800,
  ambient: 20,
  cooling: 0.82,
};

const positions = (...pts: number[][]) => new Float32Array(pts.flat());

describe('generateField: движущийся источник тепла по шву', () => {
  test('шаг 0: вершина под источником — 20 + 1800 = 1820 °C, вершина в 200 мм — 20 °C', () => {
    const field = generateField(positions([-120, 0, 0], [80, 0, 0]), params);

    expect(field.steps[0][0]).toBeCloseTo(1820, 3);
    expect(field.steps[0][1]).toBeCloseTo(20, 3);
  });

  test('термический цикл в середине шва: подъём до шага 12 (источник над точкой), затем монотонный спад, в конце ещё тёплая', () => {
    const field = generateField(positions([0, 0, 0]), params);
    const cycle = field.steps.map((T) => T[0]);

    const peakStep = cycle.indexOf(Math.max(...cycle));
    expect(peakStep).toBe(12);
    for (let k = 1; k <= 12; k++) expect(cycle[k]).toBeGreaterThan(cycle[k - 1]);
    for (let k = 13; k < cycle.length; k++) expect(cycle[k]).toBeLessThan(cycle[k - 1]);
    expect(cycle[cycle.length - 1]).toBeGreaterThan(20 + 1);
  });

  test('тепло не накапливается выше пика источника: нигде и никогда не больше 20 + 1800 °C', () => {
    const xs = Array.from({ length: 25 }, (_, i) => [-120 + i * 10, 0, 0]);
    const field = generateField(positions(...xs), params);

    const max = Math.max(...field.steps.map((T) => Math.max(...T)));
    expect(max).toBeLessThanOrEqual(1820 + 1e-3);
  });

  test('остывание после ухода источника: избыток над ambient за шаг умножается на cooling = 0.82', () => {
    const field = generateField(positions([0, 0, 0]), params);
    const [a, b] = [field.steps[30][0] - 20, field.steps[31][0] - 20];

    expect(b / a).toBeCloseTo(0.82, 5);
  });
});

describe('valueAt: значение поля в точке треугольника', () => {
  test('вершины 100, 200, 400 °C, барицентрия (0.5, 0.25, 0.25) → 200 °C', () => {
    const T = new Float32Array([0, 100, 200, 400]);
    expect(valueAt(T, [1, 2, 3], new THREE.Vector3(0.5, 0.25, 0.25))).toBeCloseTo(200, 6);
  });
});

describe('seamFromBox: шов по габаритам детали', () => {
  test('пластина 400 × 12 × 120 на полу: шов вдоль X по центру верха, 10 % отступ → от (−160, 12, 0) до (160, 12, 0)', () => {
    const box = new THREE.Box3(new THREE.Vector3(-200, 0, -60), new THREE.Vector3(200, 12, 60));
    const { start, end } = seamFromBox(box);
    expect(start.toArray()).toEqual([-160, 12, 0]);
    expect(end.toArray()).toEqual([160, 12, 0]);
  });

  test('деталь длиннее по Z: шов вдоль Z', () => {
    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 20, 500));
    const { start, end } = seamFromBox(box);
    expect(start.toArray()).toEqual([50, 20, 50]);
    expect(end.toArray()).toEqual([50, 20, 450]);
  });
});
