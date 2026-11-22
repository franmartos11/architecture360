// Simulador del bot para el panel: corre un turno de la IA con la ficha y la
// configuración reales del proyecto, pero sin WhatsApp. Nada sale: las
// imágenes, el aviso al vendedor y las preguntas anotadas se devuelven para
// mostrarlos, sin encolar, avisar ni guardar nada.
// Sin imports de next/react.
import type Anthropic from '@anthropic-ai/sdk';
import type { WaBot } from '@/types/whatsapp-bot';
import { armarFicha, resumenInventario, unidadesParaAviso, type DatosProyecto } from './ficha';
import type { DepsHerramientas } from './ia/herramientas';
import { armarSystem } from './ia/prompt';
import type { MotivoSinRespuesta, ResultadoTurno } from './ia/turno';
import { armarMaterial, urlUnidad } from './material';
import { partirRespuesta } from './reglas';
import { textoCalificacion } from './calificacion';
import { textoTurno, type ConfigVisitas, type Ocupado } from './visitas';

export type MensajeSimulado = { rol: 'cliente' | 'bot'; texto: string };

export type AvisoSimulado = {
  nombre: string | null;
  email: string | null;
  unidades: string[];
  resumen: string;
  /** Texto de la calificación tal como iría en el aviso ("Caliente · USD 120.000 · ..."). */
  calificacion: string | null;
};

export type ResultadoSimulacion = {
  partes: string[];
  imagenes: string[];
  aviso: AvisoSimulado | null;
  preguntas: { tema: string; pregunta: string }[];
  /** La visita que agendaría ("jue 27/11 10:00"), sin crearla. */
  visita: string | null;
  motivoSinRespuesta?: MotivoSinRespuesta;
};

/**
 * La charla del simulador en el formato de la API: roles alternados (los
 * mensajes seguidos del mismo lado se juntan), empezando y terminando por
 * el cliente. Lo que el bot dijo antes del primer mensaje del cliente se descarta.
 */
export function aMensajesClaudeSimulados(ms: MensajeSimulado[]): Anthropic.Beta.BetaMessageParam[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of ms) {
    const texto = m.texto.trim();
    if (!texto) continue;
    const role = m.rol === 'cliente' ? 'user' : 'assistant';
    if (out.length === 0 && role === 'assistant') continue;
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content += `\n\n${texto}`;
    else out.push({ role, content: texto });
  }
  return out;
}

export async function simularTurno(i: {
  datos: DatosProyecto;
  bot: Pick<WaBot, 'nombre_bot' | 'criterio_aviso' | 'conocimiento'>;
  /** URL pública del sitio, o null si el proyecto no está publicado. */
  sitio: string | null;
  mensajes: MensajeSimulado[];
  /** Si en esta simulación ya se avisó al vendedor (avisar es idempotente). */
  yaAvisado: boolean;
  /** Agenda real del proyecto (solo lectura): los turnos ocupados son los de verdad. */
  visitas?: { config: ConfigVisitas | null; ocupados: Ocupado[]; ahora: Date };
  responder(x: {
    system: Anthropic.Beta.BetaTextBlockParam[];
    mensajes: Anthropic.Beta.BetaMessageParam[];
    deps: DepsHerramientas;
  }): Promise<ResultadoTurno>;
}): Promise<ResultadoSimulacion> {
  const { datos, sitio } = i;
  const configVisitas = i.visitas?.config ?? null;
  const ficha = armarFicha(
    { ...datos, resumenUnidades: resumenInventario(datos.unidades), sitio, visitas: configVisitas },
    i.bot,
  );
  const system = armarSystem(ficha, i.bot, datos.proyecto.name);

  const imagenes: string[] = [];
  const preguntas: { tema: string; pregunta: string }[] = [];
  let aviso: AvisoSimulado | null = null;
  let visita: string | null = null;
  let avisado = i.yaAvisado;

  const r = await i.responder({
    system,
    mensajes: aMensajesClaudeSimulados(i.mensajes),
    deps: {
      unidades: datos.unidades,
      material: armarMaterial(datos),
      ...(configVisitas?.activo && i.visitas
        ? {
            visitas: {
              config: configVisitas,
              ocupados: i.visitas.ocupados,
              delCliente: [],
              ahora: i.visitas.ahora,
              agendar: async (inicio: Date) => {
                visita = textoTurno(inicio);
                return 'agendada' as const;
              },
              cancelar: async () => [],
            },
          }
        : {}),
      linkUnidad: (u) => (sitio && u.id && u.edificioId ? urlUnidad(sitio, u.edificioId, u.id) : null),
      encolarImagenes: async (urls) => {
        imagenes.push(...urls);
      },
      anotarPregunta: async (p) => {
        preguntas.push(p);
      },
      avisar: async (d) => {
        if (avisado) return 'ya_avisado';
        avisado = true;
        aviso = {
          nombre: d.nombre ?? null,
          email: d.email ?? null,
          unidades: unidadesParaAviso(d.unidades, datos.unidades),
          resumen: d.resumen,
          calificacion: d.calificacion ? textoCalificacion(d.calificacion) : null,
        };
        return 'avisado';
      },
    },
  });

  if (r.motivoSinRespuesta || !r.texto) {
    return { partes: [], imagenes: [], aviso: null, preguntas: [], visita: null, motivoSinRespuesta: r.motivoSinRespuesta };
  }
  return { partes: partirRespuesta(r.texto), imagenes, aviso, preguntas, visita };
}
