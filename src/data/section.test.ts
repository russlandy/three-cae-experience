import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { planeAt, sectionAxes, sectionOf, sectionRaster, sliceMesh } from './section';

// Габариты демо-пластины: 400 × 12 × 120 мм, лежит на полу
const plateBox = new THREE.Box3(new THREE.Vector3(-200, 0, -60), new THREE.Vector3(200, 12, 60));

describe('planeAt: плоскость среза по оси и доле габарита', () => {
  test('X, 25 % → x = −100; точка x = −150 остаётся (+50), x = 0 отрезана (−100)', () => {
    const plane = planeAt(plateBox, 'x', 0.25);

    expect(plane.distanceToPoint(new THREE.Vector3(-150, 6, 0))).toBeCloseTo(50);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 6, 0))).toBeCloseTo(-100);
  });
});

/** Суммарная длина отрезков сечения: [x1,y1,z1, x2,y2,z2, ...] */
function totalLength(segments: Float32Array) {
  let sum = 0;
  for (let i = 0; i < segments.length; i += 6) {
    sum += Math.hypot(segments[i + 3] - segments[i], segments[i + 4] - segments[i + 1], segments[i + 5] - segments[i + 2]);
  }
  return sum;
}

const planeX0 = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

describe('sliceMesh: сечение треугольной сетки плоскостью → отрезки', () => {
  test('куб 1×1×1 по x = 0 → контур квадрата 1×1, периметр 4', () => {
    const cube = new THREE.BoxGeometry(1, 1, 1);

    expect(totalLength(sliceMesh(cube, planeX0))).toBeCloseTo(4);
  });

  test('ряд вершин ровно на плоскости (коробка 2×1×1 из двух сегментов по X) → тот же периметр 4, без задвоения', () => {
    const box = new THREE.BoxGeometry(2, 1, 1, 2, 1, 1); // вершины при x = −1, 0, 1

    expect(totalLength(sliceMesh(box, planeX0))).toBeCloseTo(4);
  });
});

describe('sectionAxes: оси картинки 2D-сечения', () => {
  test.each([
    ['x', [1, 0, 0]],
    ['y', [0, 1, 0]],
    ['z', [0, 0, 1]],
  ] as const)('%s: u × v смотрит на зрителя (+ось) — картинка не зеркальная', (axis, toViewer) => {
    const { u, v } = sectionAxes(axis);

    const toArray = (p: THREE.Vector3) => p.toArray().map((c) => c + 0); // −0 → 0
    expect(toArray(new THREE.Vector3().crossVectors(u, v))).toEqual(toViewer);
  });

  test('поперечное сечение (X) как вид сбоку: вверх на картинке — вверх в мире (+Y)', () => {
    expect(sectionAxes('x').v.toArray()).toEqual([0, 1, 0]);
  });
});

/** Замкнутый контур из точек [u, v] → отрезки [u1,v1, u2,v2, ...] (порядок отрезков не важен) */
function loop(...pts: Array<[number, number]>): number[] {
  return pts.flatMap(([u, v], i) => [u, v, ...pts[(i + 1) % pts.length]]);
}

describe('sectionRaster: какие ячейки сетки лежат внутри сечения', () => {
  test('квадрат 4×4 с отверстием 2×2 в центре, ячейка 1 мм → 16 ячеек, 12 внутри, отверстие пустое', () => {
    const outer = loop([0, 0], [4, 0], [4, 4], [0, 4]);
    const hole = loop([1, 1], [3, 1], [3, 3], [1, 3]);

    const r = sectionRaster(new Float32Array([...outer, ...hole]), 1);

    expect([r.cols, r.rows]).toEqual([4, 4]);
    // строки сверху вниз, как у картинки
    expect(Array.from(r.inside)).toEqual([
      1, 1, 1, 1,
      1, 0, 0, 1,
      1, 0, 0, 1,
      1, 1, 1, 1,
    ]);
  });
});

describe('sectionOf: деталь + плоскость → сетка сечения и мировые точки её ячеек', () => {
  test('демо-пластина, поперёк шва (X, 50 %), ячейка 1 мм → 120 × 12, все 1440 внутри; левая верхняя — (0, 11.5, 59.5)', () => {
    const plate = new THREE.BoxGeometry(400, 12, 120, 160, 2, 48).translate(0, 6, 0);

    const s = sectionOf([plate], planeAt(plateBox, 'x', 0.5), 'x', 1);

    expect([s.raster.cols, s.raster.rows]).toEqual([120, 12]);
    expect(s.points.length / 3).toBe(1440);
    expect(Array.from(s.points.slice(0, 3)).map((c) => +c.toFixed(3) + 0)).toEqual([0, 11.5, 59.5]);
  });
});
