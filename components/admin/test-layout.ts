// jsdom no hace layout (offset* da 0) ni trae ResizeObserver: para los
// tests del indicador deslizante, cada elemento "mide" 80×30 y queda en
// 10 + 100 × (su lugar entre los hermanos) — en x y en y — así se puede ver
// dónde se para el indicador. El indicador mismo no cuenta: es absoluto,
// no corre a nadie.
export function stubLayout() {
  const index = (el: HTMLElement) => Array.from(el.parentElement?.children ?? [])
    .filter(n => !n.hasAttribute('data-sliding-indicator')).indexOf(el);
  Object.defineProperties(HTMLElement.prototype, {
    offsetLeft: { configurable: true, get(this: HTMLElement) { return 10 + index(this) * 100; } },
    offsetTop: { configurable: true, get(this: HTMLElement) { return 10 + index(this) * 100; } },
    offsetWidth: { configurable: true, get() { return 80; } },
    offsetHeight: { configurable: true, get() { return 30; } },
  });
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
