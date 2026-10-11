import * as THREE from 'three';

/**
 * Пиксель страницы (clientX/clientY) → NDC канваса: x, y ∈ [-1, 1].
 * Y меняет знак: в пикселях ось вниз, в NDC вверх.
 */
export function pixelToNdc(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  target = new THREE.Vector2(),
): THREE.Vector2 {
  return target.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
}

export interface PickResult {
  /** Точка попадания в мировых координатах, мм */
  point: THREE.Vector3;
  /** Нормаль грани в мировых координатах */
  normal: THREE.Vector3;
  /** Номер треугольника в геометрии */
  faceIndex: number;
  /** Индексы трёх вершин треугольника */
  vertices: [number, number, number];
  /** Барицентрические координаты точки в треугольнике: веса вершин a, b, c, сумма = 1 */
  barycoord: THREE.Vector3;
  /** Расстояние от камеры, мм */
  distance: number;
  mesh: THREE.Mesh;
}

const raycaster = new THREE.Raycaster();
const normalMatrix = new THREE.Matrix3();

/**
 * Пиксель → NDC → луч (обратная проекция) → ближайшее пересечение с треугольниками.
 * Возвращает null, если луч ни во что не попал.
 * clip — плоскость среза: Raycaster о ней не знает и попадает и в отрезанную (невидимую) часть,
 * поэтому берём первое попадание с видимой стороны (d ≥ 0).
 */
export function pick(
  camera: THREE.Camera,
  ndc: THREE.Vector2,
  objects: THREE.Object3D[],
  clip?: THREE.Plane | null,
): PickResult | null {
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(objects, true);

  const hit = clip ? hits.find((h) => clip.distanceToPoint(h.point) >= 0) : hits[0];
  if (!hit || !hit.face || hit.faceIndex == null || !hit.barycoord) return null;

  // face.normal — в координатах объекта. В мир нормаль переводится НЕ матрицей объекта,
  // а матрицей нормалей: обратной транспонированной к её верхнему левому блоку 3×3.
  // При неравномерном масштабе разница видна: поверхность растянулась — нормаль «сплющилась».
  const normal = hit.face.normal.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld));

  return {
    point: hit.point.clone(),
    normal,
    faceIndex: hit.faceIndex,
    vertices: [hit.face.a, hit.face.b, hit.face.c],
    barycoord: hit.barycoord.clone(),
    distance: hit.distance,
    mesh: hit.object as THREE.Mesh,
  };
}

/**
 * Среднее время одного пересечения луча, мс.
 * performance.now() в браузере огрублён (до 0.1 мс без cross-origin isolation — защита от Spectre),
 * а луч по маленькой детали занимает микросекунды. Одиночный замер дал бы 0 — меряем серию.
 */
export function measurePickMs(camera: THREE.Camera, ndc: THREE.Vector2, objects: THREE.Object3D[], runs = 200): number {
  raycaster.setFromCamera(ndc, camera);
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) raycaster.intersectObjects(objects, true);
  return (performance.now() - t0) / runs;
}
