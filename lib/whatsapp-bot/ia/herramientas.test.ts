import { describe, expect, it, vi } from 'vitest';
import type { UnidadBot } from '../ficha';
import { HERRAMIENTAS, HERRAMIENTAS_WEB, ejecutarHerramienta, type DepsHerramientas } from './herramientas';

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

function deps(over: Partial<DepsHerramientas> = {}): DepsHerramientas {
  return {
    unidades: [],
    material: { renders: [], masterplan: null, brief: null, edificios: [], amenities: [], avance: [] },
    linkUnidad: () => null,
    anotarPregunta: vi.fn(async () => {}),
    encolarImagenes: vi.fn(async () => {}),
    avisar: vi.fn(async () => 'avisado' as const),
    ...over,
  };
}

const BUSQUEDA_VACIA = {
  ambientes: null,
  dormitorios: null,
  precio_max: null,
  moneda: null,
  edificio: null,
  estado: null,
};

describe('HERRAMIENTAS', () => {
  it('define las diez herramientas estrictas y cerradas', () => {
    expect(HERRAMIENTAS.map(t => t.name)).toEqual([
      'buscar_unidades',
      'ver_unidad',
      'enviar_imagenes',
      'simular_financiacion',
      'enviar_material',
      'anotar_pregunta',
      'ver_horarios_visita',
      'agendar_visita',
      'cancelar_visita',
      'avisar_vendedor',
    ]);
    for (const t of HERRAMIENTAS) {
      expect(t.strict).toBe(true);
      expect(t.input_schema.additionalProperties).toBe(false);
      // Modo estricto: todas las propiedades declaradas van en required (las opcionales son nullable).
      expect([...(t.input_schema.required ?? [])].sort()).toEqual(
        Object.keys(t.input_schema.properties ?? {}).sort(),
      );
    }
  });
});

