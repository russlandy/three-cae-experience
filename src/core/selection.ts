import * as THREE from 'three';
import type { Viewer } from './viewer';
import type { PickResult } from './picking';
import { mmPerPixel } from './scale';

const MARKER_RADIUS_PX = 5;

/**
 * Подсветка результата picking: маркер в точке попадания + выбранный треугольник.
 */
export class Selection {
  private viewer: Viewer;
  private marker: THREE.Mesh;
  private triangle: THREE.Mesh;

  constructor(viewer: Viewer) {
    this.viewer = viewer;

    // Маркер: сфера радиусом 1 мм, масштабируется перед каждым кадром до постоянных 5 px.
    // Без теста глубины и последней — всегда виден, даже если половина сферы ушла под поверхность
    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb020, depthTest: false }),
    );
    this.marker.renderOrder = 10;
    this.marker.visible = false;

    // Треугольник: копия выбранной грани поверх неё. Лежит в той же плоскости — значит, та же
    // глубина и z-fighting. polygonOffset сдвигает его глубину к камере на этапе растеризации
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    this.triangle = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xffb020,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      }),
    );
    this.triangle.visible = false;

    viewer.scene.add(this.marker, this.triangle);

    viewer.onBeforeRender(() => {
      if (!this.marker.visible) return;
      // Постоянный экранный размер: радиус в мм = пиксели × (мм на пиксель на глубине маркера)
      const h = viewer.renderer.domElement.clientHeight;
      this.marker.scale.setScalar(MARKER_RADIUS_PX * mmPerPixel(viewer.camera, this.marker.position, h));
    });
  }

  show(hit: PickResult) {
    this.marker.position.copy(hit.point);
    this.marker.visible = true;

    // Три вершины треугольника — из геометрии детали, в мировые координаты
    const src = hit.mesh.geometry.getAttribute('position');
    const dst = this.triangle.geometry.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    hit.vertices.forEach((index, i) => {
      v.fromBufferAttribute(src, index).applyMatrix4(hit.mesh.matrixWorld);
      dst.setXYZ(i, v.x, v.y, v.z);
    });
    dst.needsUpdate = true; // данные изменились на CPU — перезалить буфер в GPU
    this.triangle.geometry.computeBoundingSphere(); // иначе отсечение по frustum возьмёт старую сферу
    this.triangle.visible = true;

    this.viewer.requestRender();
  }

  clear() {
    this.marker.visible = false;
    this.triangle.visible = false;
    this.viewer.requestRender();
  }
}
