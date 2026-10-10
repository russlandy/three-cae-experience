import './style.css';
import * as THREE from 'three';
import { Viewer } from './core/viewer';
import { createReference } from './core/reference';
import type { Projection, ViewName } from './core/cameras';
import { Navigation, type ZoomMode } from './core/controls';
import { Overlay } from './ui/overlay';
import { buttonRow, readout, section, toggleGroup } from './ui/panel';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const panel = document.querySelector<HTMLElement>('#panel')!;

const viewer = new Viewer(canvas);
const { rig } = viewer;
viewer.scene.add(createReference());

// Временный куб 100 мм, стоит на полу (центр на высоте 50 мм)
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(100, 100, 100),
  new THREE.MeshNormalMaterial(),
);
cube.position.y = 50;
viewer.scene.add(cube);

const overlay = new Overlay(viewport, canvas);
viewer.onRender(() => overlay.update(viewer.camera, viewer.target));

const nav = new Navigation(viewer, canvas);

// --- Камера ---
const fit = () => {
  rig.fit(new THREE.Box3().setFromObject(cube));
  viewer.requestRender();
};
const setView = (view: ViewName) => {
  rig.setView(view);
  viewer.requestRender();
};

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

// --- Счётчики ---
const stats = readout(section(panel, 'Счётчики'));
viewer.onRender(() => {
  const cam = viewer.camera;
  stats.textContent =
    `three r${THREE.REVISION}\n` +
    `кадров отрисовано: ${viewer.renderCount}\n` +
    `near / far: ${cam.near.toFixed(1)} / ${cam.far.toFixed(0)} мм`;
});

// Старт: изометрия и fit по детали
rig.setView('iso');
fit();
