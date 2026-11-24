import { describe, expect, it } from 'vitest';
import type { AmenityRow, BuildingRow, PointOfInterestRow, ProjectRow } from '@/types/database';
import {
  armarFicha,
  fichaUnidad,
  filtrarUnidades,
  lineaUnidad,
  resumenInventario,
  unidadesParaAviso,
  type UnidadBot,
} from './ficha';

function unidad(over: Partial<UnidadBot> = {}): UnidadBot {
  return {
    id: 'u-2a',
    edificioId: 'ed-norte',
    codigo: '2A',
    edificio: 'Torre Norte',
    piso: 'Piso 2',
    tipo: '1 dormitorio',
    categoria: 'vivienda',
    ambientes: 2,
    dormitorios: 1,
    banos: 1,
    m2Total: 65,
    m2Cubiertos: 60,
    precio: 120000,
    moneda: 'USD',
    estado: 'available',
    orientacion: null,
    expensas: null,
    cocheras: 0,
    condicion: null,
    features: [],
    fotos: [],
    plano: null,
    plano3d: null,
    ...over,
  };
}

describe('lineaUnidad', () => {
  it('incluye ambientes, m2, precio y estado', () => {
    const t = lineaUnidad(unidad());
    expect(t).toContain('USD 120.000');
    expect(t).toContain('2 amb');
    expect(t).toContain('65 m²');
    expect(t).toContain('Disponible');
  });
  it('sin precio dice "precio a consultar"', () => {
    const t = lineaUnidad(unidad({ precio: null }));
    expect(t).toContain('precio a consultar');
    for (const mal of ['null', 'undefined', 'USD 0']) expect(t).not.toContain(mal);
  });
  it('sin m2 no menciona m²', () => {
    expect(lineaUnidad(unidad({ m2Total: null }))).not.toContain('m²');
  });
  it('formatea ARS', () => {
    expect(lineaUnidad(unidad({ moneda: 'ARS', precio: 95000000 }))).toContain('ARS 95.000.000');
  });
});

describe('fichaUnidad', () => {
  it('omite datos faltantes', () => {
    const t = fichaUnidad(unidad({ precio: null, m2Total: null, expensas: null }));
    for (const mal of ['null', 'undefined', 'NaN']) expect(t).not.toContain(mal);
    expect(t).toContain('precio a consultar');
  });
  it('incluye expensas y cocheras cuando hay', () => {
    const t = fichaUnidad(unidad({ expensas: 50000, cocheras: 1, orientacion: 'NE' }));
    expect(t).toContain('50.000');
    expect(t).toContain('NE');
    expect(t).toContain('ocher');
  });
});

describe('filtrarUnidades', () => {
  const lista = [
    unidad({ codigo: 'A', precio: 100 }),
    unidad({ codigo: 'B', estado: 'reserved' }),
    unidad({ codigo: 'C', estado: 'sold' }),
    unidad({ codigo: 'D', precio: null }),
  ];
  it('por defecto solo disponibles, precio asc con null al final', () => {
    expect(filtrarUnidades(lista, {}).map(u => u.codigo)).toEqual(['A', 'D']);
  });
  it('estado todas', () => {
    expect(filtrarUnidades(lista, { estado: 'todas' })).toHaveLength(4);
  });
  it('precio_max excluye precio null', () => {
    expect(filtrarUnidades(lista, { precio_max: 200000 }).map(u => u.codigo)).toEqual(['A']);
  });
  it('tope 15', () => {
    const muchas = Array.from({ length: 30 }, (_, i) => unidad({ codigo: `U${i}`, precio: i + 1 }));
    expect(filtrarUnidades(muchas, {})).toHaveLength(15);
  });
  it('filtra por ambientes, dormitorios, moneda y edificio', () => {
    const l = [
      unidad({ codigo: 'X', ambientes: 3, dormitorios: 2 }),
      unidad({ codigo: 'Y', moneda: 'ARS' }),
      unidad({ codigo: 'Z', edificio: 'Torre Sur' }),
    ];
    expect(filtrarUnidades(l, { ambientes: 3 }).map(u => u.codigo)).toEqual(['X']);
    expect(filtrarUnidades(l, { dormitorios: 2 }).map(u => u.codigo)).toEqual(['X']);
    expect(filtrarUnidades(l, { moneda: 'ARS' }).map(u => u.codigo)).toEqual(['Y']);
    expect(filtrarUnidades(l, { edificio: 'torre sur' }).map(u => u.codigo)).toEqual(['Z']);
  });
});

