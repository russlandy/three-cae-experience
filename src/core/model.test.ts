import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { ModelSlot } from './model';

/** Считает события dispose: three шлёт их ресурсу, когда его освобождают (и рендерер удаляет GPU-буферы) */
function track(resource: THREE.EventDispatcher<{ dispose: object }>) {
  const counter = { disposed: 0 };
  resource.addEventListener('dispose', () => counter.disposed++);
  return counter;
}

const worldGeometry = (slot: ModelSlot) => (slot.world.children[0] as THREE.Mesh).geometry;
const mm = { unit: 'mm', zUp: false } as const;

describe('ModelSlot: кто освобождает GPU-ресурсы детали', () => {
  test('смена единиц: геометрия старого мира (клон) освобождается, общий с исходником материал — нет', () => {
    const material = new THREE.MeshBasicMaterial();
    const slot = new ModelSlot(new THREE.Scene());
    slot.set('a', new THREE.Mesh(new THREE.BoxGeometry(), material), mm);
    const oldGeometry = track(worldGeometry(slot));
    const materialEvents = track(material);

    slot.apply({ unit: 'cm', zUp: false });

    expect(oldGeometry.disposed).toBe(1);
    expect(materialEvents.disposed).toBe(0); // исходник ещё нужен для следующей смены единиц
  });

  test('новый файл: освобождаются и геометрия старого мира, и материалы старого исходника', () => {
    const material = new THREE.MeshBasicMaterial();
    const slot = new ModelSlot(new THREE.Scene());
    slot.set('a', new THREE.Mesh(new THREE.BoxGeometry(), material), mm);
    const oldGeometry = track(worldGeometry(slot));
    const materialEvents = track(material);

    slot.set('b', new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), mm);

    expect(oldGeometry.disposed).toBe(1);
    expect(materialEvents.disposed).toBe(1);
  });
});
