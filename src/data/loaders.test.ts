import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { describeModel, parseModel, toWorldMm } from './loaders';

/** Все вершины всех мешей группы, округлённые до 0.001 */
const vertices = (root: THREE.Object3D) => {
  const out: number[][] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = (o.geometry as THREE.BufferGeometry).getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      out.push([pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => +v.toFixed(3) + 0));
    }
  });
  return out;
};

const triangle = (...pts: number[][]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  return g;
};

describe('toWorldMm: единицы и оси приводятся к миру (мм, Y вверх) в одном месте', () => {
  test('STL из CAD в сантиметрах, Z вверх: (1, 0, 2) см → (10, 20, 0) мм', () => {
    const root = new THREE.Mesh(triangle([1, 0, 2], [0, 0, 0], [0, 1, 0]));

    const world = toWorldMm(root, { unit: 'cm', zUp: true });

    expect(vertices(world)[0]).toEqual([10, 20, 0]);
  });

  test('glTF в метрах: трансформация узла запекается — вершина (0,0,0) меша, сдвинутого на 1 м по X, → (1000, 0, 0) мм', () => {
    const scene = new THREE.Group();
    const node = new THREE.Group();
    node.position.set(1, 0, 0);
    node.add(new THREE.Mesh(triangle([0, 0, 0], [0.1, 0, 0], [0, 0.1, 0])));
    scene.add(node);

    const world = toWorldMm(scene, { unit: 'm', zUp: false });

    expect(vertices(world)[0]).toEqual([1000, 0, 0]);
  });

  test('смена единиц после загрузки: повторная конвертация того же исходника не накапливается (см, затем дюймы → 25.4 мм)', () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(triangle([1, 0, 0], [0, 0, 0], [0, 1, 0])));

    toWorldMm(source, { unit: 'cm', zUp: false });
    const world = toWorldMm(source, { unit: 'in', zUp: false });

    expect(vertices(world)[0]).toEqual([25.4, 0, 0]);
  });
});

describe('describeModel: что инженер проверяет первым делом', () => {
  test('пластина 400 × 12 × 120 мм (индексированная Box): габариты и 12 треугольников', () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(400, 12, 120)));

    const info = describeModel(group);

    expect([info.size.x, info.size.y, info.size.z]).toEqual([400, 12, 120]);
    expect(info.triangles).toBe(12);
  });

  test('неиндексированная геометрия (как STL): 2 треугольника = 6 вершин', () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(triangle([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0], [0, 1, 0], [0, 0, 1])));

    expect(describeModel(group).triangles).toBe(2);
  });
});

describe('parseModel: формат по расширению и умолчания единиц', () => {
  const asciiStl = `solid plate
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 10 0 0
    vertex 0 10 0
  endloop
endfacet
endsolid plate`;

  test('STL: единиц в формате нет — по умолчанию мм и Z вверх (CAD); геометрия с нормалями', async () => {
    const buffer = new TextEncoder().encode(asciiStl).buffer as ArrayBuffer;

    const model = await parseModel('plate.STL', buffer);

    expect(model.format).toBe('stl');
    expect(model.defaults).toEqual({ unit: 'mm', zUp: true });
    expect(describeModel(model.source).triangles).toBe(1);
    let hasNormals = false;
    model.source.traverse((o) => {
      if (o instanceof THREE.Mesh) hasNormals = !!o.geometry.getAttribute('normal');
    });
    expect(hasNormals).toBe(true);
  });

  test('неизвестное расширение — понятная ошибка', async () => {
    await expect(parseModel('part.step', new ArrayBuffer(0))).rejects.toThrow(/STL.*glTF/);
  });
});
