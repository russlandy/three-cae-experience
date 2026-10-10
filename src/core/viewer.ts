import * as THREE from 'three';
import { CameraRig } from './cameras';

/**
 * Рендерер + сцена + рендер по требованию.
 *
 * Кадр рисуется только после requestRender(). Несколько запросов за один кадр
 * склеиваются в одну отрисовку. В покое requestAnimationFrame не крутится вообще.
 */
export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** Орто + перспектива с общей точкой интереса (core/cameras.ts) */
  readonly rig = new CameraRig();

  /** Сколько кадров реально отрисовано с момента старта — для проверки, что в покое 0 */
  renderCount = 0;

  private canvas: HTMLCanvasElement;
  private renderRequested = false;
  private renderListeners: Array<() => void> = [];
  private beforeRenderListeners: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x1a1d21);

    // Следим за размером самого канваса, а не окна: колонка grid может
    // измениться без события window.resize (например, при сворачивании панели).
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /** Активная камера */
  get camera() {
    return this.rig.active;
  }

  /** Точка интереса */
  get target() {
    return this.rig.target;
  }

  /** Главный вход: что-то изменилось — надо перерисовать */
  requestRender() {
    if (this.renderRequested) return;
    this.renderRequested = true;
    requestAnimationFrame(this.render);
  }

  /** Подписка на «кадр отрисован»: HTML-слои, которые зависят от камеры, и счётчики */
  onRender(listener: () => void) {
    this.renderListeners.push(listener);
  }

  /**
   * Подписка на «сейчас будет кадр»: анимации без внешних событий (инерция орбиты).
   * Если слушатель здесь снова вызовет requestRender(), будет запланирован следующий кадр.
   */
  onBeforeRender(listener: () => void) {
    this.beforeRenderListeners.push(listener);
  }

  private render = () => {
    // Флаг сбрасывается ДО слушателей: запрос из onBeforeRender должен запланировать новый кадр
    this.renderRequested = false;
    for (const listener of this.beforeRenderListeners) listener();
    this.renderer.render(this.scene, this.camera);
    this.renderCount++;
    for (const listener of this.renderListeners) listener();
  };

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / h);
    this.requestRender();
  }
}
