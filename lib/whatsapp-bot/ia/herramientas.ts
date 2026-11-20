// Herramientas que la IA usa durante un turno. Leen siempre datos en vivo
// (deps.unidades se arma al empezar el turno) y nunca tiran: cualquier
// problema vuelve como tool_result con is_error para que Claude se adapte.
// Sin imports de next/react: corre con tsx fuera de Next.
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { DatosAviso } from '../aviso';
import {
  coincidenUnidades,
  fichaUnidad,
  lineaUnidad,
  MAX_UNIDADES_LISTA,
  type UnidadBot,
} from '../ficha';

/** Máximo de imágenes por pedido de enviar_imagenes. */
export const MAX_IMAGENES = 3;

export interface DepsHerramientas {
  unidades: UnidadBot[];
  encolarImagenes(urls: string[]): Promise<void>;
  avisar(d: Omit<DatosAviso, 'telefono' | 'conversacionId'>): Promise<'avisado' | 'ya_avisado'>;
}

export type ResultadoHerramienta = { texto: string; esError: boolean };

// Modo estricto: cada objeto lleva additionalProperties: false y todas sus
// propiedades en required; lo opcional se expresa como "valor o null".
const nullable = (s: Record<string, unknown>) => ({ anyOf: [s, { type: 'null' }] });

export const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'buscar_unidades',
    description:
      'Busca unidades del proyecto con datos en vivo (precio, estado, superficie). Usala siempre antes de hablar de precios o disponibilidad. Devuelve una línea por unidad, de menor a mayor precio, hasta 15. Pasá null en los filtros que no quieras usar. Por defecto solo trae las disponibles.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        ambientes: { ...nullable({ type: 'integer' }), description: 'Cantidad exacta de ambientes.' },
        dormitorios: { ...nullable({ type: 'integer' }), description: 'Cantidad exacta de dormitorios.' },
        precio_max: { ...nullable({ type: 'number' }), description: 'Precio máximo, en la moneda de la unidad.' },
        moneda: { ...nullable({ type: 'string' }), description: 'Código de moneda, por ejemplo USD o ARS.' },
        edificio: { ...nullable({ type: 'string' }), description: 'Nombre (o parte del nombre) del edificio.' },
        estado: {
          ...nullable({ type: 'string', enum: ['available', 'reserved', 'sold', 'todas'] }),
          description: "Estado de la unidad; null = 'available' (disponibles).",
        },
      },
      required: ['ambientes', 'dormitorios', 'precio_max', 'moneda', 'edificio', 'estado'],
      additionalProperties: false,
    },
  },
  {
    name: 'ver_unidad',
    description:
      'Ficha completa de una unidad por su código: superficies, expensas, cocheras, condición, características y qué fotos o planos hay para enviar.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        codigo: { type: 'string', description: 'Código de la unidad, tal como lo devuelve buscar_unidades.' },
      },
      required: ['codigo'],
      additionalProperties: false,
    },
  },
  {
    name: 'enviar_imagenes',
    description:
      'Manda por WhatsApp al cliente fotos (hasta 3), el plano o el plano 3D de una unidad. Las imágenes le llegan solas; no pegues links en tu respuesta.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        codigo: { type: 'string', description: 'Código de la unidad.' },
        que: { type: 'string', enum: ['fotos', 'plano', 'plano_3d'], description: 'Qué mandar.' },
      },
      required: ['codigo', 'que'],
      additionalProperties: false,
    },
  },
  {
    name: 'avisar_vendedor',
    description:
      'Avisa al equipo de ventas que este cliente está interesado, para que lo contacte una persona. Usala según la guía de cuándo avisar. Es idempotente: si el equipo ya estaba avisado, lo indica.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        nombre: { ...nullable({ type: 'string' }), description: 'Nombre del cliente si lo dijo; si no, null.' },
        email: { ...nullable({ type: 'string' }), description: 'Email del cliente si lo dejó; si no, null.' },
        unidades_interes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Códigos de las unidades que le interesan (puede ser vacío).',
        },
        resumen: {
          type: 'string',
          description: 'Resumen breve para el vendedor: qué busca, presupuesto, plazos y qué pidió.',
        },
        motivo: { type: 'string', description: 'Por qué avisás ahora (por ejemplo: pidió visita).' },
      },
      required: ['nombre', 'email', 'unidades_interes', 'resumen', 'motivo'],
      additionalProperties: false,
    },
  },
];

const BuscarInput = z.object({
  ambientes: z.number().int().nullish(),
  dormitorios: z.number().int().nullish(),
  precio_max: z.number().nullish(),
  moneda: z.string().nullish(),
  edificio: z.string().nullish(),
  estado: z.enum(['available', 'reserved', 'sold', 'todas']).nullish(),
});
const VerInput = z.object({ codigo: z.string() });
const EnviarInput = z.object({ codigo: z.string(), que: z.enum(['fotos', 'plano', 'plano_3d']) });
const AvisarInput = z.object({
  nombre: z.string().nullish(),
  email: z.string().nullish(),
  unidades_interes: z.array(z.string()),
  resumen: z.string(),
  motivo: z.string(),
});

const ok = (texto: string): ResultadoHerramienta => ({ texto, esError: false });
const error = (texto: string): ResultadoHerramienta => ({ texto, esError: true });

