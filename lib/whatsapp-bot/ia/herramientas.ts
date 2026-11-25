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
import { elegirMaterial, type MaterialProyecto } from '../material';
import { normalizarCalificacion } from '../calificacion';
import {
  instanteAR,
  textoTurno,
  textoTurnosLibres,
  turnosLibres,
  type ConfigVisitas,
  type Ocupado,
} from '../visitas';

/** Máximo de imágenes por pedido de enviar_imagenes. */
export const MAX_IMAGENES = 3;

export interface DepsHerramientas {
  /** 'web' = chat del sitio: las imágenes se muestran en el chat (default 'whatsapp'). */
  canal?: 'whatsapp' | 'web';
  unidades: UnidadBot[];
  /** Material del proyecto (renders, masterplan, brief, edificios, amenities, obra). */
  material: MaterialProyecto;
  /** Link a la página pública de la unidad, o null si el sitio no está publicado. */
  linkUnidad(u: UnidadBot): string | null;
  /** Agenda de visitas; sin esto (o inactiva) las herramientas de visitas lo dicen. */
  visitas?: {
    config: ConfigVisitas;
    /** Visitas agendadas del proyecto (ocupan su turno). */
    ocupados: Ocupado[];
    /** Inicios de las visitas futuras de este cliente. */
    delCliente: Date[];
    ahora: Date;
    /** 'sin_contacto' (chat web): el comprador todavía no dejó teléfono ni email. */
    agendar(inicio: Date, fin: Date, nombre: string | null): Promise<'agendada' | 'ocupado' | 'sin_contacto'>;
    /** Cancela las visitas futuras de este cliente; devuelve sus inicios. */
    cancelar(): Promise<Date[]>;
  };
  /** Anota una pregunta que no se pudo responder, para que el equipo cargue la respuesta. */
  anotarPregunta(d: { tema: string; pregunta: string }): Promise<void>;
  encolarImagenes(urls: string[]): Promise<void>;
  /** `telefono` lo pasa solo el chat web (en WhatsApp es el del contacto); 'sin_contacto' = sin teléfono ni email. */
  avisar(d: Omit<DatosAviso, 'telefono' | 'conversacionId'> & { telefono?: string }): Promise<'avisado' | 'ya_avisado' | 'sin_contacto'>;
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
    name: 'enviar_material',
    description:
      'Manda por WhatsApp al cliente material del proyecto (no de una unidad): renders, el masterplan, la portada de un edificio, fotos de un amenity, fotos del avance de obra, o el brief del proyecto en PDF. Lo que hay está listado en la ficha, en "Material del proyecto". Hasta 3 imágenes; le llegan solas, no pegues links.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        que: {
          type: 'string',
          enum: ['renders', 'masterplan', 'brief', 'edificio', 'amenity', 'avance_obra'],
          description: 'Qué mandar.',
        },
        nombre: {
          ...nullable({ type: 'string' }),
          description:
            'Cuál, tal como figura en la ficha (por ejemplo el nombre del amenity o del edificio). null = el más representativo (renders: varios; avance_obra: la novedad más reciente).',
        },
      },
      required: ['que', 'nombre'],
      additionalProperties: false,
    },
  },
  {
    name: 'anotar_pregunta',
    description:
      'Anota una pregunta del cliente sobre el proyecto que no podés responder con la ficha ni con las herramientas, para que el equipo cargue la respuesta y la próxima vez la sepas. Usala cada vez que le digas al cliente que lo consultás con el equipo. No la uses para pedidos (visitas, hablar con alguien: eso es avisar_vendedor) ni para temas ajenos al proyecto.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        tema: {
          type: 'string',
          description: 'Tema corto y general, de 1 a 4 palabras, para agrupar preguntas iguales (por ejemplo: escrituración, mascotas, fecha de posesión).',
        },
        pregunta: {
          type: 'string',
          description: 'La pregunta tal como la hizo el cliente, sin su nombre, teléfono ni otros datos personales.',
        },
      },
      required: ['tema', 'pregunta'],
      additionalProperties: false,
    },
  },
  {
    name: 'ver_horarios_visita',
    description:
      'Turnos libres para visitar el proyecto (agenda del vendedor, en hora de Argentina). Si el cliente ya tiene una visita agendada, también lo dice. Usala antes de ofrecer horarios.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        dia: {
          ...nullable({ type: 'string' }),
          description: 'Un día puntual, YYYY-MM-DD (por ejemplo si el cliente pidió "el jueves"). null = los próximos días con lugar.',
        },
      },
      required: ['dia'],
      additionalProperties: false,
    },
  },
  {
    name: 'agendar_visita',
    description:
      'Agenda la visita del cliente en un turno libre que devolvió ver_horarios_visita y le avisa al vendedor. No confirmes la visita al cliente hasta que esta herramienta diga que quedó agendada.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        dia: { type: 'string', description: 'YYYY-MM-DD, tal como aparece entre corchetes en ver_horarios_visita.' },
        hora: { type: 'string', description: 'HH:MM, una de las horas libres de ese día.' },
        nombre: { ...nullable({ type: 'string' }), description: 'Nombre del cliente si lo dijo; si no, null.' },
      },
      required: ['dia', 'hora', 'nombre'],
      additionalProperties: false,
    },
  },
  {
    name: 'cancelar_visita',
    description:
      'Cancela la visita futura que tenga agendada este cliente (por ejemplo para cambiarla de horario) y le avisa al vendedor.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
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
        calificacion: {
          type: 'object',
          description:
            'Lo que sabés del cliente por lo que dijo en la charla. Nunca lo supongas: si no lo dijo, null.',
          properties: {
            temperatura: {
              type: 'string',
              enum: ['frio', 'tibio', 'caliente'],
              description:
                'caliente: quiere visitar, reservar o dio presupuesto y plazo concretos; tibio: interés real pero todavía explorando; frio: consulta general.',
            },
            presupuesto: { ...nullable({ type: 'string' }), description: 'Como lo dijo, con moneda (por ejemplo: USD 120.000).' },
            ambientes: { ...nullable({ type: 'integer' }), description: 'Cantidad de ambientes que busca.' },
            plazo: { ...nullable({ type: 'string' }), description: 'Para cuándo (por ejemplo: mudarse en 2027, ya).' },
            proposito: { ...nullable({ type: 'string', enum: ['vivir', 'invertir', 'ambos'] }), description: 'Para vivir o para invertir.' },
            financiacion: { ...nullable({ type: 'boolean' }), description: 'true si dijo que necesita financiación, false si dijo que no.' },
          },
          required: ['temperatura', 'presupuesto', 'ambientes', 'plazo', 'proposito', 'financiacion'],
          additionalProperties: false,
        },
      },
      required: ['nombre', 'email', 'unidades_interes', 'resumen', 'motivo', 'calificacion'],
      additionalProperties: false,
    },
  },
];

