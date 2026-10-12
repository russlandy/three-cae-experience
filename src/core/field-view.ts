import * as THREE from 'three';
import vertexShader from '../shaders/field.vert.glsl?raw';
import fragmentShader from '../shaders/field.frag.glsl?raw';
import { generateField, seamFromBox, valueAt, type Field, type FieldParams, type Seam } from '../data/field';
import { paletteTexture, type PaletteName } from '../data/palette';
import { cycleAt } from '../data/cycle';
import type { PickResult } from './picking';
import type { Viewer } from './viewer';

export type RangeMode = 'fixed' | 'auto';

/** Фиксированный диапазон легенды: от комнатной до чуть выше плавления стали, °C */
export const FIXED_RANGE: [number, number] = [20, 1600];

const FIELD_PARAMS: Omit<FieldParams, 'seam'> = {
  travelSteps: 30,
  cooldownSteps: 15,
  sigma: 18,
  peak: 1800,
  ambient: 20,
  cooling: 0.82,
};

interface MeshField {
  mesh: THREE.Mesh;
  field: Field;
  attribute: THREE.BufferAttribute;
  originalMaterial: THREE.Material | THREE.Material[];
}

/**
 * Поле температур на детали: значения — атрибутом aScalar, цвет — выборкой из текстуры палитры.
 * Смена шага времени = перезаливка одного Float32-буфера; смена палитры/диапазона = только uniform.
 */
export class FieldView {
  step = 0;
  stepCount = FIELD_PARAMS.travelSteps + FIELD_PARAMS.cooldownSteps;
  rangeMode: RangeMode = 'fixed';
  palette: PaletteName = 'viridis';
  enabled = true;

  readonly material: THREE.ShaderMaterial;
  private viewer: Viewer;
  private meshes: MeshField[] = [];
  private textures: Partial<Record<PaletteName, THREE.DataTexture>> = {};
  private seam: Seam | null = null;
  private clip: THREE.Plane | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPalette: { value: this.texture('viridis') },
        uMin: { value: FIXED_RANGE[0] },
        uMax: { value: FIXED_RANGE[1] },
        uIsoStep: { value: 0 },
        uShade: { value: 0.25 },
        uClipPlane: { value: new THREE.Vector4() },
        uClipEnabled: { value: false },
      },
    });
  }

  /** Посчитать поле для детали и надеть на неё материал поля */
  attach(world: THREE.Group) {
    const seam = (this.seam = seamFromBox(new THREE.Box3().setFromObject(world)));
    this.meshes = [];
    world.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const geometry = o.geometry as THREE.BufferGeometry;
      // Позиции уже в мировых мм (ADR 0005) — считаем поле прямо по буферу
      const positions = geometry.getAttribute('position').array as Float32Array;
      const field = generateField(positions, { ...FIELD_PARAMS, seam });
      const attribute = new THREE.BufferAttribute(new Float32Array(field.steps[0]), 1);
      attribute.setUsage(THREE.DynamicDrawUsage); // подсказка драйверу: буфер будем часто переписывать
      geometry.setAttribute('aScalar', attribute);
      this.meshes.push({ mesh: o, field, attribute, originalMaterial: o.material });
    });
    this.setStep(Math.min(this.step, this.stepCount - 1));
    this.setEnabled(this.enabled);
    this.setClip(this.clip);
  }

  /**
   * Срез плоскостью (null — без среза). Поле режется своим discard в шейдере (ADR 0008),
   * обычный материал детали (поле выключено) — встроенным clippingPlanes three.
   * Обе стороны граней: сквозь срез видна изнанка дальних стенок, иначе деталь выглядит пустой коробкой без задней стенки
   */
  setClip(plane: THREE.Plane | null) {
    this.clip = plane;
    const u = this.material.uniforms;
    u.uClipEnabled.value = plane != null;
    if (plane) u.uClipPlane.value.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const side = plane ? THREE.DoubleSide : THREE.FrontSide;
    this.material.side = side;
    for (const m of this.meshes) {
      for (const mat of [m.originalMaterial].flat()) {
        mat.clippingPlanes = plane ? [plane] : null;
        mat.side = side;
      }
    }
    this.viewer.requestRender();
  }

  /**
   * Поле той же модели в произвольных точках (внутри детали — для 2D-сечения).
   * В поверхностной сетке значений внутри нет; в настоящем расчёте их дала бы объёмная сетка.
   */
  sample(points: Float32Array): Field | null {
    return this.seam ? generateField(points, { ...FIELD_PARAMS, seam: this.seam }) : null;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    for (const m of this.meshes) m.mesh.material = on ? this.material : m.originalMaterial;
    this.viewer.requestRender();
  }

  setStep(step: number) {
    this.step = step;
    for (const m of this.meshes) {
      m.attribute.array.set(m.field.steps[step]); // копия на CPU в тот же буфер
      m.attribute.needsUpdate = true; // → при следующем кадре three перезальёт его в GPU
    }
    this.updateRange();
    this.viewer.requestRender();
  }

  setPalette(name: PaletteName) {
    this.palette = name;
    this.material.uniforms.uPalette.value = this.texture(name);
    this.viewer.requestRender();
  }

  setRangeMode(mode: RangeMode) {
    this.rangeMode = mode;
    this.updateRange();
    this.viewer.requestRender();
  }

  setIsoStep(deg: number) {
    this.material.uniforms.uIsoStep.value = deg;
    this.viewer.requestRender();
  }

  setShade(shade: number) {
    this.material.uniforms.uShade.value = shade;
    this.viewer.requestRender();
  }

  get range(): [number, number] {
    return [this.material.uniforms.uMin.value, this.material.uniforms.uMax.value];
  }

  /** Значение поля в точке попадания луча, °C */
  valueAt(hit: PickResult): number | null {
    const m = this.meshes.find((x) => x.mesh === hit.mesh);
    return m ? valueAt(m.field.steps[this.step], hit.vertices, hit.barycoord) : null;
  }

  /** Термический цикл в точке попадания луча: значение по всем шагам, °C */
  cycle(hit: PickResult): Float32Array | null {
    const m = this.meshes.find((x) => x.mesh === hit.mesh);
    return m ? cycleAt(m.field.steps, hit.vertices, hit.barycoord) : null;
  }

  private updateRange() {
    let [min, max] = FIXED_RANGE;
    if (this.rangeMode === 'auto') {
      // Авто: растянуть палитру на min–max текущего шага
      min = Infinity;
      max = -Infinity;
      for (const m of this.meshes) {
        for (const v of m.field.steps[this.step]) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    this.material.uniforms.uMin.value = min;
    this.material.uniforms.uMax.value = max;
  }

  private texture(name: PaletteName) {
    return (this.textures[name] ??= paletteTexture(name));
  }
}
