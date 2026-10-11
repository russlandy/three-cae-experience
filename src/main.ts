import './style.css';
import * as THREE from 'three';
import { Viewer } from './core/viewer';
import { createReference } from './core/reference';
import type { Projection, ViewName } from './core/cameras';
import { Navigation, type ZoomMode } from './core/controls';
import { addLights } from './core/lights';
import { ModelSlot } from './core/model';
import { measurePickMs, pick, pixelToNdc } from './core/picking';
import { Selection } from './core/selection';
import { FieldView, type RangeMode } from './core/field-view';
import { parseModel, type ImportOptions, type LengthUnit } from './data/loaders';
import type { PaletteName } from './data/palette';
import { Legend } from './ui/legend';
import { Overlay } from './ui/overlay';
import { buttonRow, checkbox, readout, section, selectBox, slider, toggleGroup } from './ui/panel';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const panel = document.querySelector<HTMLElement>('#panel')!;

const viewer = new Viewer(canvas);
const { rig } = viewer;
viewer.scene.add(createReference());
addLights(viewer);

const overlay = new Overlay(viewport, canvas);
viewer.onRender(() => overlay.update(viewer.camera, viewer.target));

const nav = new Navigation(viewer, canvas);
const model = new ModelSlot(viewer.scene);
const field = new FieldView(viewer);
const legend = new Legend(viewport);
viewer.onRender(() => legend.update(field.palette, field.range, field.enabled));

const fit = () => {
  rig.fit(model.box());
  viewer.requestRender();
};
const setView = (view: ViewName) => {
  rig.setView(view);
  viewer.requestRender();
};

// --- Деталь ---
const modelSection = section(panel, 'Деталь');
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.stl,.glb,.gltf';
modelSection.append(fileInput);

const UNITS: Array<{ value: LengthUnit; label: string }> = [
  { value: 'mm', label: 'мм' },
  { value: 'cm', label: 'см' },
  { value: 'm', label: 'м' },
  { value: 'in', label: 'дюймы' },
];
const setUnitControl = selectBox<LengthUnit>(modelSection, 'Единицы файла', UNITS, 'mm', (unit) =>
  applyOptions({ ...model.options, unit }),
);
const setZUpControl = checkbox(modelSection, 'Z вверх (CAD)', false, (zUp) =>
  applyOptions({ ...model.options, zUp }),
);
const modelInfo = readout(modelSection);

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
function showModelInfo() {
  const { size, triangles, vertices } = model.info;
  modelInfo.textContent =
    `${model.name}\n` +
    `${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)} мм\n` +
    `треугольников ${fmt(triangles)} · вершин ${fmt(vertices)}`;
}

/** Деталь сменилась (загрузка или смена единиц): сбросить выбор, пересчитать поле, вписать */
function onModelChanged() {
  clearPick();
  showModelInfo();
  field.attach(model.world);
  fit();
}

function applyOptions(options: ImportOptions) {
  model.apply(options);
  onModelChanged();
}

async function loadFile(file: File) {
  try {
    const parsed = await parseModel(file.name, await file.arrayBuffer());
    model.set(file.name, parsed.source, parsed.defaults);
    setUnitControl(parsed.defaults.unit);
    setZUpControl(parsed.defaults.zUp);
    onModelChanged();
  } catch (err) {
    modelInfo.textContent = `Ошибка: ${(err as Error).message}`;
  }
}

fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
});

// Перетаскивание файла на сцену
viewport.addEventListener('dragover', (e) => {
  e.preventDefault(); // без этого браузер не разрешит drop и просто откроет файл
  viewport.classList.add('drop-target');
});
viewport.addEventListener('dragleave', () => viewport.classList.remove('drop-target'));
viewport.addEventListener('drop', (e) => {
  e.preventDefault();
  viewport.classList.remove('drop-target');
  const file = e.dataTransfer?.files[0];
  if (file) loadFile(file);
});

// --- Поле температур ---
const fieldSection = section(panel, 'Поле температур');
checkbox(fieldSection, 'Показывать поле', field.enabled, (on) => field.setEnabled(on));
slider(
  fieldSection,
  'шаг',
  { min: 0, max: field.stepCount - 1, step: 1, value: 0 },
  (v) => `${v} / ${field.stepCount - 1}`,
  (v) => field.setStep(v),
);
toggleGroup<PaletteName>(
  fieldSection,
  [
    { value: 'viridis', label: 'Viridis' },
    { value: 'jet', label: 'Радуга (jet)' },
  ],
  field.palette,
  (p) => field.setPalette(p),
);
toggleGroup<RangeMode>(
  fieldSection,
  [
    { value: 'fixed', label: 'Диапазон: фикс.' },
    { value: 'auto', label: 'Авто (min–max)' },
  ],
  field.rangeMode,
  (m) => field.setRangeMode(m),
);
selectBox(
  fieldSection,
  'Изотермы',
  [
    { value: '0', label: 'выкл' },
    { value: '50', label: 'каждые 50 °C' },
    { value: '100', label: 'каждые 100 °C' },
    { value: '250', label: 'каждые 250 °C' },
  ],
  '0',
  (v) => field.setIsoStep(+v),
);
slider(fieldSection, 'затенение', { min: 0, max: 1, step: 0.05, value: 0.25 }, (v) => v.toFixed(2), (v) =>
  field.setShade(v),
);