/**
 * Chat del sitio: mismas herramientas, sin hablar de WhatsApp, y avisar_vendedor
 * pide el teléfono (en WhatsApp ya se conoce el del contacto).
 */
export const HERRAMIENTAS_WEB: Anthropic.Beta.BetaTool[] = HERRAMIENTAS.map((t) => {
  const description = t.description?.replace(/Manda por WhatsApp al cliente/g, 'Muestra en el chat al cliente');
  if (t.name !== 'avisar_vendedor') return { ...t, description };
  const s = t.input_schema as { properties: Record<string, unknown>; required: string[] };
  return {
    ...t,
    description: `${description} Necesita un teléfono o un email del cliente: pedíselos antes en la charla.`,
    input_schema: {
      ...t.input_schema,
      properties: {
        ...s.properties,
        telefono: { ...nullable({ type: 'string' }), description: 'Teléfono que dejó el cliente en la charla; si no lo dejó, null.' },
      },
      required: [...s.required, 'telefono'],
    },
  };
});

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
const MaterialInput = z.object({
  que: z.enum(['renders', 'masterplan', 'brief', 'edificio', 'amenity', 'avance_obra']),
  nombre: z.string().nullish(),
});
const HorariosInput = z.object({ dia: z.string().nullish() });
const AgendarInput = z.object({ dia: z.string(), hora: z.string(), nombre: z.string().nullish() });
const CancelarInput = z.object({}).passthrough();
const PreguntaInput = z.object({ tema: z.string().trim().min(1).max(120), pregunta: z.string().trim().min(1).max(1000) });
const AvisarInput = z.object({
  nombre: z.string().nullish(),
  telefono: z.string().nullish(),
  email: z.string().nullish(),
  unidades_interes: z.array(z.string()),
  resumen: z.string(),
  motivo: z.string(),
  calificacion: z
    .object({
      temperatura: z.enum(['frio', 'tibio', 'caliente']),
      presupuesto: z.string().nullish(),
      ambientes: z.number().int().nullish(),
      plazo: z.string().nullish(),
      proposito: z.enum(['vivir', 'invertir', 'ambos']).nullish(),
      financiacion: z.boolean().nullish(),
    })
    .nullish(),
});

