import * as THREE from 'three';
import type { Viewer } from './viewer';
import { mmPerPixel } from './scale';

const MARKER_RADIUS_PX = 6;

/**
 * Маркеры зондов в сцене: цветные сферы постоянного экранного размера (как маркер выбора, шаг 6).
 * Цвет маркера = цвет кривой на графике — так связываются точка на детали и линия цикла.
 */
export class ProbeMarkers {
  private group = new THREE.Group();
  private geometry = new THREE.SphereGeometry(1, 16, 12);
  private viewer: Viewer;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
    viewer.scene.add(this.group);
    viewer.onBeforeRender(() => {
      const h = viewer.renderer.domElement.clientHeight;
      for (const m of this.group.children) {
        m.scale.setScalar(MARKER_RADIUS_PX * mmPerPixel(viewer.camera, m.position, h));
      }
    });
  }

  set(probes: Array<{ point: THREE.Vector3; color: string }>) {
    for (const m of this.group.children) ((m as THREE.Mesh).material as THREE.Material).dispose();
    this.group.clear();
    for (const { point, color } of probes) {
      const marker = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color, depthTest: false }));
      marker.position.copy(point);
      marker.renderOrder = 11; // поверх маркера выбора
      this.group.add(marker);
    }
    this.viewer.requestRender();
  }
}
