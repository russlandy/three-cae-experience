import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { mmPerPixel, niceScaleBar } from './scale';

describe('mmPerPixel', () => {
  test('перспектива: fov 90°, до точки интереса 500 мм, вьюпорт 1000 px → 1 мм/px', () => {
    const camera = new THREE.PerspectiveCamera(90, 1, 1, 10_000);
    camera.position.set(0, 0, 500);
    expect(mmPerPixel(camera, new THREE.Vector3(0, 0, 0), 1000)).toBeCloseTo(1, 6);
  });

  test('орто: высота кадра 500 мм на 500 px → 1 мм/px, от расстояния не зависит', () => {
    const camera = new THREE.OrthographicCamera(-250, 250, 250, -250, 1, 10_000);
    camera.position.set(0, 0, 3000);
    expect(mmPerPixel(camera, new THREE.Vector3(0, 0, 0), 500)).toBeCloseTo(1, 6);
  });
});

describe('niceScaleBar', () => {
  test('0.37 мм/px, не шире 100 px → 20 мм (5·10¹=50 мм уже 135 px), ширина 20/0.37 px', () => {
    const bar = niceScaleBar(0.37, 100);
    expect(bar.mm).toBe(20);
    expect(bar.px).toBeCloseTo(54.054, 3);
  });
});