const ok = (texto: string): ResultadoHerramienta => ({ texto, esError: false });
const PEDIR_CONTACTO =
  'Todavía no tengo cómo contactar al cliente. Pedile su nombre y un teléfono o email; cuando los tengas, volvé a intentarlo.';
/** Cómo le llegan las imágenes al cliente, según el canal. */
const enCamino = (deps: DepsHerramientas) =>
  deps.canal === 'web' ? 'ya se muestran en el chat' : 'ya van en camino al cliente por WhatsApp';
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
  return ok(
    us
      .map(u => {
        const link = deps.linkUnidad(u);
        const pagina = link ? `\nPágina de la unidad (fotos, plano y recorrido; podés pasarle este link): ${link}` : '';
        return `${fichaUnidad(u)}\n${material(u)}${pagina}`;
      })
      .join('\n\n'),
  );
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
  return ok(`Listo: ${que} de la unidad ${u.codigo} ${enCamino(deps)}.`);
}

async function enviarMaterial(input: z.infer<typeof MaterialInput>, deps: DepsHerramientas): Promise<ResultadoHerramienta> {
  const r = elegirMaterial(deps.material, input.que, input.nombre ?? null, MAX_IMAGENES);
  if ('error' in r) return error(r.error);
  await deps.encolarImagenes(r.urls);
  if (input.que === 'brief') return ok(deps.canal === 'web' ? 'Listo: el brief del proyecto (PDF) ya se muestra en el chat.' : 'Listo: el brief del proyecto (PDF) ya va en camino al cliente por WhatsApp.');
  const n = r.urls.length === 1 ? '1 imagen' : `${r.urls.length} imágenes`;
  return ok(`Listo: ${n} (${r.descripcion}) ${enCamino(deps)}.`);
}

const sinVisitas = () =>
  error('Las visitas no se agendan por este chat. Si el cliente quiere visitar, avisá al equipo con avisar_vendedor para que coordine.');

