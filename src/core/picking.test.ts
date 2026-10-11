import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { pick, pixelToNdc } from './picking';

describe('pixelToNdc: пиксель страницы → NDC канваса', () => {
  // Канвас 800 × 600, сдвинут на странице на (100, 50)
  const rect = { left: 100, top: 50, width: 800, height: 600 };

  test.each([
    ['левый верхний угол', 100, 50, [-1, 1]],
    ['центр', 500, 350, [0, 0]],
    ['правый нижний угол', 900, 650, [1, -1]],
    ['четверть от левого верхнего', 300, 200, [-0.5, 0.5]],
  ])('%s', (_, x, y, expected) => {
    const ndc = pixelToNdc(x as number, y as number, rect);
    expect([ndc.x, ndc.y]).toEqual(expected);
  });
});

const round = (v: THREE.Vector3) => [v.x, v.y, v.z].map((c) => +c.toFixed(3) + 0);

describe('pick: луч через пиксель → что под курсором', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 10_000);
  camera.position.set(0, 0, 1000);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  test('центр экрана → передняя грань пластины 400×12×120: точка (0,0,60), нормаль (0,0,1), 940 мм', () => {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(400, 12, 120));
    plate.updateMatrixWorld();

    const hit = pick(camera, new THREE.Vector2(0, 0), [plate])!;

    expect(round(hit.point)).toEqual([0, 0, 60]);
    expect(round(hit.normal)).toEqual([0, 0, 1]);
    expect(hit.distance).toBeCloseTo(940, 3);
  });

  test('нормаль в мировых координатах при неравномерном масштабе: (1,1,0)/√2, масштаб Y×2 → (0.894, 0.447, 0)', () => {
    // Треугольник в плоскости x + y = 0, нормаль (1, 1, 0)/√2
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-100, 100, -100, -100, 100, 100, 100, -100, 0], 3));
    const mesh = new THREE.Mesh(g);
    mesh.scale.set(1, 2, 1);
    mesh.updateMatrixWorld();
    const cam = new THREE.PerspectiveCamera(45, 1, 1, 10_000);
    cam.position.set(1000, 500, 0);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();

    const hit = pick(cam, new THREE.Vector2(0, 0), [mesh])!;

    expect(round(hit.normal)).toEqual([0.894, 0.447, 0]);
  });

  test('мимо детали → null', () => {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(400, 12, 120));
    plate.updateMatrixWorld();

    expect(pick(camera, new THREE.Vector2(0.9, 0.9), [plate])).toBeNull();
  });
});

describe('pick со срезом: попадания в отрезанную часть пропускаются', () => {
  test('срез z > 0 → передняя грань (z = 60) скрыта, луч доходит до задней изнутри: (0,0,−60), 1060 мм', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 10_000);
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    // DoubleSide — как у детали со срезом: иначе внутреннюю сторону грани луч не видит
    const plate = new THREE.Mesh(new THREE.BoxGeometry(400, 12, 120), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    plate.updateMatrixWorld();
    const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); // остаётся z ≤ 0

    const hit = pick(camera, new THREE.Vector2(0, 0), [plate], clip)!;

    expect(round(hit.point)).toEqual([0, 0, -60]);
    expect(hit.distance).toBeCloseTo(1060, 3);
  });
});
