import * as THREE from 'three';
import type { Viewer } from './viewer';

/**
 * Свет для деталей с обычными материалами (STL, glTF).
 *
 * Полусферический свет — мягкая подсветка без чёрных теней.
 * Направленный «головной» свет едет вместе с камерой: грань, на которую смотришь, всегда освещена.
 * Неподвижное солнце оставило бы обратную сторону детали тёмной при вращении — в CAD так не делают.
 */
export function addLights(viewer: Viewer) {
  viewer.scene.add(new THREE.HemisphereLight(0xffffff, 0x404850, 1.2));

  const head = new THREE.DirectionalLight(0xffffff, 1.6);
  viewer.scene.add(head, head.target);

  viewer.onBeforeRender(() => {
    head.position.copy(viewer.camera.position);
    head.target.position.copy(viewer.target);
  });
}
