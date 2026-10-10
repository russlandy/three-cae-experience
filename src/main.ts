import './style.css';
import * as THREE from 'three';
import { Viewer } from './core/viewer';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const panel = document.querySelector<HTMLElement>('#panel')!;

const viewer = new Viewer(canvas);

// Временный куб 100 мм: MeshNormalMaterial не требует света
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(100, 100, 100),
  new THREE.MeshNormalMaterial(),
);
viewer.scene.add(cube);

// Счётчик кадров на экран: в покое число не должно расти
viewer.onRender = () => {
  panel.textContent = `three r${THREE.REVISION} · кадров отрисовано: ${viewer.renderCount}`;
};

// Временная проверка рендера по требованию: клик по сцене поворачивает куб
canvas.addEventListener('pointerdown', () => {
  cube.rotation.y += Math.PI / 12;
  viewer.requestRender();
});
