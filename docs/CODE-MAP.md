# Карта кода

Где что лежит и кто кого вызывает. Состояние на шаг 8.

## Файлы

```
index.html                  каркас: #viewport (сцена + HTML-слои), #panel справа
src/
  main.ts                   ТОЧКА СБОРКИ. Создаёт всё, связывает панель с ядром. Логики почти нет
  style.css                 сетка страницы, панель, подписи, линейка, drop-зона

  core/                     — ядро вьюера: сцена, камеры, навигация
    viewer.ts               Viewer: рендерер, сцена, РЕНДЕР ПО ТРЕБОВАНИЮ, ресайз, хуки до/после кадра; localClippingEnabled
    cameras.ts              CameraRig: орто + перспектива, точка интереса, виды, fit, near/far
    zoom.ts                 zoomAt(): зум к курсору / к центру (инвариант «точка под курсором»)
    controls.ts             Navigation: OrbitControls (вращение, панорама, инерция) + колесо → zoomAt
    scale.ts                mmPerPixel(), niceScaleBar() — математика масштабной линейки
    reference.ts            сетка-пол и оси; соглашение «мм, Y вверх» записано здесь
    lights.ts               полусферический свет + «головной» свет за камерой
    model.ts                ModelSlot: текущая деталь в сцене + исходник для смены единиц
    picking.ts              pixelToNdc (общая), pick: луч → точка/нормаль/треугольник/барицентрия; пропуск отрезанного; замер
    selection.ts            Selection: маркер постоянного экранного размера + подсветка треугольника
    field-view.ts           FieldView: поле на детали (атрибут aScalar + ShaderMaterial), шаг, палитра, диапазон,
                            срез setClip (uniform + clippingPlanes), sample() — поле в любых точках

  data/                     — данные извне
    loaders.ts              parseModel (STL/glTF), toWorldMm (ЕДИНСТВЕННОЕ место конвертации), describeModel
    field.ts                generateField (источник по шву + остывание), valueAt (барицентрия), seamFromBox
    palette.ts              viridis / jet → RGBA → DataTexture 256×1; CSS-градиент для легенды
    section.ts              planeAt, sliceMesh (сетка ∩ плоскость → отрезки), sectionAxes, sectionRaster (scanline),
                            sectionOf: деталь + плоскость → ячейки сечения и их мировые точки

  shaders/
    field.vert.glsl         aScalar → varying, нормаль в пространстве камеры, мировая позиция (для среза)
    field.frag.glsl         значение → палитра; изотермы через fwidth; лёгкое затенение; серая изнанка; discard по срезу

  ui/                       — HTML поверх и справа от сцены
    panel.ts                строительные блоки панели: секция, переключатель, кнопки, список, галочка
    overlay.ts              подписи осей (мир → экран) и масштабная линейка
    legend.ts               цветовая шкала поля с порогами 1500 / 900 / 720 °C
    section-view.ts         SectionView: 2D-сечение — канвас, ячейка = пиксель, линии порогов

  *.test.ts                 тесты рядом с модулем (Vitest): scale, cameras, zoom, loaders, picking, field, palette, section

scripts/make-samples.mjs    генератор тестовых моделей
samples/                    plate-cm-zup.stl (см, Z↑), plate-m.gltf (м, Y↑)
docs/
  README.md                 журнал шагов
  CODE-MAP.md               этот файл
  steps/NN-*.md             что сделано на шаге и почему
  adr/NNNN-*.md             решения, которые надо уметь защитить
  grilling/NN-*.md          вопросы собеседования по шагу
CONTEXT.md                  словарь предметной области
```

## Кто кого вызывает

```
main.ts
 ├─ new Viewer(canvas) ─────────────── владеет ──▶ CameraRig (cameras.ts)
 │     requestRender() ◀── все, кто меняет сцену или камеру
 │     onBeforeRender ──▶ controls.update() (инерция), свет за камерой
 │     onRender ──▶ overlay.update(), счётчики
 ├─ createReference() ──▶ сетка + оси в сцену
 ├─ addLights(viewer)
 ├─ new Overlay ──▶ scale.ts (mmPerPixel, niceScaleBar)
 ├─ new Navigation ──▶ OrbitControls + колесо ──▶ zoomAt(rig, …)
 ├─ new ModelSlot(scene)
 │     set()/apply() ──▶ loaders.toWorldMm ──▶ describeModel
 └─ панель (panel.ts) — кнопки вызывают rig.setView / rig.fit / rig.setProjection / loadFile
        loadFile ──▶ loaders.parseModel ──▶ model.set ──▶ rig.fit ──▶ requestRender
```

## Потоки событий

**Кадр** (только по запросу):
`requestRender()` → `requestAnimationFrame` → сброс флага → `onBeforeRender` (контролы, свет) →
`renderer.render` → `onRender` (оверлей, счётчики).

**Колесо:** `controls.ts onWheel` → пиксели → NDC → `zoomAt` (меняет камеру и точку интереса,
для орто — высоту кадра) → `requestRender`.

**Мышь (вращение/панорама):** OrbitControls двигает камеру → событие `change` → `requestRender`.
После отпускания инерцию докручивает `controls.update()` в `onBeforeRender`.

**Загрузка файла:** input/drop → `parseModel` → `ModelSlot.set` → `toWorldMm` → `fit` → кадр.
**Смена единиц:** select/checkbox → `ModelSlot.apply` (из сохранённого исходника) → `fit` → кадр.

## Состояние: кто чем владеет

| Состояние | Владелец | Кто ещё читает/пишет |
|---|---|---|
| точка интереса (`Vector3`) | `CameraRig.target` | тот же объект у `OrbitControls.target`; `zoomAt` двигает |
| масштаб орто | `CameraRig.frustumHeight` | только через `setOrthoHeight` / `fit` / `setProjection` |
| активная камера | `CameraRig.active` | `Viewer.camera` (геттер), `Navigation.syncCamera` |
| деталь в сцене | `ModelSlot.world` | `fit` берёт `model.box()` |
| единицы детали | `ModelSlot.options` | панель показывает |

**Клик (выбор):** `pointerdown` запоминает позицию → `pointerup` со сдвигом < 4 px →
`pixelToNdc` → `pick(camera, ndc, [model.world])` → `selection.show` (маркер + треугольник) →
панель «Выбор» + `measurePickMs`. Смена детали/единиц → `clearPick`.

**Смена детали:** `onModelChanged()` в main.ts — сброс выбора → сводка → `field.attach(model.world)`
(генерация поля по вершинам, атрибут `aScalar`, материал поля) → fit.

**Смена шага времени:** ползунок → `field.setStep(k)` → `attribute.array.set(steps[k])`,
`needsUpdate = true` → пересчёт диапазона (если авто) → кадр → легенда обновляется в `onRender`.
Палитра / диапазон / изотермы / затенение — только uniform материала.

**Срез:** панель «Срез» → `updateClip()` в main.ts → сброс выбора → `planeAt(box, ось, доля)` (один
и тот же объект `clipPlane` меняется на месте) → `field.setClip(plane)`: uniform `uClipPlane` для
шейдера поля, `clippingPlanes = [plane]` для обычного материала, обе стороны граней → кадр.
Дальше 2D: `sectionOf(геометрии, plane, ось, ячейка)` → `field.sample(точки ячеек)` (поле по шагам) →
`sectionView.set` → `draw(шаг, диапазон, палитра)`. Смена шага/палитры/диапазона → только `draw`.
**Клик при срезе:** `pick(…, clipPlane)` берёт первое попадание с видимой стороны плоскости.
