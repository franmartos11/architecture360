# Calculadora de financiación en pozo — diseño

Fecha: 2026-11-24 · Estado: aprobado (opción A; el usuario pidió arrancar y delegó el resto)

## Para qué

Sale del análisis competitivo contra Urbania3D ("calculadoras de financiación: anticipo, cuotas y refuerzos definidos por el equipo"). En Argentina un desarrollo en pozo se vende con **planes de pago** del desarrollador (anticipo + cuotas durante la obra + refuerzos + saldo a la posesión, con cuotas ajustables por CAC), no con un crédito hipotecario. Atrium hoy solo tiene un simulador hipotecario (tasa, plazo en años, anticipo %).

## Decisión del usuario

**Planes cerrados que carga la desarrolladora** (opción A). El comprador elige unidad/modelo y plan, y ve el desglose exacto. Descartada la calculadora libre con límites (B): puede mostrar combinaciones que el desarrollador no ofrece.

## Objetivos

- La desarrolladora carga de 1 a 6 planes por proyecto en Configuración.
- Donde hoy está el simulador hipotecario (sección "Cotizador" del sitio, modal de la unidad en escritorio, bloque de cuota de la unidad en celular), si el proyecto tiene planes se muestran los planes; si no, sigue el hipotecario como hoy.
- Desglose por plan sobre el precio de la unidad/modelo: precio del plan (con descuento o recargo), anticipo, N cuotas de $X, R refuerzos de $Y cada M meses, saldo a la posesión, y la leyenda del ajuste (CAC, UVA, etc.).
- "Consultar por este plan" abre el formulario de contacto con el plan y los montos en el mensaje.
- El bot de WhatsApp conoce los planes (son condiciones oficiales del desarrollador).
- Habilitar la calculadora en loteos (hoy deshabilitada; es donde más se vende en cuotas).

## No-objetivos

- Proyectar el ajuste por CAC/UVA a futuro (las cuotas se muestran a valores de hoy, con la leyenda del índice).
- Planes distintos por unidad o tipología (un plan aplica a todo el proyecto).
- Cuotas en otra moneda que la de la unidad.
- Reserva / pago online.

## Anti-objetivos

- Que el comprador vea un plan que no suma 100% o montos que no cierran.
- Romper el simulador hipotecario de los proyectos que no cargan planes.

## Enfoques considerados

- **Planes como lista JSON en `calculator_settings` (elegido).** Una columna `financing_plans jsonb`; las tres calculadoras del sitio ya leen `/api/settings` (lectura pública existente) y el panel ya escribe ahí con sus permisos. Sin tabla, RLS ni rutas nuevas.
- **Tabla `financing_plans` propia.** Más "normal", pero suma tabla, políticas, rutas CRUD y lectura pública nueva para una lista de a lo sumo 6 elementos que siempre se lee y guarda entera. Descartado.

## Diseño

**Plan** (`lib/financing.ts`):
`{ id, name, downPaymentPct, installments, installmentsPct, boosts, boostEveryMonths, boostsPct, priceAdjustmentPct, index: 'ninguno'|'CAC'|'UVA'|'dolar', note? }`.
Saldo a la posesión = 100 − anticipo − cuotas − refuerzos (≥ 0). Validación con zod: porcentajes 0–100, suma ≤ 100, cuotas > 0 si % de cuotas > 0 (y viceversa), lo mismo para refuerzos, ajuste de precio entre −50 y +50, máximo 6 planes.

**Cálculo** `computePlan(price, plan)`: precio del plan = precio × (1 + ajuste/100); cada parte es su % del precio del plan; cuota = total en cuotas / N; refuerzo = total en refuerzos / R.

**API** `/api/settings`: GET suma `financingPlans` (lista validada; si viene algo inválido de la base, se descarta ese plan). POST acepta cualquier subconjunto de `{ interestRate, maxYears, minDownPayment, financingPlans }` y solo actualiza lo que llega (guardar el hipotecario no pisa los planes y viceversa).

**SQL**: `alter table calculator_settings add column if not exists financing_plans jsonb not null default '[]'::jsonb;` (se corre a mano en producción antes de deployar).

**Sitio**: hook `useCalculatorSettings(projectSlug)` compartido por las tres calculadoras. Componentes `PlanPicker` + `PlanBreakdown`. Mientras carga no se muestra la calculadora (evita que aparezca el hipotecario y salte a planes).

**Panel**: en Configuración, debajo de la calculadora, "Planes de pago en pozo": agregar (con plantilla 30% + 36 cuotas + 3 refuerzos semestrales), editar, borrar, reordenar, con el saldo a la posesión calculado y un ejemplo sobre 100.000 en vivo. Se guarda junto.

**Bot**: la ficha suma "Planes de pago oficiales del desarrollador" con la descripción de cada plan. El texto del simulador hipotecario queda solo si no hay planes.

## Llamadas mías (corregibles)

- Hasta 6 planes; el primero es el seleccionado por defecto.
- Índices ofrecidos: sin ajuste, CAC, UVA, dólar (solo leyenda).
- Refuerzos: cantidad + cada cuántos meses (default 6) + % total; montos iguales.
- Descuento/recargo por plan sobre el precio de lista (ej. contado −10%).
- Loteos habilitados para la calculadora **solo cuando tienen planes cargados** (sin planes no se muestra nada: un simulador hipotecario sobre lotes confunde).
- Con planes cargados, el hipotecario deja de mostrarse en el sitio (no conviven).
- La calculadora de una unidad sin precio no se muestra (antes se calculaba sobre un valor inventado de 150.000).
- El bot recibe un ejemplo ya calculado de cada plan (sobre 100.000) y da los montos como aproximados, mandando a la ficha de la unidad para el detalle.
