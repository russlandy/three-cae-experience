import './style.css';
import * as THREE from 'three';
import { Viewer } from './core/viewer';
import { createReference } from './core/reference';
import { Overlay } from './ui/overlay';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const panel = document.querySelector<HTMLElement>('#panel')!;

const viewer = new Viewer(canvas);
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

// Счётчик кадров на экран: в покое число не должно расти
viewer.onRender(() => {
  panel.textContent = `three r${THREE.REVISION} · кадров отрисовано: ${viewer.renderCount}`;
});

// Временная проверка, пока нет орбиты (шаг 4): колесо приближает/отдаляет камеру,
// и масштабная линейка должна это отражать
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    viewer.camera.position.sub(viewer.target).multiplyScalar(factor).add(viewer.target);
    viewer.requestRender();
  },
  { passive: false },
);
