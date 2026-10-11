import * as THREE from 'three';

/**
 * Срез и сечение: чистая геометрия без рендера.
 * Плоскость в соглашении three: расстояние d(p) = n·p + constant; d ≥ 0 — часть остаётся, d < 0 — отрезана.
 */

export type Axis = 'x' | 'y' | 'z';

/**
 * Плоскость поперёк оси на доле fraction (0..1) габарита. Отрезается часть с бо́льшей координатой —
 * та, что ближе к камере в изометрии и в стандартных видах, поэтому срез сразу виден.
 */
export function planeAt(box: THREE.Box3, axis: Axis, fraction: number, target = new THREE.Plane()): THREE.Plane {
  const position = THREE.MathUtils.lerp(box.min[axis], box.max[axis], fraction);
  target.normal.set(0, 0, 0)[axis] = -1; // нормаль смотрит в оставшуюся часть
  target.constant = position; // d = −x + x₀ ≥ 0  ⇔  x ≤ x₀
  return target;
}

/**
 * Сечение треугольной сетки плоскостью: отрезки [x1,y1,z1, x2,y2,z2, ...] в координатах геометрии.
 * В каждом треугольнике ищем рёбра, концы которых по разные стороны плоскости, и точку пересечения
 * на ребре. Вершину ровно на плоскости (d = 0) всегда относим к одной стороне («остаётся»).
 * Наивная проверка «d[a]·d[b] < 0» при срезе ровно по ряду вершин (у демо-пластины на 50 % так и есть)
 * не находит ни одного пересечения — сечение пропадает целиком.
 */
export function sliceMesh(geometry: THREE.BufferGeometry, plane: THREE.Plane): Float32Array {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangles = (index ? index.count : pos.count) / 3;
  const vertex = (k: number) => (index ? index.getX(k) : k);

  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const d = [0, 0, 0];
  const out: number[] = [];
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      p[k].fromBufferAttribute(pos, vertex(t * 3 + k));
      d[k] = plane.distanceToPoint(p[k]);
    }
    for (let k = 0; k < 3; k++) {
      const a = k;
      const b = (k + 1) % 3;
      if (d[a] >= 0 === d[b] >= 0) continue; // ребро целиком с одной стороны
      const s = d[a] / (d[a] - d[b]); // доля пути от a к b, где d = 0
      out.push(
        p[a].x + (p[b].x - p[a].x) * s,
        p[a].y + (p[b].y - p[a].y) * s,
        p[a].z + (p[b].z - p[a].z) * s,
      );
    }
    // Смена знака — всегда на двух рёбрах из трёх (или ни на одном): ровно одна пара точек
  }
  return new Float32Array(out);
}

/**
 * Оси картинки 2D-сечения в мире: u — вправо, v — вверх. Смотрим со стороны отрезанной части, как
 * камера в стандартном виде: X — как «Сбоку», Z — как «Спереди», Y — как «Сверху».
 * u × v = +ось (на зрителя) — иначе картинка была бы зеркальной.
 */
export function sectionAxes(axis: Axis): { u: THREE.Vector3; v: THREE.Vector3 } {
  switch (axis) {
    case 'x':
      return { u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, 1, 0) };
    case 'y':
      return { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) };
    case 'z':
      return { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) };
  }
}

export interface SectionRaster {
  /** Левый верхний угол сетки в координатах картинки (u, v), мм */
  uMin: number;
  vMax: number;
  cellMm: number;
  cols: number;
  rows: number;
  /** 1 — центр ячейки внутри сечения; строки сверху вниз, как у картинки */
  inside: Uint8Array;
}

/**
 * Заливка сечения строками (scanline) по правилу чётности: на горизонтали через центры ячеек
 * находим точки пересечения с контуром, сортируем, внутри — между 1-й и 2-й, 3-й и 4-й, ...
 * Отверстия получаются сами: их контур добавляет ещё пару пересечений.
 * segments — отрезки [u1,v1, u2,v2, ...] в мм; порядок и направление отрезков не важны.
 */
