import * as THREE from 'three';

/**
 * Сколько миллиметров мира приходится на один CSS-пиксель экрана
 * на расстоянии точки интереса `target`.
 */
export function mmPerPixel(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  target: THREE.Vector3,
  viewportHeightPx: number,
): number {
  if (camera instanceof THREE.OrthographicCamera) {
    // У орто высота кадра одинакова на любой глубине — точка интереса не нужна
    return (camera.top - camera.bottom) / camera.zoom / viewportHeightPx;
  }
  // Видимая высота на расстоянии d: 2 · d · tan(fov / 2)
  const d = camera.position.distanceTo(target);
  const visibleHeight = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return visibleHeight / viewportHeightPx;
}

/**
 * Длина масштабной линейки: самое большое «круглое» число 1·10ⁿ, 2·10ⁿ или 5·10ⁿ мм,
 * которое помещается в maxPx пикселей.
 */
export function niceScaleBar(mmPerPx: number, maxPx: number): { mm: number; px: number } {
  const maxMm = mmPerPx * maxPx;
  const pow = 10 ** Math.floor(Math.log10(maxMm)); // 37 мм → 10
  const mm = [5, 2, 1].map((k) => k * pow).find((v) => v <= maxMm)!;
  return { mm, px: mm / mmPerPx };
}
