import './style.css';
import * as THREE from 'three';
import { Viewer } from './core/viewer';
import { createReference } from './core/reference';
import type { Projection, ViewName } from './core/cameras';
import { Navigation, type ZoomMode } from './core/controls';
import { addLights } from './core/lights';
import { ModelSlot } from './core/model';
import { measurePickMs, pick, pixelToNdc, type PickResult } from './core/picking';
import { Selection } from './core/selection';
import { FieldView, type RangeMode } from './core/field-view';
import { Player } from './core/playback';
import { ProbeMarkers } from './core/probes';
import { disableBvh, enableBvh } from './core/bvh';
import { coolingTime } from './data/cycle';
import { parseModel, type ImportOptions, type LengthUnit } from './data/loaders';
import type { PaletteName } from './data/palette';
import { planeAt, sectionAxes, sectionOf, type Axis } from './data/section';
import { Legend } from './ui/legend';
import { Overlay } from './ui/overlay';
import { SectionView } from './ui/section-view';
import { ThermalChart, type ProbeCurve } from './ui/chart';
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
const sectionView = new SectionView(viewport);
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
buttonRow(modelSection, [
  { label: 'Демо 32 тыс.', title: 'Пластина 400 × 12 × 120, шаг сетки 2.5 мм', onClick: () => loadDemo(1) },
  { label: 'Демо 0.5 млн', title: 'Та же пластина, сетка в 4 раза мельче: для замера picking с BVH и без', onClick: () => loadDemo(4) },
]);

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
  setProbes([]); // зонды ссылались на треугольники старой детали
  showModelInfo();
  field.attach(model.world);
  if (bvh.on) bvh.buildMs = enableBvh(model.world);
  updateClip();
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
const setStepSlider = slider(
  fieldSection,
  'шаг',
  { min: 0, max: field.stepCount - 1, step: 1, value: 0 },
  (v) => `${v} / ${field.stepCount - 1}`,
  (v) => goToStep(v),
);

// --- Время: проигрывание ---
const player = new Player(
  viewer,
  () => field.stepCount,
  () => field.step,
  (step) => goToStep(step, false),
);
const playButton = document.createElement('button');
const togglePlay = () => {
  if (player.playing) player.pause();
  else player.play();
  playButton.textContent = player.playing ? '❚❚ Пауза' : '▶ Пуск';
};
playButton.textContent = '▶ Пуск';
playButton.title = 'Пробел';
playButton.addEventListener('click', togglePlay);
const playRow = document.createElement('div');
playRow.className = 'btn-row';
playRow.append(playButton);
fieldSection.append(playRow);
selectBox(
  playRow,
  'скорость',
  [
    { value: '4', label: '4 шага/с' },
    { value: '8', label: '8 шагов/с' },
    { value: '15', label: '15 шагов/с' },
  ],
  String(player.stepsPerSecond),
  (v) => {
    player.stepsPerSecond = +v;
    player.restartFrom(field.step);
  },
);

/**
 * Единственное место смены шага. Все представления шага — сцена, ползунок, 2D-сечение, график,
 * T в панели выбора — обновляются отсюда, кто бы шаг ни поменял (ползунок, график, проигрывание)
 */