export function sectionRaster(segments: Float32Array, cellMm: number): SectionRaster {
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < segments.length; i += 2) {
    uMin = Math.min(uMin, segments[i]);
    uMax = Math.max(uMax, segments[i]);
    vMin = Math.min(vMin, segments[i + 1]);
    vMax = Math.max(vMax, segments[i + 1]);
  }
  if (!(uMax > uMin && vMax > vMin)) return { uMin: 0, vMax: 0, cellMm, cols: 0, rows: 0, inside: new Uint8Array(0) };

  const cols = Math.max(1, Math.ceil((uMax - uMin) / cellMm - 1e-6));
  const rows = Math.max(1, Math.ceil((vMax - vMin) / cellMm - 1e-6));
  const inside = new Uint8Array(cols * rows);
  const crossings: number[] = [];

  for (let row = 0; row < rows; row++) {
    const v = vMax - (row + 0.5) * cellMm; // центр строки
    crossings.length = 0;
    for (let i = 0; i < segments.length; i += 4) {
      const [u1, v1, u2, v2] = [segments[i], segments[i + 1], segments[i + 2], segments[i + 3]];
      // Полуоткрытое правило (v1 > v) !== (v2 > v): общая вершина двух отрезков считается один раз,
      // горизонтальные отрезки не считаются вовсе
      if (v1 > v === v2 > v) continue;
      crossings.push(u1 + ((v - v1) / (v2 - v1)) * (u2 - u1));
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      // ячейки, центры которых между crossings[k] и crossings[k+1]
      const from = Math.max(0, Math.ceil((crossings[k] - uMin) / cellMm - 0.5));
      const to = Math.min(cols - 1, Math.floor((crossings[k + 1] - uMin) / cellMm - 0.5));
      for (let col = from; col <= to; col++) inside[row * cols + col] = 1;
    }
  }
  return { uMin, vMax, cellMm, cols, rows, inside };
}

export interface Section {
  raster: SectionRaster;
  /** Мировые координаты центров ячеек внутри сечения: xyz подряд */
  points: Float32Array;
  /** Для каждой точки — номер её ячейки в raster (row * cols + col) */
  cells: Uint32Array;
}

/**
 * Сечение детали плоскостью: контур (sliceMesh) → в координаты картинки (u, v) → заливка → обратно в мир.
 * Геометрии — в мировых мм (ADR 0005), поэтому матрицы мешей не нужны.
 */
export function sectionOf(geometries: THREE.BufferGeometry[], plane: THREE.Plane, axis: Axis, cellMm: number): Section {
  const { u: U, v: V } = sectionAxes(axis);

  const contour3 = geometries.map((g) => sliceMesh(g, plane));
  const total = contour3.reduce((n, s) => n + s.length, 0);
  const contour2 = new Float32Array((total / 3) * 2);
  const p = new THREE.Vector3();
  let j = 0;
  for (const s of contour3) {
    for (let i = 0; i < s.length; i += 3) {
      p.fromArray(s, i);
      contour2[j++] = p.dot(U); // проекция на оси картинки
      contour2[j++] = p.dot(V);
    }
  }

  const raster = sectionRaster(contour2, cellMm);
  const count = raster.inside.reduce((n, x) => n + x, 0);
  const points = new Float32Array(count * 3);
  const cells = new Uint32Array(count);
  // Точка плоскости, ближайшая к началу координат: n·p + c = 0 при p = −c·n
  const origin = plane.normal.clone().multiplyScalar(-plane.constant);
  let k = 0;
  for (let cell = 0; cell < raster.inside.length; cell++) {
    if (!raster.inside[cell]) continue;
    const u = raster.uMin + ((cell % raster.cols) + 0.5) * cellMm;
    const v = raster.vMax - (Math.floor(cell / raster.cols) + 0.5) * cellMm;
    p.copy(origin).addScaledVector(U, u).addScaledVector(V, v);
    p.toArray(points, k * 3);
    cells[k++] = cell;
  }
  return { raster, points, cells };
}