// --- Камера ---
const cameraSection = section(panel, 'Камера');
const selectProjection = toggleGroup<Projection>(
  cameraSection,
  [
    { value: 'ortho', label: 'Орто' },
    { value: 'perspective', label: 'Перспектива' },
  ],
  'ortho',
  (p) => {
    rig.setProjection(p);
    nav.syncCamera();
  },
);
toggleGroup<ZoomMode>(
  cameraSection,
  [
    { value: 'cursor', label: 'Зум к курсору' },
    { value: 'center', label: 'Зум к центру' },
  ],
  nav.zoomMode,
  (m) => (nav.zoomMode = m),
);
buttonRow(cameraSection, [
  { label: 'Сверху', title: 'Клавиша 1', onClick: () => setView('top') },
  { label: 'Спереди', title: 'Клавиша 2', onClick: () => setView('front') },
  { label: 'Сбоку', title: 'Клавиша 3', onClick: () => setView('side') },
  { label: 'Изо', title: 'Клавиша 0', onClick: () => setView('iso') },
  { label: 'Fit', title: 'Клавиша F', onClick: fit },
]);

const KEY_VIEWS: Record<string, ViewName> = { '1': 'top', '2': 'front', '3': 'side', '0': 'iso' };
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (KEY_VIEWS[e.key]) setView(KEY_VIEWS[e.key]);
  else if (e.key === 'f' || e.key === 'F') fit();
  else if (e.key === 'p' || e.key === 'P') {
    const next = rig.active === rig.ortho ? 'perspective' : 'ortho';
    rig.setProjection(next);
    selectProjection(next);
    nav.syncCamera();
  }
});

// --- Выбор лучом ---
const selection = new Selection(viewer);
const pickInfo = readout(section(panel, 'Выбор'));
pickInfo.textContent = 'Клик по детали';

function clearPick() {
  selection.clear();
  pickInfo.textContent = 'Клик по детали';
}

// ЛКМ одновременно крутит орбиту. Клик — это нажатие и отпускание почти в одной точке
const CLICK_TOLERANCE_PX = 4;
const down = { x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => {
  down.x = e.clientX;
  down.y = e.clientY;
});
canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_TOLERANCE_PX) return;

  const ndc = pixelToNdc(e.clientX, e.clientY, canvas.getBoundingClientRect());
  const hit = pick(viewer.camera, ndc, [model.world]);
  if (!hit) return clearPick();

  selection.show(hit);
  const temperature = field.enabled ? field.valueAt(hit) : null;
  const ms = measurePickMs(viewer.camera, ndc, [model.world]);
  const v = (p: THREE.Vector3, digits: number) => [p.x, p.y, p.z].map((c) => c.toFixed(digits)).join('  ');
  pickInfo.textContent =
    `точка, мм:  ${v(hit.point, 1)}\n` +
    `нормаль:  ${v(hit.normal, 3)}\n` +
    `треугольник №${hit.faceIndex} (вершины ${hit.vertices.join(', ')})\n` +
    `барицентрия:  ${v(hit.barycoord, 3)}\n` +
    `от камеры: ${hit.distance.toFixed(1)} мм\n` +
    (temperature != null ? `T = ${temperature.toFixed(0)} °C (шаг ${field.step})\n` : '') +
    `луч: ${(ms * 1000).toFixed(1)} мкс (${fmt(model.info.triangles)} треуг.)`;
});

// --- Счётчики ---
const stats = readout(section(panel, 'Счётчики'));
viewer.onRender(() => {
  const cam = viewer.camera;
  stats.textContent =
    `three r${THREE.REVISION}\n` +
    `кадров отрисовано: ${viewer.renderCount}\n` +
    `near / far: ${cam.near.toFixed(1)} / ${fmt(cam.far)} мм`;
});

// --- Старт: синтетическая пластина 400 × 12 × 120 мм (уже в мм и Y вверх), лежит на полу ---
// Мелкая сетка (шаг 2.5 мм): поле задано в вершинах, и на 8 углах коробки его не нарисовать
const plate = new THREE.Mesh(
  new THREE.BoxGeometry(400, 12, 120, 160, 2, 48).translate(0, 6, 0),
  new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.7, metalness: 0.1 }),
);
model.set('Пластина (демо)', plate, { unit: 'mm', zUp: false });
rig.setView('iso');
onModelChanged();
