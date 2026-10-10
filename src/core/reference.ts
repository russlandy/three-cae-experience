import * as THREE from 'three';

// Соглашение осей проекта: Y вверх (родное для three), пол — плоскость XZ.
// Единица мира — миллиметр. CAD-данные с Z вверх поворачиваются на входе, в загрузчике (шаг 5).
// См. docs/adr/0003-world-mm-y-up.md

export const AXIS_LENGTH_MM = 300;

/** Опорная геометрия: сетка-пол 2000 мм с шагом 100 мм и оси X/Y/Z */
export function createReference(): THREE.Group {
  const group = new THREE.Group();

  const size = 2000;
  const step = 100;
  // Центральные линии — того же цвета, что и сетка: их место занимают оси
  const grid = new THREE.GridHelper(size, size / step, 0x3a4048, 0x3a4048);
  // Оси X и Z лежат ровно на центральных линиях сетки (y = 0): одинаковая глубина → z-fighting.
  // Сетка рисуется первой и НЕ пишет глубину — она как фон-пол: оси и модель рисуются поверх,
  // но сами по-прежнему перекрывают друг друга по глубине.
  (grid.material as THREE.Material).depthWrite = false;
  grid.renderOrder = -1;
  group.add(grid);

  group.add(new THREE.AxesHelper(AXIS_LENGTH_MM));

  return group;
}
