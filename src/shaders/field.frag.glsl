uniform sampler2D uPalette;  // палитра — одномерная текстура 256 × 1
uniform float uMin;          // диапазон легенды, °C
uniform float uMax;
uniform float uIsoStep;      // шаг изотерм, °C; 0 — выключены
uniform float uShade;        // 0..1 — сколько затенения подмешать
uniform vec4 uClipPlane;     // плоскость среза в мире: xyz — нормаль, w — константа; d = n·p + w
uniform bool uClipEnabled;

varying float vScalar;
varying vec3 vNormalView;
varying vec3 vWorldPos;

const float PALETTE_SIZE = 256.0;

void main() {
  // --- значение → координата в палитре ---
  float t = clamp((vScalar - uMin) / max(uMax - uMin, 1e-6), 0.0, 1.0);
  // Центры крайних текселов: u = 0.5/N и (N − 0.5)/N. Без этой поправки t = 0..1 растянулось бы
  // на полтексела за края, и крайние цвета палитры были бы смазаны с соседними
  float u = (t * (PALETTE_SIZE - 1.0) + 0.5) / PALETTE_SIZE;
  vec3 color = texture2D(uPalette, vec2(u, 0.5)).rgb;

  // --- изотермы: линии на значениях, кратных uIsoStep ---
  if (uIsoStep > 0.0) {
    float s = vScalar / uIsoStep;              // целые s — изотермы
    float distToLine = abs(fract(s - 0.5) - 0.5); // расстояние до ближайшего целого, в «шагах»
    // fwidth(s) — насколько s меняется за 1 пиксель экрана. Деление переводит расстояние в пиксели:
    // линия ~1 px толщиной при любом зуме и любой крутизне поля
    float px = distToLine / max(fwidth(s), 1e-6);
    color *= mix(0.45, 1.0, smoothstep(0.5, 1.5, px));
  }

  // --- лёгкое затенение от «головного» света (из камеры), чтобы читалась форма ---
  // Освещение искажает считывание цвета, поэтому по умолчанию его мало (uShade ≈ 0.25)
  float lambert = abs(normalize(vNormalView).z);
  color *= mix(1.0, 0.45 + 0.55 * lambert, uShade);

  // --- изнанка: при срезе сквозь дыру видна внутренняя сторона дальних граней ---
  // Красить её полем нельзя: это температура на поверхности дальней стенки, а глаз прочтёт её
  // как цвет сечения. Нейтральный серый честно говорит «сечения здесь нет».
  // Настоящее решение — заглушка через трафарет (stencil), см. docs/steps/08
  if (!gl_FrontFacing) color = vec3(0.32) * (0.6 + 0.4 * lambert);

  // --- срез: всё по отрицательную сторону плоскости не рисуем ---
  // discard — в самом конце: производные (fwidth выше) внутри ветвления после discard не определены
  if (uClipEnabled && dot(uClipPlane.xyz, vWorldPos) + uClipPlane.w < 0.0) discard;

  gl_FragColor = vec4(color, 1.0);
}
