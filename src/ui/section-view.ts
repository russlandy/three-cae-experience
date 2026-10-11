import { PALETTES, paletteData, type PaletteName } from '../data/palette';
import type { Field } from '../data/field';
import type { Section } from '../data/section';
import { THRESHOLDS } from './legend';

/** Сечение с полем во всех его ячейках по шагам времени */
export interface SectionData {
  section: Section;
  field: Field;
  /** Подпись: где сечение и какого размера */
  caption: string;
}

/**
 * 2D-сечение: поле температур на плоскости среза как плоская картинка.
 * Одна ячейка сечения = один пиксель канваса (размер ячейки подобран под канвас), без масштабирования,
 * поэтому мм по горизонтали и вертикали одинаковые — форма не искажена.
 */
export class SectionView {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private captionEl: HTMLElement;
  private data: SectionData | null = null;
  private palettes: Partial<Record<PaletteName, Uint8Array>> = {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'section-view';
    this.canvas = document.createElement('canvas');
    this.captionEl = document.createElement('div');
    this.captionEl.className = 'section-view__caption';
    this.root.append(this.captionEl, this.canvas);
    this.root.hidden = true;
    parent.append(this.root);
  }

  set(data: SectionData | null) {
    this.data = data;
    this.root.hidden = !data || data.section.raster.cols === 0;
    if (!data) return;
    this.canvas.width = data.section.raster.cols;
    this.canvas.height = data.section.raster.rows;
    this.captionEl.textContent = data.caption;
  }

  /** Перерисовать для шага времени, диапазона и палитры — сечение и поле уже посчитаны */
  draw(step: number, [min, max]: [number, number], palette: PaletteName) {
    if (!this.data || this.root.hidden) return;
    const { section, field } = this.data;
    const { cols, rows } = section.raster;
    const T = field.steps[step];
    const colors = (this.palettes[palette] ??= paletteData(PALETTES[palette]));
    const size = colors.length / 4;

    // Значения по ячейкам картинки (NaN — вне детали), чтобы найти соседей для линий порогов
    const grid = new Float32Array(cols * rows).fill(NaN);
    for (let k = 0; k < section.cells.length; k++) grid[section.cells[k]] = T[k];

    const image = new ImageData(cols, rows); // по умолчанию прозрачная: вне детали — фон
    for (let cell = 0; cell < grid.length; cell++) {
      const value = grid[cell];
      if (Number.isNaN(value)) continue;
      const t = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
      const c = Math.round(t * (size - 1)) * 4;
      let [r, g, b] = [colors[c], colors[c + 1], colors[c + 2]];
      // Пороги (плавление, Ac3, Ac1): пиксель на линии, если сосед справа или снизу по другую сторону.
      // Так на поперечном сечении видны форма ванны и граница ЗТВ — как на макрошлифе
      if (this.crossesThreshold(grid, cell, cols)) r = g = b = 255;
      image.data.set([r, g, b, 255], cell * 4);
    }
    this.canvas.getContext('2d')!.putImageData(image, 0, 0);
  }

  private crossesThreshold(grid: Float32Array, cell: number, cols: number): boolean {
    const a = grid[cell];
    const right = cell % cols < cols - 1 ? grid[cell + 1] : NaN;
    const below = grid[cell + cols] ?? NaN;
    // NaN — сосед вне детали: край детали линией порога не считается
    const crosses = (n: number) => !Number.isNaN(n) && THRESHOLDS.some(({ value }) => a >= value !== n >= value);
    return crosses(right) || crosses(below);
  }
}
