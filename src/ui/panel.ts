/**
 * Правая панель управления: обычный HTML, без UI-библиотек (ADR 0001).
 * Панель только строит элементы и отдаёт их; что делать по событиям — решает main.ts.
 */

/** Секция с заголовком */
export function section(panel: HTMLElement, title: string): HTMLElement {
  const el = document.createElement('section');
  el.className = 'panel-section';
  const h = document.createElement('h2');
  h.textContent = title;
  el.append(h);
  panel.append(el);
  return el;
}

/** Группа кнопок, из которых нажата одна (переключатель) */
export function toggleGroup<T extends string>(
  parent: HTMLElement,
  options: Array<{ value: T; label: string }>,
  initial: T,
  onChange: (value: T) => void,
): (value: T) => void {
  const row = document.createElement('div');
  row.className = 'btn-row';
  const buttons = options.map(({ value, label }) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => {
      select(value);
      onChange(value);
    });
    row.append(b);
    return { value, b };
  });
  const select = (value: T) => {
    for (const { value: v, b } of buttons) b.classList.toggle('active', v === value);
  };
  select(initial);
  parent.append(row);
  return select;
}

/** Ряд обычных кнопок */
export function buttonRow(parent: HTMLElement, buttons: Array<{ label: string; title?: string; onClick: () => void }>) {
  const row = document.createElement('div');
  row.className = 'btn-row';
  for (const { label, title, onClick } of buttons) {
    const b = document.createElement('button');
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    row.append(b);
  }
  parent.append(row);
}

/** Текстовое поле только для чтения (вывод чисел) */
export function readout(parent: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  el.className = 'readout';
  parent.append(el);
  return el;
}
