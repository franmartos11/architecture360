// Datos de prueba compartidos por los tests del puente (no es un test: no lo
// corre Vitest, lo importan los *.test.ts).
import type { WaBot, WaConversacion, WaMensaje, WaSalida } from '@/types/whatsapp-bot';
import type { MensajeEntrante } from './mensaje';

export function botPrueba(p: Partial<WaBot> = {}): WaBot {
  return {
    id: 'bot1',
    project_id: 'proj1',
    estado: 'conectado',
    numero: '5491100000000',
    qr: null,
    qr_at: null,
    vinculado_at: '2026-11-10T12:00:00.000Z',
    heartbeat_at: null,
    puente_host: 'srv1',
    puente_hasta: null,
    host_permitido: 'srv1',
    ultimo_error: null,
    pedido: null,
    pedido_at: null,
    activo: true,
    nombre_bot: 'Sofía',
    vendedor_nombre: 'Juan',
    vendedor_whatsapp: null,
    vendedor_user_id: null,
    conocimiento: null,
    criterio_aviso: null,
    mensajes_hoy: 0,
    mensajes_hoy_fecha: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...p,
  };
}

export function convPrueba(p: Partial<WaConversacion> = {}): WaConversacion {
  return {
    id: 'conv1',
    bot_id: 'bot1',
    project_id: 'proj1',
    contacto_numero: '5491155551234',
    contacto_wid: '5491155551234@c.us',
    contacto_nombre: 'Ana',
    creada_post_vinculo: true,
    modo: 'bot',
    humano_hasta: null,
    avisado_at: null,
    lead_id: null,
    resumen: null,
    ultimo_mensaje: null,
    ultimo_mensaje_at: null,
    ultimo_entrante_at: null,
    no_leidos: 0,
    ia_pausada_motivo: null,
    ia_visto_hasta: null,
    created_at: '2026-11-15T00:00:00.000Z',
    ...p,
  };
}

export function salidaPrueba(p: Partial<WaSalida> = {}): WaSalida {
  return {
    id: 's1',
    bot_id: 'bot1',
    conversacion_id: 'conv1',
    destino: '5491155551234@c.us',
    cuerpo: 'Hola, te cuento',
    adjunto_url: null,
    origen: 'bot',
    autor_id: null,
    estado: 'enviando',
    intentos: 0,
    proximo_intento_at: null,
    tomado_at: '2026-11-20T14:59:00.000Z',
    error: null,
    wa_id: null,
    created_at: '2026-11-20T14:58:00.000Z',
    enviado_at: null,
    orden_at: '2026-11-20T14:57:00.001Z',
    ...p,
  };
}

export function mensajePrueba(p: Partial<WaMensaje> = {}): WaMensaje {
  return {
    id: 'm1',
    conversacion_id: 'conv1',
    wa_id: 'w1',
    direccion: 'entrante',
    autor: 'cliente',
    tipo: 'texto',
    cuerpo: 'Hola',
    media_path: null,
    enviado_at: '2026-11-20T14:57:00.000Z',
    ack: null,
    created_at: '2026-11-20T14:57:00.000Z',
    orden_at: null,
    salida_id: null,
    ...p,
  };
}

export function entrantePrueba(p: Partial<MensajeEntrante> = {}): MensajeEntrante {
  return {
    waId: 'false_5491155551234@c.us_ABC',
    deMi: false,
    wid: '5491155551234@c.us',
    numero: '5491155551234',
    nombre: 'Ana',
    esGrupo: false,
    esEstado: false,
    tipo: 'texto',
    cuerpo: 'Hola, ¿qué unidades tienen?',
    at: new Date('2026-11-20T14:57:00.000Z'),
    descargarMedio: async () => null,
    ...p,
  };
}
