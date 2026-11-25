import { z } from 'zod';
import { normalizarTelefono } from './reglas';
import { HORAS_SEGUIMIENTO_OPCIONES } from './seguimiento';
import {
  ANTICIPACIONES_VISITA,
  DIAS_ADELANTE_VISITA,
  DURACIONES_VISITA,
  MAX_FRANJAS_POR_DIA,
  normalizarConfigVisitas,
} from './visitas';

const unaDe = (opciones: readonly number[]) =>
  z.number().int().refine((n) => opciones.includes(n), 'Elegí una de las opciones');
const HORA = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida');
const franjasDelDia = z
  .array(z.tuple([HORA, HORA]).refine(([a, b]) => a < b, 'La hora de fin tiene que ser posterior al inicio'))
  .max(MAX_FRANJAS_POR_DIA);

/** Agenda de visitas tal como la guarda el panel (wa_bots.visitas). */
export const ConfigVisitasEsquema = z
  .object({
    activo: z.boolean(),
    duracion_min: unaDe(DURACIONES_VISITA),
    anticipacion_horas: unaDe(ANTICIPACIONES_VISITA),
    dias_adelante: unaDe(DIAS_ADELANTE_VISITA),
    lugar: z.string().max(200, 'Máximo 200 caracteres').nullable(),
    franjas: z.object({
      '0': franjasDelDia.optional(),
      '1': franjasDelDia.optional(),
      '2': franjasDelDia.optional(),
      '3': franjasDelDia.optional(),
      '4': franjasDelDia.optional(),
      '5': franjasDelDia.optional(),
      '6': franjasDelDia.optional(),
    }),
  })
  .transform((v) => normalizarConfigVisitas(v)!);

const textoCorto = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .transform((s) => s.trim() || null)
    .nullable();

export const ConfigBot = z
  .object({
    activo: z.boolean(),
    nombre_bot: textoCorto(80),
    vendedor_nombre: textoCorto(120),
    vendedor_whatsapp: z
      .string()
      .nullable()
      .transform((s, ctx) => {
        if (s === null || s.trim() === '') return null;
        const n = normalizarTelefono(s);
        if (!n) {
          ctx.addIssue({ code: 'custom', message: 'El WhatsApp del vendedor no es un teléfono válido' });
          return z.NEVER;
        }
        return n;
      }),
    conocimiento: z.string().max(20000, 'Máximo 20000 caracteres').nullable(),
    criterio_aviso: textoCorto(2000),
    seguimiento_activo: z.boolean(),
    seguimiento_horas: z
      .number()
      .int()
      .refine((h) => (HORAS_SEGUIMIENTO_OPCIONES as readonly number[]).includes(h), 'Elegí una de las opciones'),
    visitas: ConfigVisitasEsquema,
    /** Chat en el sitio público (independiente del WhatsApp). */
    chat_web: z.boolean(),
  })
  .partial();

export type ConfigBotInput = z.infer<typeof ConfigBot>;

export const TextoEnvio = z.object({
  texto: z.string().trim().min(1, 'Escribí un mensaje').max(4000, 'Máximo 4000 caracteres'),
});

export const AccionConversacion = z.object({ accion: z.enum(['tomar', 'devolver', 'leido']) });
export const PedidoBot = z.object({ pedido: z.enum(['conectar', 'desconectar', 'reiniciar']) });

export function validarConfigContraBot(
  c: { vendedor_whatsapp?: string | null },
  bot: { numero: string | null } | null
): string | null {
  if (!c.vendedor_whatsapp || !bot?.numero) return null;
  const vendedor = normalizarTelefono(c.vendedor_whatsapp);
  const numeroBot = normalizarTelefono(bot.numero);
  if (vendedor && numeroBot && vendedor === numeroBot) {
    return 'El WhatsApp del vendedor no puede ser el mismo número del bot';
  }
  return null;
}

/** Zod -> { campo: mensaje } para mostrar por campo en la UI. */
export function camposDeError(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? '_');
    if (!(k in campos)) campos[k] = i.message;
  }
  return campos;
}

/** Un turno del simulador del panel: la charla hasta acá (termina en el cliente). */
export const PedidoSimulacion = z.object({
  mensajes: z
    .array(z.object({ rol: z.enum(['cliente', 'bot']), texto: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(40)
    .refine((ms) => ms[ms.length - 1]?.rol === 'cliente', 'El último mensaje tiene que ser del cliente'),
  yaAvisado: z.boolean().default(false),
});

/** Responder, descartar o reabrir una pregunta sin respuesta desde el panel. */
export const CambioPregunta = z
  .object({
    estado: z.enum(['pendiente', 'respondida', 'descartada']),
    respuesta: z.string().trim().max(2000).nullish(),
  })
  .refine((c) => c.estado !== 'respondida' || !!c.respuesta, {
    message: 'Escribí la respuesta',
    path: ['respuesta'],
  });
