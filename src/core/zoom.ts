import * as THREE from 'three';
import type { CameraRig } from './cameras';

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane();
const viewDir = new THREE.Vector3();
const anchor = new THREE.Vector3();
const newTarget = new THREE.Vector3();

/**
 * Зум к точке экрана `ndc` с коэффициентом `factor` (< 1 — приблизить, > 1 — отдалить).
 *
 * Инвариант: мировая точка под курсором остаётся под курсором.
 * Зум к центру — частный случай: ndc = (0, 0).
 */
export function zoomAt(rig: CameraRig, ndc: THREE.Vector2, factor: number) {
  const camera = rig.active;
  camera.updateMatrixWorld();

  // 1. Мировая точка под курсором: луч через курсор ∩ плоскость через точку интереса,
  //    перпендикулярная направлению взгляда
  raycaster.setFromCamera(ndc, camera);
  camera.getWorldDirection(viewDir);
  plane.setFromNormalAndCoplanarPoint(viewDir, rig.target);
  if (!raycaster.ray.intersectPlane(plane, anchor)) return;

  // 2. Масштабирование относительно этой точки: T(anchor) · S(factor) · T(−anchor)
  newTarget.copy(rig.target).sub(anchor).multiplyScalar(factor).add(anchor);

  if (camera instanceof THREE.OrthographicCamera) {
    // Орто: сжимаем кадр и сдвигаем камеру вбок вместе с точкой интереса — глубина не меняется
    rig.setOrthoHeight(rig.orthoHeight * factor);
    camera.position.add(newTarget).sub(rig.target);
  } else {
    // Перспектива: камеру тоже масштабируем относительно anchor — она едет по лучу через курсор.
    // Направление камера → anchor не меняется, значит anchor остаётся в том же пикселе
    camera.position.sub(anchor).multiplyScalar(factor).add(anchor);
  }
  rig.target.copy(newTarget);
}
