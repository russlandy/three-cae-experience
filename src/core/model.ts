import * as THREE from 'three';
import { describeModel, toWorldMm, type ImportOptions, type ModelInfo } from '../data/loaders';

/**
 * Слот детали в сцене: одна деталь за раз.
 * Хранит исходник (в единицах файла), чтобы при смене единиц пересобрать мир без перезагрузки файла.
 */
export class ModelSlot {
  /** Деталь в мировых координатах (мм, Y вверх) — то, что лежит в сцене */
  world: THREE.Group = new THREE.Group();
  info: ModelInfo = describeModel(this.world);
  name = '';
  options: ImportOptions = { unit: 'mm', zUp: false };

  private scene: THREE.Scene;
  private source: THREE.Object3D = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.world);
  }

  set(name: string, source: THREE.Object3D, options: ImportOptions) {
    this.name = name;
    this.source = source;
    this.apply(options);
  }

  /** Пересобрать мир из исходника с новыми единицами/осями */
  apply(options: ImportOptions) {
    this.options = options;
    // Старая деталь просто убирается из сцены. Буферы GPU при этом НЕ освобождаются —
    // это сознательная утечка, её воспроизводим и чиним на шаге 10 (dispose)
    this.scene.remove(this.world);
    this.world = toWorldMm(this.source, options);
    this.scene.add(this.world);
    this.info = describeModel(this.world);
  }

  box(): THREE.Box3 {
    return new THREE.Box3().setFromObject(this.world);
  }
}
