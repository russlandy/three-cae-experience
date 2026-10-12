import * as THREE from 'three';
import { describeModel, toWorldMm, type ImportOptions, type ModelInfo } from '../data/loaders';

/**
 * Слот детали в сцене: одна деталь за раз.
 * Хранит исходник (в единицах файла), чтобы при смене единиц пересобрать мир без перезагрузки файла.
 *
 * Владение GPU-ресурсами (шаг 10):
 * - геометрия мира — клоны (toWorldMm), принадлежат миру → освобождаются при каждой пересборке;
 * - материалы и их текстуры — общие с исходником → освобождаются только при смене исходника (новый файл).
 * Сборщик мусора JS освобождает объекты, но НЕ буферы и текстуры в памяти GPU: их удаляет только dispose()
 */
export class ModelSlot {
  /** Деталь в мировых координатах (мм, Y вверх) — то, что лежит в сцене */
  world: THREE.Group = new THREE.Group();
  info: ModelInfo = describeModel(this.world);
  name = '';
  options: ImportOptions = { unit: 'mm', zUp: false };
  /** false — воспроизвести утечку: старая деталь убирается из сцены без dispose (демонстрация шага 10) */
  dispose = true;

  private scene: THREE.Scene;
  private source: THREE.Object3D = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.world);
  }

  set(name: string, source: THREE.Object3D, options: ImportOptions) {
    if (this.dispose) disposeMaterials(this.source);
    this.name = name;
    this.source = source;
    this.apply(options);
  }

  /** Пересобрать мир из исходника с новыми единицами/осями */
  apply(options: ImportOptions) {
    this.options = options;
    this.scene.remove(this.world);
    if (this.dispose) disposeGeometries(this.world);
    this.world = toWorldMm(this.source, options);
    this.scene.add(this.world);
    this.info = describeModel(this.world);
  }

  box(): THREE.Box3 {
    return new THREE.Box3().setFromObject(this.world);
  }
}

function disposeGeometries(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

function disposeMaterials(root: THREE.Object3D) {
  const seen = new Set<THREE.Material>(); // один материал может висеть на нескольких мешах
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of [o.material].flat()) seen.add(m);
  });
  for (const material of seen) {
    // Текстуры материала (map, normalMap, …) — отдельные GPU-ресурсы, у материала нет своего «каскада»
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
    material.dispose();
  }
}
