import * as THREE from 'three';

export type Projection = 'ortho' | 'perspective';
export type ViewName = 'top' | 'front' | 'side' | 'iso';

/** Направление от точки интереса к камере для стандартных видов */
const VIEW_DIRECTIONS: Record<ViewName, THREE.Vector3> = {
  // Строго сверху взгляд совпал бы с up = Y, и lookAt выродился бы (базис камеры не определён).
  // Менять up на Z нельзя: OrbitControls запоминает up один раз при создании (шаг 4).
  // Поэтому отклоняемся от вертикали на 1e-4 рад к +Z: экранный «верх» становится −Z.
  top: new THREE.Vector3(0, 1, 1e-4).normalize(),
  front: new THREE.Vector3(0, 0, 1),
  side: new THREE.Vector3(1, 0, 0),
  iso: new THREE.Vector3(1, 1, 1).normalize(),
};

const FOV = 45;
/** Запас вокруг объекта при fit: 1.2 = объект занимает ~83% узкой стороны кадра */
const FIT_MARGIN = 1.2;
const halfFovTan = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);

/**
 * Две камеры — ортографическая и перспективная — с общей точкой интереса.
 * Активна одна; при переключении переносится то, на что смотрит пользователь.
 */
export class CameraRig {
  readonly perspective = new THREE.PerspectiveCamera(FOV, 1, 1, 10_000);
  readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10_000);
  active: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.ortho;
  /** Точка интереса — общая для обеих камер */
  readonly target = new THREE.Vector3();

  /** Высота кадра орто-камеры в мм. Зум орто — это изменение этого числа, а не движение камеры */
  private frustumHeight = 1000;
  private aspect = 1;

  constructor() {
    // Камера не должна совпадать с точкой интереса: направление взгляда (камера − точка)
    // стало бы нулевым, и setView/fit поставили бы камеру прямо в точку интереса
    for (const camera of [this.perspective, this.ortho]) {
      camera.position.copy(VIEW_DIRECTIONS.iso).multiplyScalar(1000);
      camera.lookAt(this.target);
    }
    this.updateOrthoFrustum();
  }

  setProjection(projection: Projection) {
    const next = projection === 'ortho' ? this.ortho : this.perspective;
    if (next === this.active) return;

    if (next === this.ortho) {
      // Видимая высота перспективы в точке интереса становится высотой кадра орто
      const d = this.perspective.position.distanceTo(this.target);
      this.frustumHeight = 2 * d * halfFovTan;
      this.ortho.position.copy(this.perspective.position);
    } else {
      // Обратно: в орто зум менял высоту кадра, а не расстояние — расстояние выводим из высоты
      const d = this.frustumHeight / (2 * halfFovTan);
      const dir = this.ortho.position.clone().sub(this.target).normalize();
      this.perspective.position.copy(this.target).addScaledVector(dir, d);
    }
    next.up.copy(this.active.up);
    next.lookAt(this.target);

    this.active = next;
    this.updateOrthoFrustum();
  }

  /** Стандартный вид: камера на том же расстоянии от точки интереса, но с заданного направления */
  setView(view: ViewName) {
    const d = this.active.position.distanceTo(this.target);
    this.active.position.copy(this.target).addScaledVector(VIEW_DIRECTIONS[view], d);
    this.active.lookAt(this.target);
  }

  /**
   * Fit to object: точка интереса — в центр бокса, камера — по текущему направлению взгляда
   * на таком расстоянии, чтобы описанная сфера бокса целиком вошла в кадр с запасом FIT_MARGIN.
   */
  fit(box: THREE.Box3) {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = sphere.radius * FIT_MARGIN;
    const dir = this.active.position.clone().sub(this.target).normalize();
    this.target.copy(sphere.center);

    // Сфера касается краёв кадра по узкой стороне: если вьюпорт выше, чем шире, — по горизонтали
    const halfAngle = Math.atan(halfFovTan * Math.min(1, this.aspect));
    const d = r / Math.sin(halfAngle);
    // Обе камеры ставим на одно расстояние: орто-камере оно не меняет картинку,
    // но держит её снаружи объекта, чтобы near не резал модель
    for (const camera of [this.perspective, this.ortho]) {
      camera.position.copy(this.target).addScaledVector(dir, d);
      camera.lookAt(this.target);
      // near/far от размера объекта, а не константы: точность буфера глубины
      // зависит от отношения far/near — держим его 5000. Запас по far — на отдаление зумом.
      camera.near = r / 50;
      camera.far = r * 100;
      camera.updateProjectionMatrix();
    }

    // Орто: тот же принцип — диаметр сферы по узкой стороне кадра
    this.frustumHeight = (2 * r) / Math.min(1, this.aspect);
    this.updateOrthoFrustum();
  }

  /** Соотношение сторон вьюпорта (ширина / высота) — при ресайзе */
  setAspect(aspect: number) {
    this.aspect = aspect;
    this.perspective.aspect = aspect;
    this.perspective.updateProjectionMatrix();
    this.updateOrthoFrustum();
  }

  /** Высота кадра орто-камеры в мм */
  get orthoHeight() {
    return this.frustumHeight;
  }

  setOrthoHeight(mm: number) {
    this.frustumHeight = mm;
    this.updateOrthoFrustum();
  }

  private updateOrthoFrustum() {
    const h = this.frustumHeight / 2;
    const w = h * this.aspect;
    this.ortho.left = -w;
    this.ortho.right = w;
    this.ortho.top = h;
    this.ortho.bottom = -h;
    this.ortho.updateProjectionMatrix();
  }
}
