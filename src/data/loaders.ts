import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type ModelFormat = 'stl' | 'gltf';

export interface ParsedModel {
  format: ModelFormat;
  /** Исходник как есть, в единицах и осях файла. Мир из него делает toWorldMm */
  source: THREE.Object3D;
  /** С чего начать выбор единиц: STL — спрашиваем (мм, Z вверх), glTF — метры и Y вверх по спецификации */
  defaults: ImportOptions;
}

/** Материал для форматов без материалов (STL): нейтральный серый, чтобы форму читал свет */
const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.7, metalness: 0.1 });

/** Разбор файла по расширению. Единицы и оси здесь НЕ трогаются — только в toWorldMm */
export async function parseModel(fileName: string, buffer: ArrayBuffer): Promise<ParsedModel> {
  const ext = fileName.toLowerCase().split('.').pop();

  if (ext === 'stl') {
    // STL: неиндексированный (по 3 вершины на треугольник), нормаль у каждой грани своя
    const geometry = new STLLoader().parse(buffer);
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    return { format: 'stl', source: new THREE.Mesh(geometry, defaultMaterial), defaults: { unit: 'mm', zUp: true } };
  }

  if (ext === 'glb' || ext === 'gltf') {
    // .gltf с внешними .bin/текстурами так не прочитать — только .glb или .gltf со встроенными данными
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    return { format: 'gltf', source: gltf.scene, defaults: { unit: 'm', zUp: false } };
  }

  throw new Error(`Формат «.${ext}» не поддерживается: только STL и glTF (.glb, .gltf)`);
}

/** Единицы длины во входном файле. В STL единиц нет вообще — их выбирает пользователь */
export type LengthUnit = 'mm' | 'cm' | 'm' | 'in';

export const UNIT_TO_MM: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };

export interface ImportOptions {
  unit: LengthUnit;
  /** Файл в соглашении CAD (Z вверх) — повернуть к миру проекта (Y вверх) */
  zUp: boolean;
}

/**
 * Единственное место, где внешние данные приводятся к миру проекта: мм, Y вверх (ADR 0003).
 * Преобразование запекается прямо в вершины.
 */
export function toWorldMm(root: THREE.Object3D, { unit, zUp }: ImportOptions): THREE.Group {
  const conversion = new THREE.Matrix4().makeScale(UNIT_TO_MM[unit], UNIT_TO_MM[unit], UNIT_TO_MM[unit]);
  // Z вверх → Y вверх: поворот на −90° вокруг X, (x, y, z) → (x, z, −y)
  if (zUp) conversion.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

  // glTF — граф сцены: у узлов свои трансформации. Запекаем мировую матрицу каждого меша
  // в его вершины и складываем меши в плоскую группу с единичными трансформациями
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });

  // Исходник не трогаем: геометрия клонируется, меши создаются новые. Тогда при смене единиц
  // можно конвертировать тот же исходник заново, а геометрия, общая у нескольких узлов glTF,
  // не получит преобразование дважды
  const group = new THREE.Group();
  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(conversion.clone().multiply(mesh.matrixWorld));
    const baked = new THREE.Mesh(geometry, mesh.material);
    baked.name = mesh.name;
    group.add(baked);
  }
  return group;
}

export interface ModelInfo {
  /** Габариты по осям мира, мм */
  size: THREE.Vector3;
  triangles: number;
  vertices: number;
}

/** Габариты и размер сетки — первое, что инженер проверяет после загрузки */
export function describeModel(group: THREE.Object3D): ModelInfo {
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  let triangles = 0;
  let vertices = 0;
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry as THREE.BufferGeometry;
    const positions = g.getAttribute('position').count;
    vertices += positions;
    // Индексированная: треугольник = 3 индекса. Неиндексированная (STL): 3 вершины подряд
    triangles += (g.index ? g.index.count : positions) / 3;
  });
  return { size, triangles, vertices };
}
