// Замер picking: перебор всех треугольников против BVH (three-mesh-bvh).
// Запуск: node scripts/bench-pick.mjs
// В Node performance.now() не огрублён (в браузере — до 0.1 мс), лучи одинаковые для всех вариантов.
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

// Пластина 400 × 12 × 120 мм с растущей плотностью сетки (шаг 7 — 160 × 2 × 48 сегментов)
const SIZES = [
  [160, 2, 48],
  [320, 4, 96],
  [640, 8, 192],
  [1280, 8, 384],
];
const RAYS = 200;

const camera = new THREE.PerspectiveCamera(45, 1.5, 1, 10_000);
camera.position.set(500, 400, 600);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

// Одни и те же лучи для всех: псевдослучайные точки ВЕРХНЕЙ ГРАНИ, спроецированные на экран, —
// каждый луч попадает в деталь. Промахи нечестно приукрасили бы BVH: промах отсекается на корневой коробке
let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1; // [−1, 1)
const rays = Array.from({ length: RAYS }, () => {
  const p = new THREE.Vector3(random() * 190, 6, random() * 55).project(camera); // → NDC
  return new THREE.Vector2(p.x, p.y);
});

const raycaster = new THREE.Raycaster();

function timeRays(mesh, firstHitOnly) {
  raycaster.firstHitOnly = firstHitOnly;
  let hits = 0;
  const t0 = performance.now();
  for (const ndc of rays) {
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObject(mesh).length) hits++;
  }
  return { ms: (performance.now() - t0) / RAYS, hits };
}

const rows = [];
for (const [sx, sy, sz] of SIZES) {
  const geometry = new THREE.BoxGeometry(400, 12, 120, sx, sy, sz);
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld();
  const triangles = geometry.index.count / 3;

  timeRays(mesh, false); // прогрев JIT
  const plain = timeRays(mesh, false);

  const t0 = performance.now();
  geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
  const buildMs = performance.now() - t0;
  mesh.raycast = acceleratedRaycast;

  timeRays(mesh, false);
  const all = timeRays(mesh, false);
  const first = timeRays(mesh, true);

  rows.push({
    triangles,
    plainMs: plain.ms,
    bvhAllMs: all.ms,
    bvhFirstMs: first.ms,
    buildMs,
    speedup: plain.ms / first.ms,
    hits: `${plain.hits}/${all.hits}/${first.hits}`,
  });
}

const f = (x, d = 3) => x.toFixed(d);
console.log('| треугольников | перебор, мс | BVH все hits, мс | BVH firstHitOnly, мс | ускорение | построение BVH, мс | попаданий |');
console.log('|---:|---:|---:|---:|---:|---:|---|');
for (const r of rows) {
  console.log(
    `| ${r.triangles.toLocaleString('ru-RU')} | ${f(r.plainMs)} | ${f(r.bvhAllMs)} | ${f(r.bvhFirstMs)} | ×${Math.round(r.speedup)} | ${f(r.buildMs, 0)} | ${r.hits} |`,
  );
}
console.log(`\nлучей на вариант: ${RAYS}; Node ${process.version}; three r${THREE.REVISION}`);
