import { z } from 'zod';
import { normalizarTelefono } from './reglas';

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