const limpio = (v: string | null | undefined) => (v && v.trim() ? v.trim() : undefined);
const sinNull = <T>(v: T | null | undefined) => (v == null ? undefined : v);

function buscarPorCodigo(us: UnidadBot[], codigo: string): UnidadBot[] {
  const c = codigo.trim().toLowerCase();
  return us.filter(u => u.codigo.trim().toLowerCase() === c);
}

function material(u: UnidadBot): string {
  const hay: string[] = [];
  if (u.fotos.length) hay.push(`${u.fotos.length} ${u.fotos.length === 1 ? 'foto' : 'fotos'}`);
  if (u.plano) hay.push('plano');
  if (u.plano3d) hay.push('plano 3D');
  return hay.length ? `Para enviar: ${hay.join(', ')}.` : 'No hay fotos ni planos cargados de esta unidad.';
}

function buscar(input: z.infer<typeof BuscarInput>, deps: DepsHerramientas): ResultadoHerramienta {
  const todas = coincidenUnidades(deps.unidades, {
    ambientes: sinNull(input.ambientes),
    dormitorios: sinNull(input.dormitorios),
    precio_max: sinNull(input.precio_max),
    moneda: limpio(input.moneda),
    edificio: limpio(input.edificio),
    estado: sinNull(input.estado),
  });
  if (todas.length === 0) return ok('No hay unidades que coincidan con esos filtros.');
  const lineas = todas.slice(0, MAX_UNIDADES_LISTA).map(lineaUnidad);
  if (todas.length > MAX_UNIDADES_LISTA) lineas.push(`(mostrando ${MAX_UNIDADES_LISTA} de ${todas.length})`);
  return ok(lineas.join('\n'));
}

function ver(input: z.infer<typeof VerInput>, deps: DepsHerramientas): ResultadoHerramienta {
  const us = buscarPorCodigo(deps.unidades, input.codigo);
  if (us.length === 0) return error(`No existe la unidad ${input.codigo}`);
  return ok(us.map(u => `${fichaUnidad(u)}\n${material(u)}`).join('\n\n'));
}

async function enviar(input: z.infer<typeof EnviarInput>, deps: DepsHerramientas): Promise<ResultadoHerramienta> {
  const [u] = buscarPorCodigo(deps.unidades, input.codigo);
  if (!u) return error(`No existe la unidad ${input.codigo}`);
  let urls: string[];
  let que: string;
  if (input.que === 'fotos') {
    urls = u.fotos.slice(0, MAX_IMAGENES);
    que = urls.length === 1 ? '1 foto' : `${urls.length} fotos`;
    if (!urls.length) return error(`La unidad ${u.codigo} no tiene fotos cargadas.`);
  } else if (input.que === 'plano') {
    if (!u.plano) return error(`La unidad ${u.codigo} no tiene plano cargado.`);
    urls = [u.plano];
    que = 'el plano';
  } else {
    if (!u.plano3d) return error(`La unidad ${u.codigo} no tiene plano 3D cargado.`);
    urls = [u.plano3d];
    que = 'el plano 3D';
  }
  await deps.encolarImagenes(urls);
  return ok(`Listo: ${que} de la unidad ${u.codigo} ya van en camino al cliente por WhatsApp.`);
}

async function avisar(input: z.infer<typeof AvisarInput>, deps: DepsHerramientas): Promise<ResultadoHerramienta> {
  const nombre = limpio(input.nombre);
  const email = limpio(input.email);
  const r = await deps.avisar({
    ...(nombre ? { nombre } : {}),
    ...(email ? { email } : {}),
    unidades: input.unidades_interes,
    resumen: input.resumen,
  });
  return ok(
    r === 'ya_avisado'
      ? 'El equipo ya estaba avisado de este cliente; no hace falta volver a avisar.'
      : 'Listo, el equipo ya fue avisado.',
  );
}

function invalido(nombre: string, e: z.ZodError): ResultadoHerramienta {
  const detalle = e.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
  return error(`Parámetros inválidos para ${nombre}: ${detalle}`);
}

export async function ejecutarHerramienta(
  nombre: string,
  input: unknown,
  deps: DepsHerramientas,
): Promise<ResultadoHerramienta> {
  try {
    switch (nombre) {
      case 'buscar_unidades': {
        const p = BuscarInput.safeParse(input);
        return p.success ? buscar(p.data, deps) : invalido(nombre, p.error);
      }
      case 'ver_unidad': {
        const p = VerInput.safeParse(input);
        return p.success ? ver(p.data, deps) : invalido(nombre, p.error);
      }
      case 'enviar_imagenes': {
        const p = EnviarInput.safeParse(input);
        return p.success ? await enviar(p.data, deps) : invalido(nombre, p.error);
      }
      case 'avisar_vendedor': {
        const p = AvisarInput.safeParse(input);
        return p.success ? await avisar(p.data, deps) : invalido(nombre, p.error);
      }
      default:
        return error(`No existe la herramienta ${nombre}`);
    }
  } catch (e) {
    console.error(`[whatsapp-bot] falló la herramienta ${nombre}:`, e);
    return error(`No se pudo completar ${nombre} por un problema interno. No le prometas nada al cliente sobre esto.`);
  }
}
