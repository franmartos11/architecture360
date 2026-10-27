import type { CSSProperties } from 'react';

// Config compartida de los visores de plano (react-zoom-pan-pinch v4).
// En v4 la rueda es lineal: cada evento suma `step * |deltaY|` a la escala.
// El 0.1 que traíamos de v3 hacía que UN clic de rueda (deltaY ≈ 100) fuera
// directo a maxScale. Con 0.002 un clic suma +0.2 y el trackpad es continuo.
export const PLAN_WHEEL = { step: 0.002 };

// El doble click es exponencial (scale * e^step): 0.7 ≈ ×2 por doble click.
export const PLAN_DOUBLE_CLICK = { step: 0.7 };

// El contenido del TransformComponent es un size container, así el plano se
// topea con `max-h-[100cqh]`/`max-w-[100cqw]` contra el área REAL del visor.
// Con `max-h-[85vh]` el tope era la ventana (sin descontar nav ni solapas) y
// el plano quedaba recortado abajo, sin poder panearlo.
export const PLAN_CONTENT_STYLE: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  containerType: 'size',
};
