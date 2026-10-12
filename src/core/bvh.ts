import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

/**
 * BVH (bounding volume hierarchy) — дерево вложенных коробок над треугольниками. Луч проверяет
 * коробку и спускается только в те, которые пересёк: O(log n) вместо перебора всех треугольников.
 *
 * Подключаем ЛОКАЛЬНО, на конкретные меши, а не патчем прототипов
 * (BufferGeometry.prototype.computeBoundsTree / Mesh.prototype.raycast), как в README библиотеки:
 * глобальный патч меняет raycast у всех мешей приложения, включая чужие, и его не выключить для замера.
 */
export function enableBvh(root: THREE.Object3D): number {
  const t0 = performance.now();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    // indirect: true — дерево хранит свой порядок треугольников и НЕ переставляет индексный буфер.
    // По умолчанию MeshBVH переупорядочивает index: номера треугольников (faceIndex) меняются
    o.geometry.boundsTree = new MeshBVH(o.geometry, { indirect: true });
    o.raycast = acceleratedRaycast;
  });
  return performance.now() - t0;
}

export function disableBvh(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.boundsTree = undefined;
    o.raycast = THREE.Mesh.prototype.raycast; // убрать своё поле — вернуть метод прототипа
  });
}
