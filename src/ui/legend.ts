import { cssGradient, type PaletteName } from '../data/palette';

/** Физические пороги для стали — не зависят от диапазона и шага времени */
export const THRESHOLDS = [
  { value: 1500, label: '1500 °C плавление — граница зоны сплавления' },
  { value: 900, label: '≈900 °C Ac3 — граница ЗТВ (полная перекристаллизация)' },
  { value: 720, label: '≈720 °C Ac1 — внешняя граница ЗТВ' },
];

/**
 * Вертикальная цветовая шкала поверх сцены: градиент той же палитры, подписи диапазона
 * и фиксированные отметки физических порогов.
 */
export class Legend {
  private bar: HTMLElement;
  private maxLabel: HTMLElement;
  private minLabel: HTMLElement;
  private ticks: HTMLElement[];
  private root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'legend';
    this.maxLabel = document.createElement('div');
    this.minLabel = document.createElement('div');
    this.maxLabel.className = this.minLabel.className = 'legend__range';
    this.bar = document.createElement('div');
    this.bar.className = 'legend__bar';
    this.ticks = THRESHOLDS.map(({ value, label }) => {
      const tick = document.createElement('div');
      tick.className = 'legend__tick';
      tick.title = label;
      tick.textContent = `${value}`;
      this.bar.append(tick);
      return tick;
    });
    this.root.append(this.maxLabel, this.bar, this.minLabel);
    parent.append(this.root);
  }

  update(palette: PaletteName, [min, max]: [number, number], visible: boolean) {
    this.root.style.display = visible ? '' : 'none';
    this.bar.style.background = cssGradient(palette);
    this.maxLabel.textContent = `${Math.round(max)} °C`;
    this.minLabel.textContent = `${Math.round(min)} °C`;
    THRESHOLDS.forEach(({ value }, i) => {
      const t = (value - min) / (max - min);
      const tick = this.ticks[i];
      // Порог вне диапазона (бывает в режиме «авто») — не показываем
      tick.style.display = t >= 0 && t <= 1 ? '' : 'none';
      tick.style.bottom = `${t * 100}%`;
    });
  }
}
