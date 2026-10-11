import * as THREE from 'three';

/**
 * Синтетическое поле температур: физику не считаем, имитируем движущийся источник тепла по шву.
 */

export interface Seam {
  start: THREE.Vector3;
  end: THREE.Vector3;
}

export interface FieldParams {
  seam: Seam;
  /** За сколько шагов источник проходит шов от start до end */
  travelSteps: number;
  /** Сколько шагов остывания после того, как источник ушёл */
  cooldownSteps: number;
  /** Размер пятна нагрева, мм */
  sigma: number;
  /** Нагрев в центре пятна над ambient, °C */
  peak: number;
  /** Температура окружающей среды, °C */
  ambient: number;
  /** Доля избыточного тепла, остающаяся к следующему шагу (0..1) */
  cooling: number;
}

export interface Field {
  /** Значения по вершинам на каждом шаге времени: steps[шаг][вершина], °C */
  steps: Float32Array[];
}

/** positions — xyz вершин подряд (как в буфере position), в мировых мм */
export function generateField(positions: Float32Array, p: FieldParams): Field {
  const n = positions.length / 3;
  const total = p.travelSteps + p.cooldownSteps;
  const steps: Float32Array[] = [];
  const source = new THREE.Vector3();
  const v = new THREE.Vector3();
  const twoSigma2 = 2 * p.sigma * p.sigma;

  let prev = new Float32Array(n).fill(p.ambient);
  for (let k = 0; k < total; k++) {
    const T = new Float32Array(n);
    const heating = k < p.travelSteps; // на шагах остывания источника нет
    source.lerpVectors(p.seam.start, p.seam.end, k / (p.travelSteps - 1));
    for (let i = 0; i < n; i++) {
      // Остаточное тепло: избыток над ambient экспоненциально затухает
      const residual = (prev[i] - p.ambient) * p.cooling;
      let hot = 0;
      if (heating) {
        v.fromArray(positions, i * 3);
        hot = p.peak * Math.exp(-v.distanceToSquared(source) / twoSigma2);
      }
      // max, а не сумма: при сумме тепло от соседних положений источника накапливается
      // геометрическим рядом и пик уходит к ~5000 °C (см. docs/steps/07-field.md).
      // С max источник нагревает точку максимум до своей температуры, а след остывает сам
      T[i] = p.ambient + Math.max(residual, hot);
    }
    steps.push(T);
    prev = T;
  }
  return { steps };
}

/**
 * Значение поля в точке треугольника: веса вершин — барицентрические координаты попадания (шаг 6).
 * Ровно так GPU интерполирует varying между вершинами — значит, совпадёт с нарисованным цветом.
 */
export function valueAt(T: Float32Array, [a, b, c]: [number, number, number], bary: THREE.Vector3): number {
  return T[a] * bary.x + T[b] * bary.y + T[c] * bary.z;
}

/** Шов по габаритам детали: вдоль длинной горизонтальной оси, по центру верхней поверхности, 10 % от краёв */
export function seamFromBox(box: THREE.Box3): Seam {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const axis = size.x >= size.z ? 'x' : 'z';
  const start = new THREE.Vector3(center.x, box.max.y, center.z);
  const end = start.clone();
  start[axis] = box.min[axis] + size[axis] * 0.1;
  end[axis] = box.max[axis] - size[axis] * 0.1;
  return { start, end };
}
