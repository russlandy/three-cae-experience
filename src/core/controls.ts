import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Viewer } from './viewer';
import { zoomAt } from './zoom';

export type ZoomMode = 'cursor' | 'center';

/**
 * Навигация: орбита и панорамирование — OrbitControls, зум колесом — свой (core/zoom.ts).
 *
 * Инерция совмещена с рендером по требованию: перед каждым кадром вызывается controls.update().
 * Пока камера по инерции движется, update() шлёт 'change' → requestRender() → следующий кадр.
 * Инерция затухла — событий нет, цикл останавливается сам.
 */
export class Navigation {
  readonly controls: OrbitControls;
  zoomMode: ZoomMode = 'cursor';

  private viewer: Viewer;
  private ndc = new THREE.Vector2();

  constructor(viewer: Viewer, canvas: HTMLCanvasElement) {
    this.viewer = viewer;
    this.controls = new OrbitControls(viewer.camera, canvas);
    // Одна точка интереса на всех: контролы вращают вокруг той же точки, что и rig
    this.controls.target = viewer.target;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    // Зум свой: OrbitControls зумит орто через camera.zoom, а у нас масштаб — высота кадра
    this.controls.enableZoom = false;
    this.controls.screenSpacePanning = true;

    this.controls.addEventListener('change', () => viewer.requestRender());
    viewer.onBeforeRender(() => this.controls.update());

    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /** После смены проекции контролы должны управлять новой активной камерой */
  syncCamera() {
    this.controls.object = this.viewer.camera;
    this.viewer.requestRender();
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Экспонента от deltaY: одинаково плавно для колеса (±100) и тачпада (±1..10)
    const factor = Math.pow(1.0015, e.deltaY);

    if (this.zoomMode === 'cursor') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      this.ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1, // Y в пикселях вниз, в NDC вверх
      );
    } else {
      this.ndc.set(0, 0);
    }

    zoomAt(this.viewer.rig, this.ndc, factor);
    this.viewer.requestRender();
  };
}