function goToStep(step: number, fromUser = true) {
  field.setStep(step);
  setStepSlider(step);
  drawSection();
  chart.setStep(step);
  showPickInfo();
  // Пользователь сдвинул шаг во время проигрывания — продолжаем уже от нового шага
  if (fromUser && player.playing) player.restartFrom(step);
}
toggleGroup<PaletteName>(
  fieldSection,
  [
    { value: 'viridis', label: 'Viridis' },
    { value: 'jet', label: 'Радуга (jet)' },
  ],
  field.palette,
  (p) => {
    field.setPalette(p);
    drawSection();
  },
);
toggleGroup<RangeMode>(
  fieldSection,
  [
    { value: 'fixed', label: 'Диапазон: фикс.' },
    { value: 'auto', label: 'Авто (min–max)' },
  ],
  field.rangeMode,
  (m) => {
    field.setRangeMode(m);
    drawSection();
  },
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

// --- Срез ---
const clip = { on: false, axis: 'x' as Axis, fraction: 0.5 };
const clipPlane = new THREE.Plane();
/** Наибольший размер картинки 2D-сечения, px (= ячеек) */
const SECTION_MAX_PX = { u: 320, v: 160 };

/** Положение плоскости в мм по текущим габаритам детали */
const clipPositionMm = () => {
  const box = model.box();
  return THREE.MathUtils.lerp(box.min[clip.axis], box.max[clip.axis], clip.fraction);
};

/** Пересчитать плоскость, срез на детали и 2D-сечение */
function updateClip() {
  clearPick(); // выбранная точка могла оказаться в отрезанной части
  if (!clip.on) {
    field.setClip(null);
    sectionView.set(null);
    return;
  }
  const box = model.box();
  field.setClip(planeAt(box, clip.axis, clip.fraction, clipPlane));

  // Размер ячейки — чтобы сечение влезло в картинку, один пиксель на ячейку
  const size = box.getSize(new THREE.Vector3());
  const { u, v } = sectionAxes(clip.axis);
  const cellMm = Math.max(Math.abs(size.dot(u)) / SECTION_MAX_PX.u, Math.abs(size.dot(v)) / SECTION_MAX_PX.v);
  const geometries: THREE.BufferGeometry[] = [];
  model.world.traverse((o) => {
    if (o instanceof THREE.Mesh) geometries.push(o.geometry);
  });
  const t0 = performance.now();
  const sec = sectionOf(geometries, clipPlane, clip.axis, cellMm);
  const values = field.sample(sec.points);
  const ms = performance.now() - t0;
  const { cols, rows } = sec.raster;
  sectionView.set(
    values && {
      section: sec,
      field: values,
      caption:
        `Сечение ${clip.axis.toUpperCase()} = ${clipPositionMm().toFixed(1)} мм\n` +
        `${fmt(cols * cellMm)} × ${fmt(rows * cellMm)} мм · ячейка ${cellMm.toFixed(2)} мм · ${ms.toFixed(0)} мс`,
    },
  );
  drawSection();
}

function drawSection() {
  sectionView.draw(field.step, field.range, field.palette);
}

const clipSection = section(panel, 'Срез');
checkbox(clipSection, 'Срез плоскостью', clip.on, (on) => {
  clip.on = on;
  updateClip();
});
toggleGroup<Axis>(
  clipSection,
  [
    { value: 'x', label: 'X (поперёк шва)' },
    { value: 'y', label: 'Y' },
    { value: 'z', label: 'Z' },
  ],
  clip.axis,
  (axis) => {
    clip.axis = axis;
    updateClip();
  },
);
slider(
  clipSection,
  'положение',
  { min: 0, max: 1, step: 0.005, value: clip.fraction },
  (f) => `${(f * 100).toFixed(1)} %`,
  (f) => {
    clip.fraction = f;
    updateClip();
  },
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
  else if (e.key === ' ') {
    e.preventDefault(); // пробел иначе прокрутит страницу или нажмёт кнопку в фокусе
    togglePlay();
  } else if (e.key === 'p' || e.key === 'P') {
    const next = rig.active === rig.ortho ? 'perspective' : 'ortho';
    rig.setProjection(next);
    selectProjection(next);
    nav.syncCamera();
  }
});

// --- Выбор лучом ---
const selection = new Selection(viewer);
const pickSection = section(panel, 'Выбор');
/** BVH (шаг 11): дерево коробок над треугольниками — луч за микросекунды вместо перебора */
const bvh = { on: true, buildMs: 0 };
checkbox(pickSection, 'BVH (three-mesh-bvh)', bvh.on, (on) => {
  bvh.on = on;
  if (on) bvh.buildMs = enableBvh(model.world);
  else disableBvh(model.world);
  clearPick();
});
const pickInfo = readout(pickSection);
pickInfo.textContent = 'Клик по детали';

/** Последний выбор: T в панели пересчитывается при смене шага (раньше застывала на шаге клика) */
let lastPick: { hit: PickResult; ms: number } | null = null;

function clearPick() {
  lastPick = null;
  selection.clear();
  showPickInfo();
}

function showPickInfo() {
  if (!lastPick) {
    pickInfo.textContent = 'Клик по детали';
    return;
  }
  const { hit, ms } = lastPick;
  const temperature = field.enabled ? field.valueAt(hit) : null;
  const v = (p: THREE.Vector3, digits: number) => [p.x, p.y, p.z].map((c) => c.toFixed(digits)).join('  ');
  pickInfo.textContent =
    `точка, мм:  ${v(hit.point, 1)}\n` +
    `нормаль:  ${v(hit.normal, 3)}\n` +
    `треугольник №${hit.faceIndex} (вершины ${hit.vertices.join(', ')})\n` +
    `барицентрия:  ${v(hit.barycoord, 3)}\n` +
    `от камеры: ${hit.distance.toFixed(1)} мм\n` +
    (temperature != null ? `T = ${temperature.toFixed(0)} °C (шаг ${field.step})\n` : '') +
    `луч: ${(ms * 1000).toFixed(1)} мкс (${fmt(model.info.triangles)} треуг., ` +
    (bvh.on ? `BVH построен за ${bvh.buildMs.toFixed(0)} мс)` : 'перебор без BVH)');
}