function verHorarios(input: z.infer<typeof HorariosInput>, deps: DepsHerramientas): ResultadoHerramienta {
  const v = deps.visitas;
  if (!v?.config.activo) return sinVisitas();
  const dia = limpio(input.dia) ?? null;
  if (dia && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return error('El día tiene que ser YYYY-MM-DD.');
  const yaTiene = v.delCliente.length
    ? `Este cliente ya tiene una visita agendada: ${v.delCliente.map(textoTurno).join(', ')}. Si quiere otro horario, primero cancelala con cancelar_visita.\n`
    : '';
  const libres = turnosLibres(v.config, v.ocupados, v.ahora, dia);
  if (!libres.length) {
    return ok(`${yaTiene}${dia ? `No hay turnos libres el ${dia}.` : 'No hay turnos libres en los próximos días: avisá al equipo para que coordine.'}`);
  }
  const lugar = v.config.lugar ? `, en ${v.config.lugar}` : '';
  return ok(`${yaTiene}Turnos libres (visitas de ${v.config.duracion_min} min${lugar}). Para agendar usá la fecha entre corchetes y la hora:\n${textoTurnosLibres(libres)}`);
}

async function agendar(input: z.infer<typeof AgendarInput>, deps: DepsHerramientas): Promise<ResultadoHerramienta> {
  const v = deps.visitas;
  if (!v?.config.activo) return sinVisitas();
  if (v.delCliente.length) {
    return error(`Este cliente ya tiene una visita el ${v.delCliente.map(textoTurno).join(', ')}. Para cambiarla, primero cancelar_visita.`);
  }
  const inicio = instanteAR(input.dia.trim(), input.hora.trim());
  if (!inicio) return error('Fecha u hora con formato inválido: dia YYYY-MM-DD y hora HH:MM.');
  const libre = turnosLibres(v.config, v.ocupados, v.ahora, input.dia.trim()).some((t) => t.getTime() === inicio.getTime());
  if (!libre) return error('Ese horario no está disponible. Consultá de nuevo ver_horarios_visita y ofrecé otro.');
  const fin = new Date(inicio.getTime() + v.config.duracion_min * 60_000);
  const r = await v.agendar(inicio, fin, limpio(input.nombre) ?? null);
  if (r === 'ocupado') return error('Ese turno se acaba de ocupar. Consultá de nuevo ver_horarios_visita y ofrecé otro.');
  if (r === 'sin_contacto') return ok(PEDIR_CONTACTO);
  const lugar = v.config.lugar ? ` en ${v.config.lugar}` : '';
  return ok(
    `Listo: visita agendada el ${textoTurno(inicio)}${lugar}. Confirmale al cliente día, hora y lugar. Si todavía no avisaste al equipo de este cliente, hacelo con avisar_vendedor.`,
  );
}

async function cancelar(deps: DepsHerramientas): Promise<ResultadoHerramienta> {
  if (!deps.visitas) return sinVisitas();
  const canceladas = await deps.visitas.cancelar();
  if (!canceladas.length) return ok('Este cliente no tenía visitas futuras agendadas.');
  return ok(`Cancelada: ${canceladas.map(textoTurno).join(', ')}. El equipo ya fue avisado.`);
}

async function anotar(input: z.infer<typeof PreguntaInput>, deps: DepsHerramientas): Promise<ResultadoHerramienta> {
  await deps.anotarPregunta(input);
  return ok('Anotada. Decile al cliente que lo consultás con el equipo y le confirman.');
}

async function avisar(input: z.infer<typeof AvisarInput>, deps: DepsHerramientas): Promise<ResultadoHerramienta> {
  const nombre = limpio(input.nombre);
  const email = limpio(input.email);
  const telefono = limpio(input.telefono);
  const r = await deps.avisar({
    ...(nombre ? { nombre } : {}),
    ...(email ? { email } : {}),
    ...(telefono ? { telefono } : {}),
    unidades: input.unidades_interes,
    resumen: input.resumen,
    ...(input.calificacion ? { calificacion: normalizarCalificacion(input.calificacion, new Date()) } : {}),
  });
  if (r === 'sin_contacto') return ok(PEDIR_CONTACTO);
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
      case 'enviar_material': {
        const p = MaterialInput.safeParse(input);
        return p.success ? await enviarMaterial(p.data, deps) : invalido(nombre, p.error);
      }
      case 'ver_horarios_visita': {
        const p = HorariosInput.safeParse(input);
        return p.success ? verHorarios(p.data, deps) : invalido(nombre, p.error);
      }
      case 'agendar_visita': {
        const p = AgendarInput.safeParse(input);
        return p.success ? await agendar(p.data, deps) : invalido(nombre, p.error);
      }
      case 'cancelar_visita': {
        const p = CancelarInput.safeParse(input ?? {});
        return p.success ? await cancelar(deps) : invalido(nombre, p.error);
      }
      case 'anotar_pregunta': {
        const p = PreguntaInput.safeParse(input);
        return p.success ? await anotar(p.data, deps) : invalido(nombre, p.error);
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
