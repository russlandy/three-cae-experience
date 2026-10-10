import './style.css';
import * as THREE from 'three';

// Шаг 0: только проверяем, что three подключился и сборка работает.
// Рендерер и сцена появятся на шаге 1 в core/viewer.ts.
const panel = document.querySelector<HTMLElement>('#panel')!;
panel.textContent = `three r${THREE.REVISION}`;
