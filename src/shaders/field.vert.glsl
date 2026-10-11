// Вершинный шейдер поля. projectionMatrix, modelViewMatrix, modelMatrix, normalMatrix, position, normal
// three подставляет сам (ShaderMaterial добавляет эти объявления перед нашим кодом).

attribute float aScalar;   // значение поля в вершине, °C — приходит из буфера, меняется по шагам времени

varying float vScalar;     // → во фрагментный: GPU интерполирует его по треугольнику (барицентрия)
varying vec3 vNormalView;  // нормаль в пространстве камеры — для «головного» света
varying vec3 vWorldPos;    // мировая позиция фрагмента — для плоскости среза (она задана в мире)

void main() {
  vScalar = aScalar;
  vNormalView = normalize(normalMatrix * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