// --- Зонды и график термического цикла ---
const PROBE_COLORS = ['#ffb020', '#4fc3f7', '#f06292', '#e6e6e6'];
const chart = new ThermalChart(document.querySelector<HTMLCanvasElement>('#chart')!, field.stepCount, (step) =>
  goToStep(step),
);
const probeMarkers = new ProbeMarkers(viewer);
let probes: Array<ProbeCurve & { point: THREE.Vector3 }> = [];

function setProbes(next: typeof probes) {
  probes = next;
  probeMarkers.set(probes);
  chart.setProbes(probes);
}

/** Клик — зонд вместо всех прежних; Shift + клик — ещё один (до четырёх, самый старый уходит) */
function placeProbe(hit: PickResult, add: boolean) {
  const curve = field.cycle(hit);
  if (!curve) return;
  const kept = add ? probes.slice(-(PROBE_COLORS.length - 1)) : [];
  const color = PROBE_COLORS.find((c) => !kept.some((p) => p.color === c))!;
  setProbes([
    ...kept,
    {
      label: `Зонд ${PROBE_COLORS.indexOf(color) + 1}`,
      color,
      point: hit.point.clone(),
      curve,
      peak: Math.max(...curve),
      t85: coolingTime(curve, 800, 500),
    },
  ]);
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
  const hit = pick(viewer.camera, ndc, [model.world], clip.on ? clipPlane : null);
  if (!hit) return clearPick();

  selection.show(hit);
  lastPick = { hit, ms: measurePickMs(viewer.camera, ndc, [model.world]) };
  showPickInfo();
  placeProbe(hit, e.shiftKey);
});

// --- Счётчики ---
const statsSection = section(panel, 'Счётчики');
const stats = readout(statsSection);
const { info } = viewer.renderer;
let idleTimer = 0;
function showStats() {
  const cam = viewer.camera;
  stats.textContent =
    `three r${THREE.REVISION}\n` +
    `кадров отрисовано: ${viewer.renderCount}` +
    (viewer.busy ? ' · идут кадры' : ' · в покое, 0 кадров/с') +
    `\n` +
    `последний кадр: ${viewer.lastFrameMs.toFixed(2)} мс CPU\n` +
    // info.render — за последний render(): у нас один вызов на кадр, autoReset обнуляет перед ним
    `вызовов отрисовки: ${info.render.calls} · треугольников: ${fmt(info.render.triangles)}\n` +
    // info.memory — что сейчас живёт в памяти GPU. Растёт без dispose — утечка
    `в GPU: геометрий ${info.memory.geometries} · текстур ${info.memory.textures} · ` +
    `программ ${info.programs?.length ?? 0}\n` +
    `деталь: вершин ${fmt(model.info.vertices)} · треуг. ${fmt(model.info.triangles)}\n` +
    `near / far: ${cam.near.toFixed(1)} / ${fmt(cam.far)} мм`;
}
viewer.onRender(() => {
  showStats();
  // Кадр-событие не скажет «стало тихо»: проверяем чуть позже, остался ли запрос следующего кадра
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(showStats, 250);
});

// Воспроизведение утечки: пересобрать деталь 10 раз подряд, каждый раз с кадром — тогда новая
// геометрия действительно уходит в GPU. Без dispose счётчик геометрий растёт на каждую пересборку
checkbox(statsSection, 'dispose() старой детали', model.dispose, (on) => (model.dispose = on));
const leakInfo = readout(statsSection);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
buttonRow(statsSection, [
  {
    label: 'Пересобрать ×10',
    title: 'Как 10 загрузок подряд: смотреть на «в GPU: геометрий»',
    onClick: async () => {
      const before = info.memory.geometries;
      for (let i = 0; i < 10; i++) {
        applyOptions(model.options);
        await nextFrame();
      }
      const after = info.memory.geometries;
      leakInfo.textContent =
        `геометрий в GPU: ${before} → ${after} (${after - before >= 0 ? '+' : ''}${after - before})` +
        (model.dispose ? '' : '\nбез dispose — утечка');
    },
  },
]);

/**
 * Синтетическая пластина 400 × 12 × 120 мм (уже в мм и Y вверх), лежит на полу.
 * Мелкая сетка (шаг 2.5 мм / density): поле задано в вершинах, и на 8 углах коробки его не нарисовать.
 * density 4 — ≈0.5 млн треугольников: на ней разница перебора и BVH видна в живом приложении
 */
function loadDemo(density: number) {
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(400, 12, 120, 160 * density, 2 * density, 48 * density).translate(0, 6, 0),
    new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.7, metalness: 0.1 }),
  );
  model.set(density === 1 ? 'Пластина (демо)' : `Пластина (демо ×${density})`, plate, { unit: 'mm', zUp: false });
  setUnitControl('mm');
  setZUpControl(false);
  onModelChanged();
}

rig.setView('iso');
loadDemo(1);
