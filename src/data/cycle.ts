import type * as THREE from 'three';
import { valueAt } from './field';

/**
 * Термический цикл: температура одной точки детали по всем шагам времени.
 * Точка — попадание луча: три вершины треугольника и барицентрические веса (шаг 6),
 * значение — та же интерполяция, что у GPU, на каждом шаге.
 */
export function cycleAt(
  steps: Float32Array[],
  vertices: [number, number, number],
  bary: THREE.Vector3,
): Float32Array {
  return Float32Array.from(steps, (T) => valueAt(T, vertices, bary));
}

/**
 * Время остывания от `from` до `to` °C (для стали — t8/5: с 800 до 500 °C), в шагах времени.
 * Ищем только после пика: при нагреве кривая тоже проходит через 800 °C, но это не остывание.
 * Момент пересечения — линейная интерполяция между соседними шагами.
 * null — точка не нагрелась выше `from` или не успела остыть до `to` до конца расчёта.
 */
export function coolingTime(curve: Float32Array, from: number, to: number): number | null {
  let peak = 0;
  for (let k = 1; k < curve.length; k++) if (curve[k] > curve[peak]) peak = k;
  if (curve[peak] < from) return null;

  const crossing = (level: number) => {
    for (let k = peak; k + 1 < curve.length; k++) {
      if (curve[k] >= level && curve[k + 1] < level) return k + (curve[k] - level) / (curve[k] - curve[k + 1]);
    }
    return null;
  };
  const t1 = crossing(from);
  const t2 = crossing(to);
  return t1 != null && t2 != null ? t2 - t1 : null;
}
