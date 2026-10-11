import { describe, expect, test } from 'vitest';
import { PALETTES, paletteData } from './palette';

const texel = (data: Uint8Array, i: number) => Array.from(data.slice(i * 4, i * 4 + 4));

describe('paletteData: стопы → RGBA для одномерной текстуры', () => {
  test('чёрный → белый на 3 тексела: 0, 128, 255 (линейная интерполяция), альфа 255', () => {
    const data = paletteData(['#000000', '#ffffff'], 3);

    expect(texel(data, 0)).toEqual([0, 0, 0, 255]);
    expect(texel(data, 1)).toEqual([128, 128, 128, 255]);
    expect(texel(data, 2)).toEqual([255, 255, 255, 255]);
  });

  test('viridis на 256: первый тексел = #440154, последний = #fde725', () => {
    const data = paletteData(PALETTES.viridis, 256);

    expect(texel(data, 0)).toEqual([0x44, 0x01, 0x54, 255]);
    expect(texel(data, 255)).toEqual([0xfd, 0xe7, 0x25, 255]);
  });
});