describe('ejecutarHerramienta', () => {
  it('buscar_unidades lista una línea por unidad disponible', async () => {
    const d = deps({
      unidades: [
        unidad({ codigo: '3B', precio: 150000 }),
        unidad({ codigo: '2A', precio: 120000 }),
        unidad({ codigo: '4C', estado: 'sold' }),
      ],
    });
    const r = await ejecutarHerramienta('buscar_unidades', BUSQUEDA_VACIA, d);
    expect(r.esError).toBe(false);
    const lineas = r.texto.split('\n');
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toContain('2A');
    expect(lineas[1]).toContain('3B');
  });

  it('buscar_unidades avisa cuando recorta la lista', async () => {
    const unidades = Array.from({ length: 20 }, (_, i) => unidad({ codigo: `U${i}`, precio: 100000 + i }));
    const r = await ejecutarHerramienta('buscar_unidades', { ...BUSQUEDA_VACIA, ambientes: 2 }, deps({ unidades }));
    expect(r.texto.split('\n')).toHaveLength(16);
    expect(r.texto).toContain('(mostrando 15 de 20)');
  });

  it('buscar_unidades sin coincidencias', async () => {
    const r = await ejecutarHerramienta(
      'buscar_unidades',
      { ...BUSQUEDA_VACIA, ambientes: 5 },
      deps({ unidades: [unidad()] }),
    );
    expect(r).toEqual({ texto: 'No hay unidades que coincidan con esos filtros.', esError: false });
  });

  it('buscar_unidades acepta estado "todas"', async () => {
    const r = await ejecutarHerramienta(
      'buscar_unidades',
      { ...BUSQUEDA_VACIA, estado: 'todas' },
      deps({ unidades: [unidad(), unidad({ codigo: '9Z', estado: 'sold' })] }),
    );
    expect(r.texto.split('\n')).toHaveLength(2);
  });

  it('ver_unidad devuelve la ficha y qué material hay', async () => {
    const d = deps({ unidades: [unidad({ fotos: ['a.jpg', 'b.jpg'], plano: 'p.png' })] });
    const r = await ejecutarHerramienta('ver_unidad', { codigo: '2a' }, d);
    expect(r.esError).toBe(false);
    expect(r.texto).toContain('Unidad 2A');
    expect(r.texto).toContain('2 fotos');
    expect(r.texto).toContain('plano');
  });

  it('ver_unidad con código inexistente es error', async () => {
    const r = await ejecutarHerramienta('ver_unidad', { codigo: 'X' }, deps({ unidades: [unidad()] }));
    expect(r).toEqual({ texto: 'No existe la unidad X', esError: true });
  });

  it('enviar_imagenes con fotos encola como mucho 3', async () => {
    const d = deps({ unidades: [unidad({ fotos: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg'] })] });
    const r = await ejecutarHerramienta('enviar_imagenes', { codigo: '2A', que: 'fotos' }, d);
    expect(r.esError).toBe(false);
    expect(d.encolarImagenes).toHaveBeenCalledTimes(1);
    expect(d.encolarImagenes).toHaveBeenCalledWith(['1.jpg', '2.jpg', '3.jpg']);
  });

  it('enviar_imagenes con plano 3d encola ese archivo', async () => {
    const d = deps({ unidades: [unidad({ plano3d: 'p3d.png' })] });
    const r = await ejecutarHerramienta('enviar_imagenes', { codigo: '2A', que: 'plano_3d' }, d);
    expect(r.esError).toBe(false);
    expect(d.encolarImagenes).toHaveBeenCalledWith(['p3d.png']);
  });

  it('enviar_imagenes de una unidad sin plano es error y no encola', async () => {
    const d = deps({ unidades: [unidad({ fotos: ['1.jpg'] })] });
    const r = await ejecutarHerramienta('enviar_imagenes', { codigo: '2A', que: 'plano' }, d);
    expect(r.esError).toBe(true);
    expect(d.encolarImagenes).not.toHaveBeenCalled();
  });

  it('enviar_imagenes de una unidad inexistente es error', async () => {
    const d = deps({ unidades: [unidad()] });
    const r = await ejecutarHerramienta('enviar_imagenes', { codigo: 'Q', que: 'fotos' }, d);
    expect(r).toEqual({ texto: 'No existe la unidad Q', esError: true });
    expect(d.encolarImagenes).not.toHaveBeenCalled();
  });

  it('avisar_vendedor pasa los datos sin nulls y responde "avisado"', async () => {
    const d = deps();
    const r = await ejecutarHerramienta(
      'avisar_vendedor',
      { nombre: 'Ana', email: null, unidades_interes: ['2A'], resumen: 'Quiere visitar', motivo: 'pidió visita' },
      d,
    );
    expect(d.avisar).toHaveBeenCalledWith({ nombre: 'Ana', unidades: ['2A'], resumen: 'Quiere visitar' });
    expect(r).toEqual({ texto: 'Listo, el equipo ya fue avisado.', esError: false });
  });

  it('avisar_vendedor devuelve el texto de "ya_avisado"', async () => {
    const d = deps({ avisar: vi.fn(async () => 'ya_avisado' as const) });
    const r = await ejecutarHerramienta(
      'avisar_vendedor',
      { nombre: null, email: 'a@b.com', unidades_interes: [], resumen: 'x', motivo: 'y' },
      d,
    );
    expect(r).toEqual({
      texto: 'El equipo ya estaba avisado de este cliente; no hace falta volver a avisar.',
      esError: false,
    });
  });

  it('input inválido es error y no llama a las dependencias', async () => {
    const d = deps({ unidades: [unidad({ fotos: ['1.jpg'] })] });
    const r1 = await ejecutarHerramienta('enviar_imagenes', { codigo: '2A', que: 'video' }, d);
    const r2 = await ejecutarHerramienta('avisar_vendedor', { resumen: 'x' }, d);
    const r3 = await ejecutarHerramienta('ver_unidad', 'hola', d);
    for (const r of [r1, r2, r3]) expect(r.esError).toBe(true);
    expect(d.encolarImagenes).not.toHaveBeenCalled();
    expect(d.avisar).not.toHaveBeenCalled();
  });

  it('herramienta desconocida es error', async () => {
    const r = await ejecutarHerramienta('borrar_todo', {}, deps());
    expect(r.esError).toBe(true);
  });

  it('si una dependencia falla devuelve error en vez de tirar', async () => {
    const d = deps({
      avisar: vi.fn(async () => {
        throw new Error('supabase caído');
      }),
    });
    const r = await ejecutarHerramienta(
      'avisar_vendedor',
      { nombre: null, email: null, unidades_interes: [], resumen: 'x', motivo: 'y' },
      d,
    );
    expect(r.esError).toBe(true);
  });
});

describe('enviar_material y link de unidad', () => {
  const material = {
    renders: [{ nombre: 'Vista frente', urls: ['https://x/r1.jpg'] }, { nombre: 'Vista dron', urls: ['https://x/r2.jpg'] }],
    masterplan: 'https://x/mp.jpg',
    brief: null as string | null,
    edificios: [{ nombre: 'Torre Norte', urls: ['https://x/tn.jpg'] }, { nombre: 'Torre Sur', urls: ['https://x/ts.jpg'] }],
    amenities: [{ nombre: 'Pileta', urls: ['https://x/p1.jpg', 'https://x/p2.jpg', 'https://x/p3.jpg', 'https://x/p4.jpg'] }],
    avance: [{ nombre: '2026-10-01 · Losa 5', urls: ['https://x/o1.jpg'] }],
  };

  it('amenity por nombre (sin tildes ni mayúsculas): hasta 3 fotos', async () => {
    const d = deps({ material });
    const r = await ejecutarHerramienta('enviar_material', { que: 'amenity', nombre: 'PILETA' }, d);
    expect(r.esError).toBe(false);
    expect(d.encolarImagenes).toHaveBeenCalledWith(['https://x/p1.jpg', 'https://x/p2.jpg', 'https://x/p3.jpg']);
  });

  it('renders sin nombre: uno de cada render', async () => {
    const d = deps({ material });
    await ejecutarHerramienta('enviar_material', { que: 'renders', nombre: null }, d);
    expect(d.encolarImagenes).toHaveBeenCalledWith(['https://x/r1.jpg', 'https://x/r2.jpg']);
  });

  it('edificio ambiguo sin nombre: error con las opciones y no manda nada', async () => {
    const d = deps({ material });
    const r = await ejecutarHerramienta('enviar_material', { que: 'edificio', nombre: null }, d);
    expect(r.esError).toBe(true);
    expect(r.texto).toContain('Torre Norte');
    expect(d.encolarImagenes).not.toHaveBeenCalled();
  });

  it('avance_obra sin nombre: la novedad más reciente', async () => {
    const d = deps({ material });
    await ejecutarHerramienta('enviar_material', { que: 'avance_obra', nombre: null }, d);
    expect(d.encolarImagenes).toHaveBeenCalledWith(['https://x/o1.jpg']);
  });

  it('brief: manda el PDF del proyecto', async () => {
    const d = deps({ material: { ...material, brief: 'https://x/b.pdf' } });
    const r = await ejecutarHerramienta('enviar_material', { que: 'brief', nombre: null }, d);
    expect(r.esError).toBe(false);
    expect(r.texto).toContain('brief');
    expect(d.encolarImagenes).toHaveBeenCalledWith(['https://x/b.pdf']);
  });

  it('brief sin cargar: error y no manda nada', async () => {
    const d = deps({ material: { ...material, brief: null } });
    const r = await ejecutarHerramienta('enviar_material', { que: 'brief', nombre: null }, d);
    expect(r.esError).toBe(true);
    expect(d.encolarImagenes).not.toHaveBeenCalled();
  });

  it('nombre que no existe o material vacío: error', async () => {
    const d = deps({ material });
    expect((await ejecutarHerramienta('enviar_material', { que: 'amenity', nombre: 'Gimnasio' }, d)).esError).toBe(true);
    const vacio = deps();
    expect((await ejecutarHerramienta('enviar_material', { que: 'masterplan', nombre: null }, vacio)).esError).toBe(true);
    expect(d.encolarImagenes).not.toHaveBeenCalled();
  });

  it('ver_unidad incluye el link de la página si el sitio está publicado', async () => {
    const d = deps({ unidades: [unidad()], linkUnidad: u => `https://sitio/edificio/${u.edificioId}/unidad/${u.id}` });
    const r = await ejecutarHerramienta('ver_unidad', { codigo: '2A' }, d);
    expect(r.texto).toContain('https://sitio/edificio/ed-norte/unidad/u-2a');
    const sin = await ejecutarHerramienta('ver_unidad', { codigo: '2A' }, deps({ unidades: [unidad()] }));
    expect(sin.texto).not.toContain('http');
  });
});

describe('anotar_pregunta', () => {
  it('anota tema y pregunta y le indica a la IA qué decir', async () => {
    const d = deps();
    const r = await ejecutarHerramienta('anotar_pregunta', { tema: 'Escrituración', pregunta: '¿Cuándo escrituran?' }, d);
    expect(r.esError).toBe(false);
    expect(d.anotarPregunta).toHaveBeenCalledWith({ tema: 'Escrituración', pregunta: '¿Cuándo escrituran?' });
    expect(r.texto).toContain('consultás con el equipo');
  });
  it('tema vacío: error y no anota', async () => {
    const d = deps();
    expect((await ejecutarHerramienta('anotar_pregunta', { tema: ' ', pregunta: 'x' }, d)).esError).toBe(true);
    expect(d.anotarPregunta).not.toHaveBeenCalled();
  });
});

describe('avisar_vendedor con calificación', () => {
  it('normaliza la calificación y la pasa al aviso', async () => {
    const d = deps();
    await ejecutarHerramienta(
      'avisar_vendedor',
      {
        nombre: null, email: null, unidades_interes: [], resumen: 'Busca 3 amb', motivo: 'dio presupuesto',
        calificacion: { temperatura: 'caliente', presupuesto: ' USD 120.000 ', ambientes: 3, plazo: null, proposito: 'vivir', financiacion: null },
      },
      d,
    );
    const arg = vi.mocked(d.avisar).mock.calls[0][0];
    expect(arg.calificacion).toMatchObject({ temperatura: 'caliente', presupuesto: 'USD 120.000', ambientes: 3, proposito: 'vivir' });
  });
});

describe('visitas', () => {
  // Viernes 20/11/2026, 09:00 en Argentina.
  const ahora = new Date('2026-11-20T12:00:00.000Z');
  const config = {
    activo: true, duracion_min: 60, anticipacion_horas: 2, dias_adelante: 3, lugar: 'Showroom',
    franjas: { '5': [['10:00', '13:00']] as [string, string][] },
  };
  const conVisitas = (over: Partial<NonNullable<DepsHerramientas['visitas']>> = {}) =>
    deps({
      visitas: {
        config, ocupados: [], delCliente: [], ahora,
        agendar: vi.fn(async () => 'agendada' as const),
        cancelar: vi.fn(async () => []),
        ...over,
      },
    });

  it('sin agenda activa: las tres herramientas lo dicen', async () => {
    for (const [n, i] of [['ver_horarios_visita', { dia: null }], ['agendar_visita', { dia: '2026-11-20', hora: '11:00', nombre: null }], ['cancelar_visita', {}]] as const) {
      const r = await ejecutarHerramienta(n, i, deps());
      expect(r.esError).toBe(true);
      expect(r.texto).toContain('avisar_vendedor');
    }
  });

  it('ver_horarios_visita lista turnos libres con la fecha entre corchetes', async () => {
    const r = await ejecutarHerramienta('ver_horarios_visita', { dia: null }, conVisitas());
    expect(r.texto).toContain('[2026-11-20]: 11:00, 12:00');
    expect(r.texto).toContain('Showroom');
  });

  it('agendar en un turno libre: agenda y confirma', async () => {
    const d = conVisitas();
    const r = await ejecutarHerramienta('agendar_visita', { dia: '2026-11-20', hora: '11:00', nombre: 'Ana' }, d);
    expect(r.esError).toBe(false);
    expect(r.texto).toContain('vie 20/11 11:00');
    const [inicio, fin, nombre] = vi.mocked(d.visitas!.agendar).mock.calls[0];
    expect(inicio.toISOString()).toBe('2026-11-20T14:00:00.000Z');
    expect(fin.toISOString()).toBe('2026-11-20T15:00:00.000Z');
    expect(nombre).toBe('Ana');
  });

  it('turno fuera de agenda, ya pasado o tomado: error y no agenda', async () => {
    const d = conVisitas();
    expect((await ejecutarHerramienta('agendar_visita', { dia: '2026-11-20', hora: '10:00', nombre: null }, d)).esError).toBe(true);
    expect((await ejecutarHerramienta('agendar_visita', { dia: '2026-11-20', hora: '15:00', nombre: null }, d)).esError).toBe(true);
    expect(d.visitas!.agendar).not.toHaveBeenCalled();
    const ocupado = conVisitas({ agendar: vi.fn(async () => 'ocupado' as const) });
    const r = await ejecutarHerramienta('agendar_visita', { dia: '2026-11-20', hora: '11:00', nombre: null }, ocupado);
    expect(r.esError).toBe(true);
    expect(r.texto).toContain('se acaba de ocupar');
  });

  it('si el cliente ya tiene una visita, no agenda otra', async () => {
    const d = conVisitas({ delCliente: [new Date('2026-11-20T15:00:00.000Z')] });
    const r = await ejecutarHerramienta('agendar_visita', { dia: '2026-11-20', hora: '11:00', nombre: null }, d);
    expect(r.esError).toBe(true);
    expect(r.texto).toContain('cancelar_visita');
  });

  it('cancelar_visita informa lo cancelado', async () => {
    const d = conVisitas({ cancelar: vi.fn(async () => [new Date('2026-11-20T14:00:00.000Z')]) });
    expect((await ejecutarHerramienta('cancelar_visita', {}, d)).texto).toContain('vie 20/11 11:00');
  });
});


describe('canal web', () => {
  const AVISO = {
    nombre: 'Ana', email: null, unidades_interes: [], resumen: 'Quiere visitar', motivo: 'pidió visita', calificacion: null,
  };

  it('avisar_vendedor pasa el teléfono que dejó el comprador', async () => {
    const d = deps();
    await ejecutarHerramienta('avisar_vendedor', { ...AVISO, telefono: ' 5491122334455 ' }, d);
    expect(vi.mocked(d.avisar).mock.calls[0][0]).toMatchObject({ nombre: 'Ana', telefono: '5491122334455' });
  });

  it('sin contacto, avisar_vendedor pide nombre y teléfono o email sin marcar error', async () => {
    const d = deps({ avisar: vi.fn(async () => 'sin_contacto' as const) });
    const r = await ejecutarHerramienta('avisar_vendedor', { ...AVISO, telefono: null }, d);
    expect(r.esError).toBe(false);
    expect(r.texto).toContain('teléfono');
    expect(r.texto).not.toContain('ya fue avisado');
  });

  it('agendar_visita sin contacto pide el contacto antes de agendar', async () => {
    const d = deps({
      visitas: {
        config: { activo: true, duracion_min: 60, anticipacion_horas: 2, dias_adelante: 3, lugar: null, franjas: { '5': [['10:00', '13:00']] } },
        ocupados: [], delCliente: [], ahora: new Date('2026-11-20T12:00:00.000Z'),
        agendar: vi.fn(async () => 'sin_contacto' as const),
        cancelar: vi.fn(async () => []),
      },
    });
    const r = await ejecutarHerramienta('agendar_visita', { dia: '2026-11-20', hora: '11:00', nombre: null }, d);
    expect(r.texto).toContain('teléfono');
    expect(r.texto).not.toContain('Listo');
  });

  it('las imágenes se muestran en el chat, no van por WhatsApp', async () => {
    const d = deps({ canal: 'web', unidades: [unidad({ fotos: ['https://x/1.jpg'] })] });
    const r = await ejecutarHerramienta('enviar_imagenes', { codigo: '2A', que: 'fotos' }, d);
    expect(r.texto).not.toContain('WhatsApp');
    expect(r.texto).toContain('chat');
  });

  it('HERRAMIENTAS_WEB: avisar_vendedor pide el teléfono; el resto, mismos esquemas sin hablar de WhatsApp', () => {
    expect(HERRAMIENTAS_WEB.map(t => t.name)).toEqual(HERRAMIENTAS.map(t => t.name));
    for (const [i, t] of HERRAMIENTAS_WEB.entries()) {
      expect(t.description).not.toContain('WhatsApp');
      if (t.name === 'avisar_vendedor') continue;
      expect(t.input_schema).toEqual(HERRAMIENTAS[i].input_schema);
    }
    const aviso = HERRAMIENTAS_WEB.find(t => t.name === 'avisar_vendedor')!;
    const schema = aviso.input_schema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.required).toContain('telefono');
    expect(schema.properties.telefono).toBeDefined();
  });

  it('HERRAMIENTAS de WhatsApp no cambian', () => {
    const aviso = HERRAMIENTAS.find(t => t.name === 'avisar_vendedor')!;
    expect((aviso.input_schema as { required: string[] }).required).not.toContain('telefono');
    expect(HERRAMIENTAS.find(t => t.name === 'enviar_imagenes')!.description).toContain('por WhatsApp');
  });

  it('HERRAMIENTAS y HERRAMIENTAS_WEB no superan el límite de 16 parámetros con tipo unión de Claude', () => {
    const contarUniones = (node: unknown): number => {
      if (!node || typeof node !== 'object') return 0;
      if (Array.isArray(node)) return node.reduce((s, x) => s + contarUniones(x), 0);
      const o = node as Record<string, unknown>;
      const propio = Array.isArray(o.anyOf) || Array.isArray(o.type) ? 1 : 0;
      return propio + Object.values(o).reduce<number>((s, v) => s + contarUniones(v), 0);
    };
    expect(contarUniones(HERRAMIENTAS.map(t => t.input_schema))).toBeLessThanOrEqual(16);
    expect(contarUniones(HERRAMIENTAS_WEB.map(t => t.input_schema))).toBeLessThanOrEqual(16);
  });

  it('enviar_imagenes con que="ficha" encola la URL de la ficha PDF', async () => {
    const d = deps({
      canal: 'web',
      unidades: [unidad()],
      fichaUnidadPdf: (u) => `https://torre.com/api/ficha/torre-sol/${u.id}`,
    });
    const r = await ejecutarHerramienta('enviar_imagenes', { codigo: '2A', que: 'ficha' }, d);
    expect(r.esError).toBe(false);
    expect(d.encolarImagenes).toHaveBeenCalledWith(['https://torre.com/api/ficha/torre-sol/u-2a']);
  });

  it('simular_financiacion calcula los planes reales sobre el precio de la unidad', async () => {
    const d = deps({
      unidades: [unidad()],
      planes: [{
        id: 'p1', name: 'Plan 36', downPaymentPct: 30, installments: 36, installmentsPct: 70,
        boosts: 0, boostsPct: 0, boostEveryMonths: 6, priceAdjustmentPct: 0, index: 'CAC',
      }],
    });
    const r = await ejecutarHerramienta('simular_financiacion', { codigo: '2A' }, d);
    expect(r.esError).toBe(false);
    expect(r.texto).toContain('Plan 36');
    expect(r.texto).toContain('36 cuotas');
    expect(r.texto).toContain('CAC');
  });

  it('agendar_visita pasa la modalidad videollamada', async () => {
    const agendar = vi.fn(async () => 'agendada' as const);
    const d = deps({
      visitas: {
        config: { activo: true, duracion_min: 60, anticipacion_horas: 2, dias_adelante: 3, lugar: 'Showroom', franjas: { '5': [['10:00', '13:00']] } },
        ocupados: [], delCliente: [], ahora: new Date('2026-11-20T12:00:00.000Z'),
        agendar,
        cancelar: vi.fn(async () => []),
      },
    });
    const r = await ejecutarHerramienta('agendar_visita', { dia: '2026-11-20', hora: '11:00', nombre: 'Ana', modalidad: 'videollamada' }, d);
    expect(r.esError).toBe(false);
    expect(r.texto).toContain('videollamada');
    expect(agendar).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 'Ana', 'videollamada');
  });
});
