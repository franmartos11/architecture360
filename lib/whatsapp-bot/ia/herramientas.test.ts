import { describe, expect, it, vi } from 'vitest';
import type { UnidadBot } from '../ficha';
import { HERRAMIENTAS, ejecutarHerramienta, type DepsHerramientas } from './herramientas';

function unidad(over: Partial<UnidadBot> = {}): UnidadBot {
  return {
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
  it('define las cuatro herramientas estrictas y cerradas', () => {
    expect(HERRAMIENTAS.map(t => t.name)).toEqual([
      'buscar_unidades',
      'ver_unidad',
      'enviar_imagenes',
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
