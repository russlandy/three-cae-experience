// Генерирует тестовые модели в samples/ — чтобы проверить единицы и оси загрузчика.
// Запуск: node scripts/make-samples.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

mkdirSync('samples', { recursive: true });

// 1. STL «из CAD»: пластина 40 × 12 × 1.2 см со швом-валиком сверху, единицы — см, Z вверх.
//    Правильный импорт: единицы «см», галочка «Z вверх» → 400 × 16 × 120 мм в мире (Y — высота).
{
  const scene = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(40, 12, 1.2).translate(0, 0, 0.6));
  const bead = new THREE.Mesh(new THREE.BoxGeometry(40, 0.8, 0.4).translate(0, 0, 1.4));
  scene.add(plate, bead);
  scene.updateMatrixWorld(true);
  writeFileSync('samples/plate-cm-zup.stl', new STLExporter().parse(scene, { binary: false }));
}

// 2. glTF: та же пластина в метрах, Y вверх (по спецификации glTF), сдвинута узлом на 0.1 м по X.
//    Правильный импорт: «м», без «Z вверх» → 400 × 12 × 120 мм, центр по X на 100 мм.
//    Пишем .gltf вручную со встроенным буфером (base64): GLTFExporter в Node не работает без FileReader.
{
  const g = new THREE.BoxGeometry(0.4, 0.012, 0.12).translate(0, 0.006, 0);
  const pos = g.getAttribute('position').array;
  const nrm = g.getAttribute('normal').array;
  const idx = new Uint16Array(g.index.array);
  const bytes = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nrm.buffer), Buffer.from(idx.buffer)]);
  const box = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position'));

  const gltf = {
    asset: { version: '2.0', generator: 'cae-viewer make-samples' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'plate', mesh: 0, translation: [0.1, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.75, 0.6, 0.45, 1], metallicFactor: 0.2, roughnessFactor: 0.6 } }],
    buffers: [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${bytes.toString('base64')}` }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pos.byteLength, byteLength: nrm.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pos.byteLength + nrm.byteLength, byteLength: idx.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: box.min.toArray(), max: box.max.toArray() },
      { bufferView: 1, componentType: 5126, count: nrm.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
  };
  writeFileSync('samples/plate-m.gltf', JSON.stringify(gltf));
}

console.log('samples/plate-cm-zup.stl, samples/plate-m.gltf');
