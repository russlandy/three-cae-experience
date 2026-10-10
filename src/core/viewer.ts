import * as THREE from 'three';

/**
 * Рендерер + сцена + рендер по требованию.
 *
 * Кадр рисуется только после requestRender(). Несколько запросов за один кадр
 * склеиваются в одну отрисовку. В покое requestAnimationFrame не крутится вообще.
 */
export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  // Временная камера: настоящие орто/перспектива появятся на шаге 3 (core/cameras.ts)
  camera: THREE.PerspectiveCamera;
  /** Точка интереса: куда смотрит камера. Шаг 4 отдаст её во владение контролам орбиты */
  readonly target = new THREE.Vector3(0, 0, 0);

  /** Сколько кадров реально отрисовано с момента старта — для проверки, что в покое 0 */
  renderCount = 0;

  private canvas: HTMLCanvasElement;
  private renderRequested = false;
  private renderListeners: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x1a1d21);

    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 10_000);
    this.camera.position.set(500, 400, 650);
    this.camera.lookAt(this.target);

    // Следим за размером самого канваса, а не окна: колонка grid может
    // измениться без события window.resize (например, при сворачивании панели).
    new ResizeObserver(() => this.resize()).observe(canvas);
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

  private render = () => {
    this.renderRequested = false;
    this.renderer.render(this.scene, this.camera);
    this.renderCount++;
    for (const listener of this.renderListeners) listener();
  };

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }
}