describe('resumenInventario', () => {
  it('vacío', () => {
    expect(resumenInventario([])).toBe('Todavía no hay unidades cargadas.');
  });
  it('cuenta y da rango de precios de disponibles sin listar códigos', () => {
    const t = resumenInventario([
      unidad({ codigo: 'AAA1', precio: 100000 }),
      unidad({ codigo: 'BBB2', precio: 200000 }),
      unidad({ codigo: 'CCC3', estado: 'sold', precio: 1 }),
    ]);
    expect(t).toContain('3 unidades');
    expect(t).toContain('2 disponibles');
    expect(t).toContain('USD 100.000');
    expect(t).toContain('USD 200.000');
    expect(t).not.toContain('AAA1');
    expect(t).not.toContain('null');
  });
});

describe('armarFicha', () => {
  const proyecto = { name: 'Torres del Sol', location: 'Palermo, CABA', description: 'Un gran proyecto', tagline: null } as ProjectRow;
  const base = {
    proyecto,
    edificios: [],
    pisos: [],
    amenities: [{ name: 'Pileta', description: null } as AmenityRow],
    pois: [{ name: 'Subte D', walk_minutes: 5, drive_minutes: null, bike_minutes: null, distance_label: null } as PointOfInterestRow],
    calculadora: null,
    resumenUnidades: 'RESUMEN X',
  };
  it('incluye nombre, ubicación, amenities, POI con minutos y conocimiento', () => {
    const t = armarFicha(base, { conocimiento: 'Entrega diciembre 2027 literal' });
    expect(t).toContain('Torres del Sol');
    expect(t).toContain('Palermo, CABA');
    expect(t).toContain('Pileta');
    expect(t).toContain('Subte D');
    expect(t).toContain('5 min');
    expect(t).toContain('Entrega diciembre 2027 literal');
    expect(t).toContain('RESUMEN X');
    expect(t).not.toMatch(/null|undefined/);
  });
  it('no imprime cantidad de pisos si es 0 o null', () => {
    const ed = (n: number | null) => ({ name: 'Torre', total_floors: n }) as unknown as BuildingRow;
    const t = armarFicha({ ...base, edificios: [ed(0), ed(null), ed(3)] }, { conocimiento: null });
    expect(t).not.toMatch(/null|undefined|0 pisos/);
    expect(t).toContain('3 pisos');
  });
  it('sin calculadora no menciona tasas', () => {
    expect(armarFicha(base, { conocimiento: null }).toLowerCase()).not.toContain('tasa');
  });
  it('con calculadora la incluye como simulador de referencia, no como oferta de financiación', () => {
    const t = armarFicha({ ...base, calculadora: { interest_rate: 8, max_years: 20, min_down_payment: 30 } }, { conocimiento: null });
    expect(t).toContain('8%');
    expect(t.toLowerCase()).toContain('tasa');
    expect(t).toContain('## Simulador de cuotas de referencia (no es una oferta de financiación del desarrollador)');
    expect(t).not.toContain('## Financiación');
  });
  it('con planes de pago en pozo los da como condiciones oficiales y no menciona el simulador hipotecario', () => {
    const plan = { id: 'p1', name: 'Plan 36', downPaymentPct: 30, installments: 36, installmentsPct: 40, boosts: 3, boostEveryMonths: 6, boostsPct: 15, priceAdjustmentPct: 0, index: 'CAC' as const };
    const t = armarFicha({ ...base, calculadora: { interest_rate: 8, max_years: 20, min_down_payment: 30, financing_plans: [plan] } }, { conocimiento: null });
    expect(t).toContain('## Planes de pago del desarrollador');
    expect(t).toContain('Plan 36: 30% de anticipo + 36 cuotas + 3 refuerzos semestrales + 15% a la posesión · cuotas ajustables por CAC');
    expect(t).not.toContain('Simulador de cuotas de referencia');
    // El bot no hace cuentas de cabeza: trae un ejemplo calculado y presenta montos como aproximados.
    expect(t).toContain('Ejemplo sobre 100.000: anticipo 30.000 · 36 cuotas de 1.111 · 3 refuerzos de 5.000 · posesión 15.000');
    expect(t.toLowerCase()).toContain('aproximad');
  });
});

describe('unidadesParaAviso', () => {
  it('describe cada código con ambientes, m² y precio (sin importar mayúsculas)', () => {
    const us = [unidad(), unidad({ codigo: '3B', ambientes: 3, m2Total: 80, precio: null })];
    expect(unidadesParaAviso(['2a', ' 3B '], us)).toEqual([lineaUnidad(us[0]), lineaUnidad(us[1])]);
    expect(unidadesParaAviso(['2A'], us)[0]).toBe('2A (Torre Norte, Piso 2) · 1 dormitorio · 2 amb · 65 m² · USD 120.000 · Disponible');
    expect(unidadesParaAviso(['3B'], us)[0]).toContain('precio a consultar');
  });
  it('un código que no existe va tal cual; vacíos se descartan', () => {
    expect(unidadesParaAviso(['9Z', '  '], [unidad()])).toEqual(['9Z']);
  });
});

