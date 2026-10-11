import * as THREE from 'three';

export type PaletteName = 'viridis' | 'jet';

export const PALETTES: Record<PaletteName, string[]> = {
  // Перцептивно равномерная: равный шаг значения — равный шаг воспринимаемой яркости/цвета
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  // «Радуга»: неравномерная — яркие жёлтый и голубой выглядят как границы, которых в данных нет
  jet: ['#00007f', '#0000ff', '#007fff', '#00ffff', '#7fff7f', '#ffff00', '#ff7f00', '#ff0000', '#7f0000'],
};

/** Стопы → RGBA (по 4 байта на тексел), линейная интерполяция между соседними стопами */
export function paletteData(stops: string[], size = 256): Uint8Array {
  // Интерполируем прямо в sRGB-байтах, НЕ через THREE.Color: тот переводит hex в линейное
  // пространство, и середина чёрного и белого вышла бы 188, а не 128. Палитры (viridis и др.)
  // определены с интерполяцией в sRGB, и GPU с LinearFilter тоже смешивает сырые байты текстуры
  const rgb = stops.map((s) => {
    const n = parseInt(s.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const t = (i / (size - 1)) * (rgb.length - 1); // позиция в «стопах»
    const j = Math.min(Math.floor(t), rgb.length - 2);
    const f = t - j;
    for (let ch = 0; ch < 3; ch++) data[i * 4 + ch] = Math.round(rgb[j][ch] + (rgb[j + 1][ch] - rgb[j][ch]) * f);
    data[i * 4 + 3] = 255;
  }
  return data;
}

/**
 * Палитра как одномерная текстура 256 × 1.
 * colorSpace не выставляем (NoColorSpace): шейдер получит байты как есть и выведет их как есть —
 * цвета на экране совпадут с hex стопов. С SRGBColorSpace GPU декодировал бы их в линейные,
 * а наш ShaderMaterial не кодирует обратно — картинка потемнела бы.
 */
export function paletteTexture(name: PaletteName): THREE.DataTexture {
  const size = 256;
  const tex = new THREE.DataTexture(paletteData(PALETTES[name], size), size, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; // интерполяция между текселами
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; // t = 0 и 1 не «заворачиваются» на другой край
  tex.needsUpdate = true;
  return tex;
}

/** CSS-градиент той же палитры для легенды: снизу (min) вверх (max) */
export function cssGradient(name: PaletteName): string {
  return `linear-gradient(to top, ${PALETTES[name].join(', ')})`;
}
