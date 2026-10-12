import { THRESHOLDS } from './legend';

/** Зонд: точка на детали и её термический цикл */
export interface ProbeCurve {
  label: string;
  color: string;
  curve: Float32Array;
  /** Пик цикла, °C */
  peak: number;
  /** t8/5 в шагах; null — не нагрелась до 800 °C или не остыла до 500 °C */
  t85: number | null;
}

/** Клик по графику → шаг времени: ближайший шаг к x, прижатый к краям */
export function stepAtX(x: number, plot: { left: number; width: number }, count: number): number {
  const step = Math.round(((x - plot.left) / plot.width) * (count - 1));
  return Math.min(count - 1, Math.max(0, step));
}

const MARGIN = { left: 48, right: 210, top: 12, bottom: 26 };
/** Ось температуры: фиксированная, как диапазон легенды (ADR 0007), с запасом под пик над плавлением */
const T_MAX = 2000;
const T_TICK = 500;

/**
 * График термического цикла на обычном 2D-канвасе.
 * Связь со сценой в обе стороны: клик или протяжка по графику → onStep(шаг); смена шага → setStep → линия.
 */
export class ThermalChart {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private probes: ProbeCurve[] = [];
  private step = 0;
  private count: number;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement, count: number, onStep: (step: number) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.count = count;

    // Протяжка: шаг меняется, пока кнопка зажата (scrubbing, как на шкале видео)
    const scrub = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      onStep(stepAtX(e.clientX - rect.left, this.plot, this.count));
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId); // события придут, даже если мышь ушла с канваса
      scrub(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (canvas.hasPointerCapture(e.pointerId)) scrub(e);
    });

    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  setProbes(probes: ProbeCurve[]) {
    this.probes = probes;
    this.draw();
  }

  setStep(step: number) {
    this.step = step;
    this.draw();
  }

  private get plot() {
    return {
      left: MARGIN.left,
      top: MARGIN.top,
      width: Math.max(1, this.width - MARGIN.left - MARGIN.right),
      height: Math.max(1, this.height - MARGIN.top - MARGIN.bottom),
    };
  }

  private resize() {
    // Канвас в CSS-пикселях × devicePixelRatio — иначе линии и текст размыты на HiDPI
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // дальше рисуем в CSS-пикселях
    this.draw();
  }

  private draw() {
    const { ctx } = this;
    const p = this.plot;
    const x = (step: number) => p.left + (step / (this.count - 1)) * p.width;
    const y = (t: number) => p.top + (1 - t / T_MAX) * p.height;

    ctx.clearRect(0, 0, this.width, this.height);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    // Окно t8/5: 800…500 °C — полоса, в которой скорость остывания решает структуру ЗТВ
    ctx.fillStyle = 'rgba(120, 140, 160, 0.12)';
    ctx.fillRect(p.left, y(800), p.width, y(500) - y(800));

    // Сетка и подписи по температуре
    ctx.strokeStyle = '#2c3138';
    ctx.fillStyle = '#8b949e';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    for (let t = 0; t <= T_MAX; t += T_TICK) {
      ctx.beginPath();
      ctx.moveTo(p.left, y(t) + 0.5);
      ctx.lineTo(p.left + p.width, y(t) + 0.5);
      ctx.stroke();
      ctx.fillText(`${t}`, p.left - 6, y(t));
    }
    // Подписи по шагам
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = 0; s < this.count; s += 5) ctx.fillText(`${s}`, x(s), p.top + p.height + 6);
    ctx.textAlign = 'left';
    ctx.fillText('шаг', p.left + p.width + 6, p.top + p.height + 6);
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(12, p.top + p.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('T, °C', 0, 0);
    ctx.restore();

    // Пороги — пунктиром, как отметки на легенде
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    for (const { value } of THRESHOLDS) {
      ctx.beginPath();
      ctx.moveTo(p.left, y(value) + 0.5);
      ctx.lineTo(p.left + p.width, y(value) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (this.probes.length === 0) {
      ctx.fillStyle = '#8b949e';
      ctx.textAlign = 'center';
      ctx.fillText('Клик по детали — зонд, Shift + клик — ещё один', p.left + p.width / 2, p.top + p.height / 2);
    }

    // Кривые
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.left, p.top, p.width, p.height);
    ctx.clip(); // пик выше T_MAX не вылезает за область графика
    ctx.lineWidth = 2;
    for (const probe of this.probes) {
      ctx.strokeStyle = probe.color;
      ctx.beginPath();
      probe.curve.forEach((t, s) => (s === 0 ? ctx.moveTo(x(s), y(t)) : ctx.lineTo(x(s), y(t))));
      ctx.stroke();
    }
    ctx.restore();

    // Текущий шаг: вертикальная линия и точки на кривых
    const cx = Math.round(x(this.step)) + 0.5;
    ctx.strokeStyle = '#d8dde3';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, p.top);
    ctx.lineTo(cx, p.top + p.height);
    ctx.stroke();
    for (const probe of this.probes) {
      ctx.fillStyle = probe.color;
      ctx.beginPath();
      ctx.arc(cx, y(Math.min(T_MAX, probe.curve[this.step])), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Справа: значения по зондам на текущем шаге
    let ty = p.top + 6;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d8dde3';
    ctx.fillText(`шаг ${this.step} / ${this.count - 1}`, p.left + p.width + 14, ty);
    for (const probe of this.probes) {
      ty += 18;
      ctx.fillStyle = probe.color;
      ctx.fillRect(p.left + p.width + 14, ty - 4, 10, 8);
      ctx.fillStyle = '#d8dde3';
      ctx.fillText(`${probe.label}  T = ${probe.curve[this.step].toFixed(0)} °C`, p.left + p.width + 30, ty);
      ty += 15;
      ctx.fillStyle = '#8b949e';
      const t85 = probe.t85 != null ? `${probe.t85.toFixed(1)} шага` : '—';
      ctx.fillText(`пик ${probe.peak.toFixed(0)} °C · t8/5 ${t85}`, p.left + p.width + 30, ty);
    }
  }
}
