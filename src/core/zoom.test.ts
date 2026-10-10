import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from './cameras';
import { zoomAt } from './zoom';

const ndcOf = (camera: THREE.Camera, p: THREE.Vector3) => {
  camera.updateMatrixWorld();
  const v = p.clone().project(camera);
  return [+v.x.toFixed(4), +v.y.toFixed(4)];
};

describe('zoomAt: мировая точка под курсором остаётся под курсором', () => {
  test('орто: кадр 200 мм, курсор (0.5, 0.5) над точкой (50, 50, 0), зум ×0.5 → кадр 100 мм, точка там же', () => {
    const rig = new CameraRig();
    rig.setView('front');
    rig.setOrthoHeight(200);
    const point = new THREE.Vector3(50, 50, 0);
    expect(ndcOf(rig.ortho, point)).toEqual([0.5, 0.5]);

    zoomAt(rig, new THREE.Vector2(0.5, 0.5), 0.5);

    expect(rig.ortho.top - rig.ortho.bottom).toBeCloseTo(100, 6);
    expect(ndcOf(rig.ortho, point)).toEqual([0.5, 0.5]);
  });

  test('перспектива: зум ×0.5 к точке (100, 50, 0) — точка на том же месте экрана, камера к ней вдвое ближе', () => {
    const rig = new CameraRig();
    rig.setProjection('perspective');
    rig.setView('front'); // камера на (0, 0, 1000)
    const point = new THREE.Vector3(100, 50, 0);
    const [x, y] = ndcOf(rig.perspective, point);
    const before = rig.perspective.position.distanceTo(point);

    zoomAt(rig, new THREE.Vector2(x, y), 0.5);

    expect(ndcOf(rig.perspective, point)).toEqual([x, y]);
    expect(rig.perspective.position.distanceTo(point)).toBeCloseTo(before / 2, 3);
  });
});
