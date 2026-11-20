// Filas crudas (snake_case) de las tablas del bot de WhatsApp
// (ver la sección "WhatsApp bot por proyecto" de supabase/schema.sql).

export type WaEstadoBot = 'desconectado' | 'esperando_qr' | 'conectado' | 'error';
export type WaPedido = 'conectar' | 'desconectar' | 'reiniciar';
export type WaModo = 'bot' | 'humano';
export type WaAutor = 'cliente' | 'bot' | 'vendedor' | 'telefono';
export type WaTipo = 'texto' | 'imagen' | 'audio' | 'documento' | 'otro';
export type WaOrigen = 'bot' | 'vendedor' | 'aviso';
export type WaEstadoSalida = 'pendiente' | 'enviando' | 'enviado' | 'error';
export type WaDireccion = 'entrante' | 'saliente';

export interface WaBot {
  id: string;
  project_id: string;
  estado: WaEstadoBot;
  numero: string | null;
  qr: string | null;
  qr_at: string | null;
  vinculado_at: string | null;
  heartbeat_at: string | null;
  puente_host: string | null;
  puente_hasta: string | null;
  host_permitido: string | null;
  ultimo_error: string | null;
  pedido: WaPedido | null;
  pedido_at: string | null;
  activo: boolean;
  nombre_bot: string | null;
  vendedor_nombre: string | null;
  vendedor_whatsapp: string | null;
  vendedor_user_id: string | null;
  conocimiento: string | null;
  criterio_aviso: string | null;
  mensajes_hoy: number;
  mensajes_hoy_fecha: string | null;
  created_at: string;
  updated_at: string;
}

export interface WaConversacion {
  id: string;
  bot_id: string;
  project_id: string;
  contacto_numero: string;
  contacto_wid: string | null;
  contacto_nombre: string | null;
  creada_post_vinculo: boolean;
  modo: WaModo;
  humano_hasta: string | null;
  avisado_at: string | null;
  lead_id: string | null;
  resumen: string | null;
  ultimo_mensaje: string | null;
  ultimo_mensaje_at: string | null;
  ultimo_entrante_at: string | null;
  no_leidos: number;
  ia_pausada_motivo: string | null;
  /** enviado_at del último mensaje del cliente que ya evaluó un turno de la IA. */
  ia_visto_hasta: string | null;
  created_at: string;
}

export interface WaMensaje {
  id: string;
  conversacion_id: string;
  wa_id: string | null;
  direccion: WaDireccion;
  autor: WaAutor;
  tipo: WaTipo;
  cuerpo: string | null;
  media_path: string | null;
  enviado_at: string;
  ack: number | null;
  created_at: string;
  /** Orden lógico en el historial; null = enviado_at. */
  orden_at: string | null;
  /** wa_salida que lo originó (null = entrante o escrito desde el teléfono). */
  salida_id: string | null;
}

export interface WaSalida {
  id: string;
  bot_id: string;
  conversacion_id: string | null;
  destino: string;
  cuerpo: string | null;
  adjunto_url: string | null;
  origen: WaOrigen;
  autor_id: string | null;
  estado: WaEstadoSalida;
  intentos: number;
  proximo_intento_at: string | null;
  tomado_at: string | null;
  error: string | null;
  wa_id: string | null;
  created_at: string;
  enviado_at: string | null;
  /** Se copia a wa_mensajes.orden_at al registrar el envío. */
  orden_at: string | null;
}