describe('armarFicha: contexto ampliado', () => {
  const proyecto = {
    name: 'Torres del Sol', location: 'Palermo', description: null, tagline: null,
    latitude: -34.58, longitude: -58.42, masterplan_image: 'https://x/mp.jpg',
  } as unknown as ProjectRow;
  const base = {
    proyecto,
    edificios: [{ id: 'e1', name: 'Torre Norte', total_floors: 10, cover_image: 'https://x/tn.jpg' } as unknown as BuildingRow],
    pisos: [],
    amenities: [
      {
        name: 'Pileta', description: 'Climatizada', category: 'Recreación', building_id: 'e1',
        specs: [{ key: 'Largo', value: '12 m' }], images: ['https://x/p.jpg'],
      } as unknown as AmenityRow,
    ],
    pois: [{ name: 'Parque', description: 'Con bicisenda', walk_minutes: 3, drive_minutes: null, bike_minutes: null, distance_label: null } as PointOfInterestRow],
    calculadora: null,
    resumenUnidades: 'R',
    slides: [{ label: 'Vista dron', image_url: 'https://x/dron.jpg' }],
    avance: {
      stages: [{ id: 's1', label: 'Excavación' }, { id: 's2', label: 'Estructura' }],
      currentStageId: 's2',
      percent: 45,
      deliveryEstimate: 'Diciembre 2027',
      updates: [
        { id: 'u1', date: '2026-09-01', title: 'Losa 3', images: [] },
        { id: 'u2', date: '2026-10-01', title: 'Losa 5', body: 'Avanzamos rápido', images: ['https://x/o.jpg'] },
      ],
    },
    sitio: 'https://torres.ejemplo.com',
  };

  it('incluye avance de obra, entrega estimada y novedades más nuevas primero', () => {
    const t = armarFicha(base, { conocimiento: null });
    expect(t).toContain('Etapa actual: Estructura');
    expect(t).toContain('Avance: 45%');
    expect(t).toContain('Entrega estimada: Diciembre 2027');
    expect(t.indexOf('Losa 5')).toBeLessThan(t.indexOf('Losa 3'));
  });

  it('detalle de amenities (categoría, edificio, specs) y descripción de POI', () => {
    const t = armarFicha(base, { conocimiento: null });
    expect(t).toContain('Pileta (Recreación, Torre Norte): Climatizada. Largo: 12 m');
    expect(t).toContain('Con bicisenda');
  });

  it('links de sitio y mapa, y catálogo de imágenes para enviar_material', () => {
    const t = armarFicha(base, { conocimiento: null });
    expect(t).toContain('https://torres.ejemplo.com');
    expect(t).toContain('https://www.google.com/maps?q=-34.58,-58.42');
    expect(t).toContain('renders: Vista dron');
    expect(t).toContain('masterplan');
    expect(t).toContain('amenity (fotos): Pileta');
    expect(t).toContain('avance_obra');
    expect(t).not.toMatch(/null|undefined/);
  });

  it('con brief cargado, la ficha lo lista para enviar_material', () => {
    const t = armarFicha({ ...base, proyecto: { ...proyecto, brief_pdf_url: 'https://x/b.pdf' } as ProjectRow }, { conocimiento: null });
    expect(t).toContain('- brief:');
    const sin = armarFicha(base, { conocimiento: null });
    expect(sin).not.toContain('- brief:');
  });

  it('sin sitio, sin avance y sin material no agrega esas secciones', () => {
    const t = armarFicha(
      { ...base, sitio: null, avance: null, slides: [], proyecto: { ...proyecto, masterplan_image: null, latitude: null } as ProjectRow, edificios: [], amenities: [] },
      { conocimiento: null },
    );
    expect(t).not.toContain('Sitio web');
    expect(t).not.toContain('Avance de obra');
    expect(t).not.toContain('enviar_material');
    expect(t).not.toContain('maps');
  });
});

describe('armarFicha: preguntas frecuentes', () => {
  const proyecto = { name: 'Torres', location: null, description: null, tagline: null } as ProjectRow;
  const base = { proyecto, edificios: [], pisos: [], amenities: [], pois: [], calculadora: null, resumenUnidades: 'R' };
  it('incluye las respondidas como P/R y sin faq no agrega la sección', () => {
    const t = armarFicha({ ...base, faq: [{ pregunta: '¿Aceptan mascotas?', respuesta: 'Sí, hasta 2.' }] }, { conocimiento: null });
    expect(t).toContain('## Preguntas frecuentes');
    expect(t).toContain('P: ¿Aceptan mascotas?');
    expect(t).toContain('R: Sí, hasta 2.');
    expect(armarFicha(base, { conocimiento: null })).not.toContain('Preguntas frecuentes');
  });
});

