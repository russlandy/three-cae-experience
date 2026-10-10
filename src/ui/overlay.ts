import * as THREE from 'three';
import { mmPerPixel, niceScaleBar } from '../core/scale';
import { AXIS_LENGTH_MM } from '../core/reference';

const AXES = [
  { name: 'X', color: '#ff5555', tip: new THREE.Vector3(AXIS_LENGTH_MM, 0, 0) },
  { name: 'Y', color: '#55dd55', tip: new THREE.Vector3(0, AXIS_LENGTH_MM, 0) },
  { name: 'Z', color: '#5599ff', tip: new THREE.Vector3(0, 0, AXIS_LENGTH_MM) },
];

/**
 * HTML-слой поверх канваса: подписи осей и масштабная линейка.
 * update() вызывается после каждой отрисовки.
 */
export class Overlay {
  private canvas: HTMLCanvasElement;
  private labels: HTMLElement[];
  private bar: HTMLElement;
  private barText: HTMLElement;
  private ndc = new THREE.Vector3();

  constructor(root: HTMLElement, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.labels = AXES.map(({ name, color }) => {
      const el = document.createElement('div');
      el.className = 'axis-label';
      el.textContent = name;
      el.style.color = color;
      root.append(el);
      return el;
    });

    const scale = document.createElement('div');
    scale.className = 'scale-bar';
    this.bar = document.createElement('div');
    this.bar.className = 'scale-bar__line';
    this.barText = document.createElement('div');
    this.barText.className = 'scale-bar__text';
    scale.append(this.bar, this.barText);
    root.append(scale);
  }

  update(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, target: THREE.Vector3) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    // Мир → экран: обратная цепочка к той, что будет в picking (шаг 6)
    AXES.forEach(({ tip }, i) => {
      this.ndc.copy(tip).project(camera); // мир → NDC, каждая координата в [-1, 1]
      const visible = this.ndc.z >= -1 && this.ndc.z <= 1; // за камерой или дальше far — прячем
      const el = this.labels[i];
      el.style.display = visible ? '' : 'none';
      const px = ((this.ndc.x + 1) / 2) * w;
      const py = ((1 - this.ndc.y) / 2) * h; // Y в NDC вверх, в пикселях вниз
      el.style.transform = `translate(${px}px, ${py}px)`;
    });

    const { mm, px } = niceScaleBar(mmPerPixel(camera, target, h), 100);
    this.bar.style.width = `${px}px`;
    this.barText.textContent = `${mm} мм`;
  }
}
