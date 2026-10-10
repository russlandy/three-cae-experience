import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from './cameras';

describe('CameraRig: переключение проекции', () => {
  test('перспектива → орто: высота кадра орто = видимой высоте в точке интереса (d 1000, fov 45° → 828.427 мм)', () => {
    const rig = new CameraRig();
    rig.setProjection('perspective');
    rig.perspective.position.set(0, 0, 1000);
    rig.target.set(0, 0, 0);

    rig.setProjection('ortho');

    expect(rig.active).toBe(rig.ortho);
    expect(rig.ortho.top - rig.ortho.bottom).toBeCloseTo(828.427, 3);
  });

  test('орто → перспектива: расстояние берётся из высоты кадра (828.427 мм → 1000 мм), направление взгляда сохраняется', () => {
    const rig = new CameraRig(); // по умолчанию орто
    rig.ortho.position.set(0, 0, 300); // в орто расстояние не влияет на картинку
    rig.target.set(0, 0, 0);
    rig.setOrthoHeight(828.427);

    rig.setProjection('perspective');

    expect(rig.active).toBe(rig.perspective);
    const p = rig.perspective.position;
    expect([p.x, p.y, p.z].map((v) => +v.toFixed(2))).toEqual([0, 0, 1000]);
  });
});

const round = (v: THREE.Vector3) => [v.x, v.y, v.z].map((c) => +c.toFixed(2));

describe('CameraRig: свежесозданный', () => {
  test('вид + fit + переход в перспективу без ручной настройки камер: камера не схлопывается в точку интереса', () => {
    const rig = new CameraRig();
    rig.setView('iso');
    rig.fit(new THREE.Box3(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 100, 50)));

    rig.setProjection('perspective');

    expect(rig.perspective.position.distanceTo(rig.target)).toBeGreaterThan(100);
  });
});

describe('CameraRig: стандартные виды', () => {
  /** Куда на экране (NDC) попадает мировая точка */
  const ndcOf = (rig: CameraRig, x: number, y: number, z: number) => {
    rig.active.updateMatrixWorld();
    const p = new THREE.Vector3(x, y, z).project(rig.active);
    return { x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
  };

  test.each(['ortho', 'perspective'] as const)('%s, вид сверху: +X вправо, +Z вниз экрана, расстояние до точки интереса сохранено', (projection) => {
    const rig = new CameraRig();
    rig.setProjection(projection);
    rig.active.position.set(300, 400, 0);

    rig.setView('top');

    expect(rig.active.position.distanceTo(rig.target)).toBeCloseTo(500, 3);
    const px = ndcOf(rig, 100, 0, 0);
    const pz = ndcOf(rig, 0, 0, 100);
    expect(px.x).toBeGreaterThan(0);
    expect(px.y).toBeCloseTo(0, 2);
    expect(pz.x).toBeCloseTo(0, 2);
    expect(pz.y).toBeLessThan(0);
  });

  test('вид спереди: смотрим вдоль −Z, +X вправо, +Y вверх', () => {
    const rig = new CameraRig();
    rig.active.position.set(300, 400, 0);

    rig.setView('front');

    const p = rig.active.position;
    expect(round(p)).toEqual([0, 0, 500]);
    expect(ndcOf(rig, 100, 0, 0).x).toBeGreaterThan(0);
    expect(ndcOf(rig, 0, 100, 0).y).toBeGreaterThan(0);
  });
});

describe('CameraRig: fit to object', () => {
  // Куб 200 мм с центром (100, 100, 0): радиус описанной сферы 100·√3 = 173.205
  const box = new THREE.Box3(new THREE.Vector3(0, 0, -100), new THREE.Vector3(200, 200, 100));

  test('перспектива, aspect 1: точка интереса в центр, камера на 1.2·r / sin(22.5°) = 543.13 мм по прежнему направлению', () => {
    const rig = new CameraRig();
    rig.setProjection('perspective');
    rig.perspective.position.set(0, 0, 1000);
    rig.perspective.lookAt(0, 0, 0);

    rig.fit(box);

    expect(round(rig.target)).toEqual([100, 100, 0]);
    expect(round(rig.perspective.position)).toEqual([100, 100, 543.13]);
  });

  test('орто, вьюпорт вдвое выше, чем шире (aspect 0.5): высота кадра = 2·1.2·r / 0.5 = 831.38 мм', () => {
    const rig = new CameraRig();
    rig.setAspect(0.5);
    rig.ortho.position.set(0, 0, 1000);

    rig.fit(box);

    expect(round(rig.target)).toEqual([100, 100, 0]);
    expect(rig.ortho.top - rig.ortho.bottom).toBeCloseTo(831.38, 2);
    expect(rig.ortho.right - rig.ortho.left).toBeCloseTo(415.69, 2);
  });

  test.each([
    ['деталь 1 мм', 1],
    ['пластина 400 мм', 400],
    ['конструкция 20 м', 20_000],
  ])('near/far после fit (%s): объект целиком между near и far, far/near ≤ 10⁴', (_, size) => {
    const rig = new CameraRig();
    rig.setProjection('perspective');
    rig.perspective.position.set(0, 0, 1000);
    const half = size / 2;
    const b = new THREE.Box3(new THREE.Vector3(-half, -half, -half), new THREE.Vector3(half, half, half));
    const r = (size / 2) * Math.sqrt(3);

    rig.fit(b);

    for (const camera of [rig.perspective, rig.ortho]) {
      const d = camera.position.distanceTo(rig.target);
      expect(camera.near).toBeLessThan(d - r);
      expect(camera.far).toBeGreaterThan(d + r);
      expect(camera.far / camera.near).toBeLessThanOrEqual(1e4);
    }
  });
});
