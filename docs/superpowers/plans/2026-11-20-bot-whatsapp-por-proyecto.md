# Bot de WhatsApp con IA por proyecto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada proyecto vincule un número de WhatsApp por QR, que una IA responda sola con los datos del proyecto, avise al vendedor cuando hay interés real, y que todo se vea y configure desde Leads.

**Architecture:** Un proceso Node siempre prendido (`scripts/whatsapp-bot.ts`, en un servidor propio de 360, independiente de aspa) mantiene las sesiones `whatsapp-web.js`, guarda los mensajes en la Supabase de 360, corre los turnos de IA con el SDK de Anthropic y despacha una cola de salida. El admin en Vercel solo lee/escribe tablas `wa_*`. La lógica de decisión vive en módulos puros testeables en `lib/whatsapp-bot/`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (`@supabase/supabase-js`), Zod 4, Vitest, `whatsapp-web.js` 1.34.7 + `patch-package`, `qrcode`, `@anthropic-ai/sdk`, `tsx`, systemd.

**Spec:** `docs/superpowers/specs/2026-11-20-bot-whatsapp-por-proyecto-design.md`

## Global Constraints

- **Sin commits** salvo que el usuario lo pida explicitamente (preferencia del usuario). Al ejecutar, trabajar en una rama/worktree nueva, no en `fix/safari-webkit-layout-bugs`.
- **Independiente de aspa**: no importar ni llamar nada de `aspa-software` en runtime; el código se porta copiándolo. Ninguna referencia a aspa-scout en config.
- La Supabase es **compartida y de producción**: los cambios de `supabase/schema.sql` los aplica el usuario pegándolo en el SQL Editor. No correr el bot contra bots reales desde una notebook.
- Esquema: todo en `supabase/schema.sql`, idempotente (`create table if not exists`, `add column if not exists`, `drop policy if exists` + `create policy`).
- Tablas con prefijo `wa_`. Textos de UI y del bot en español rioplatense.
- Código del puente **no** importa `server-only`, `next/*` ni `react` (corre con `tsx` fuera de Next). Por eso no usa `lib/supabase/admin.ts` ni `data/project-repository.ts`.
- Modelo: `claude-opus-5-5`, `output_config: { effort: 'low' }`, sin parámetro `thinking`, `max_tokens: 16000`, `fallbacks: 'default'` con beta `server-side-fallback-2026-07-01`, herramientas con `strict: true`, `tool_choice` auto.
- Toma humana: **12 h**. Re-aviso: tras **≥ 7 días** sin mensajes del cliente. Agrupado de ráfagas: **8 s**. Tope bot: **30 respuestas/h por conversación**, **300 mensajes/día por número**. "Escribiendo…": **2–8 s** según largo. Pausa entre partes: **1–3 s**. Reintentos de envío: máx. **5** con espera creciente. Lease del puente: **90 s**, renovado cada **5 s**. Historial a la IA: últimos **40** mensajes. Máx. **3** imágenes por pedido. Aviso de puente caído en admin: heartbeat > **3 min**.
- El bot nunca afirma ser persona; nunca inventa precio/disponibilidad/entrega/pagos; nunca le escribe primero a un cliente; nunca responde al `vendedor_whatsapp`; nunca cambia `leads.status` de un lead existente.

## Review Focus

1. **Teléfonos en formatos distintos** (`+54 9 11 5555-1234`, `5491155551234`, `011 15 5555-1234`, ids `@c.us`/`@lid`): un mismo contacto tiene que resolverse al mismo número normalizado en conversación, lead existente y chequeo de vendedor. → tests en Task 2 (`normalizarTelefono`) y Task 4 (`planearLead` encuentra lead del form web).
2. **El cliente escribe mientras la IA está respondiendo**: nunca dos turnos de IA en paralelo para la misma conversación; lo que llegó durante el turno dispara un turno más al terminar. → test en Task 8 (`Agrupador`).
3. **El puente se reinicia a mitad de un envío**: un ítem `enviando` con más de 2 min vuelve a `pendiente`; un ítem ya enviado no se reenvía. → test en Task 8 (`despacho`).
4. **Datos incompletos del proyecto** (unidad sin precio, sin m², moneda distinta de USD, proyecto sin unidades): el texto para la IA dice "precio a consultar"/omite, nunca `null`, `0` o `undefined`. → tests en Task 3.
5. **Vendedor sin WhatsApp cargado**: el lead se crea igual y no se encola un aviso con destino vacío. → test en Task 4/5.

---

## Estructura de archivos

```
supabase/schema.sql                         (mod) tablas wa_*, leads.wa_conversacion_id, RLS, bucket wa-medios, realtime, RPC pública
types/whatsapp-bot.ts                       (nuevo) tipos de filas wa_* y de dominio
lib/whatsapp-bot/
  reglas.ts            puro: teléfono, contestador, debeResponder, modo humano, partir texto, re-aviso, tiempos
  ficha.ts             puro: ficha del proyecto y textos de unidades para la IA; filtrar unidades
  aviso.ts             puro: planearLead (merge no destructivo), textoAviso
  esquemas.ts          zod: config del bot, envío del vendedor
  datos.ts             lecturas Supabase del proyecto/unidades (cliente inyectado)
  db.ts                createBotClient() service role, sin server-only
  repo.ts              lecturas/escrituras wa_* para el puente
  ia/prompt.ts         system prompt
  ia/historial.ts      wa_mensajes -> MessageParam[]
  ia/herramientas.ts   definiciones + ejecución de tools (deps inyectadas)
  ia/turno.ts          responderTurno(): bucle con Anthropic
  puente/navegador.ts, puente/whatsapp-web.ts   portados de aspa
  puente/sesion.ts     SesionBot: ciclo de vida de un Client
  puente/recepcion.ts  procesarMensaje()
  puente/agrupador.ts  Agrupador (ráfagas + un turno a la vez)
  puente/despacho.ts   despacharUno()
scripts/whatsapp-bot.ts                     bucle principal
patches/whatsapp-web.js+1.34.7.patch        portado de aspa
app/api/admin/whatsapp-bot/
  route.ts                         GET/PATCH config+estado
  pedido/route.ts                  POST conectar|desconectar|reiniciar
  conversaciones/route.ts          GET lista
  conversaciones/[id]/route.ts     GET mensajes · PATCH modo (tomar/devolver) · marcar leído
  conversaciones/[id]/enviar/route.ts  POST mensaje del vendedor
app/admin/(authenticated)/(project)/leads/
  page.tsx             (mod) pestañas
  TableroLeads.tsx     (mov) kanban actual extraído sin cambios + "Ver chat"
  Conversaciones.tsx   (nuevo)
  BotWhatsapp.tsx      (nuevo)
lib/project-whatsapp-context.tsx            (nuevo) número público del proyecto
components/ui/LeadCaptureModal.tsx          (mod) usa el número real
data/project-repository.ts                  (mod) trae el número público
ops/bot/ p360-whatsapp-bot.service, instalar-bot-linux.sh, actualizar-bot.sh, README.md
.env.bot.example
```

---

### Task 1: Esquema y tipos

**Files:**
- Modify: `supabase/schema.sql` (al final, sección nueva "WhatsApp bot")
- Create: `types/whatsapp-bot.ts`
- Modify: `types/index.ts` (`Lead` + `wa_conversacion_id: string | null`)

**Interfaces:**
- Produces: tablas `wa_bots`, `wa_conversaciones`, `wa_mensajes`, `wa_salida`; `leads.wa_conversacion_id`; función `public_project_whatsapp(p_project_id uuid) returns text`; bucket privado `wa-medios`. Tipos TS: `WaBot`, `WaConversacion`, `WaMensaje`, `WaSalida`, uniones `WaEstadoBot = 'desconectado'|'esperando_qr'|'conectado'|'error'`, `WaPedido = 'conectar'|'desconectar'|'reiniciar'`, `WaModo = 'bot'|'humano'`, `WaAutor = 'cliente'|'bot'|'vendedor'|'telefono'`, `WaTipo = 'texto'|'imagen'|'audio'|'documento'|'otro'`, `WaOrigen = 'bot'|'vendedor'|'aviso'`, `WaEstadoSalida = 'pendiente'|'enviando'|'enviado'|'error'`.

- [ ] **Step 1: Escribir las tablas** exactamente con las columnas de la spec §7.2 más las de §6:
  - `wa_bots`: `id uuid pk`, `project_id uuid unique not null references projects on delete cascade`, `estado text not null default 'desconectado'` (check de los 4 valores), `numero text`, `qr text`, `qr_at`, `vinculado_at`, `heartbeat_at`, `puente_host text`, `puente_hasta timestamptz`, `host_permitido text` (null = nadie lo toma), `ultimo_error text`, `pedido text` (check 3 valores o null), `pedido_at`, `activo boolean not null default false`, `nombre_bot text`, `vendedor_nombre text`, `vendedor_whatsapp text`, `vendedor_user_id uuid references auth.users`, `conocimiento text`, `criterio_aviso text`, `mensajes_hoy int not null default 0`, `mensajes_hoy_fecha date`, `created_at`, `updated_at`.
  - `wa_conversaciones`: `id`, `bot_id → wa_bots on delete cascade`, `project_id`, `contacto_numero text not null`, `contacto_wid text` (id serializado de WA para responder, incluye `@lid`), `contacto_nombre`, `creada_post_vinculo boolean not null`, `modo text not null default 'bot'`, `humano_hasta timestamptz`, `avisado_at`, `lead_id uuid references leads on delete set null`, `resumen`, `ultimo_mensaje`, `ultimo_mensaje_at`, `ultimo_entrante_at`, `no_leidos int not null default 0`, `ia_pausada_motivo text`, `created_at`; `unique(bot_id, contacto_numero)`.
  - `wa_mensajes`: `id`, `conversacion_id → on delete cascade`, `wa_id text unique`, `direccion`, `autor`, `tipo`, `cuerpo`, `media_path text`, `enviado_at timestamptz not null`, `ack int`, `created_at`; índice `(conversacion_id, enviado_at)`.
  - `wa_salida`: `id`, `bot_id`, `conversacion_id` (nullable), `destino text not null`, `cuerpo text`, `adjunto_url text`, `origen`, `autor_id uuid`, `estado text not null default 'pendiente'`, `intentos int not null default 0`, `proximo_intento_at timestamptz default now()`, `tomado_at`, `error`, `wa_id text`, `created_at`, `enviado_at`; índice parcial `where estado in ('pendiente','enviando')`.
  - `alter table leads add column if not exists wa_conversacion_id uuid references wa_conversaciones(id) on delete set null;`

- [ ] **Step 2: RLS** con el patrón de `leads` (schema.sql ~l.952): `enable row level security` en las 4; select/update del dueño vía `projects.owner_id = auth.uid()` en `wa_bots` y `wa_conversaciones` (por `project_id`), select en `wa_mensajes` (vía conversación), y en `wa_salida` select del dueño + insert del dueño **solo** con `origen = 'vendedor' and autor_id = auth.uid()`. Sin insert/delete de `wa_bots` desde el cliente (las crea la API con la sesión: agregar policy insert del dueño con `host_permitido is null`). `host_permitido` no editable por el dueño: trigger `before update` que, si `auth.role() <> 'service_role'`, fuerza `new.host_permitido := old.host_permitido`.

- [ ] **Step 3: Extras**
  - Bucket `wa-medios` privado (patrón `message-attachments`).
  - `alter publication supabase_realtime add table wa_conversaciones, wa_mensajes, wa_salida, wa_bots;` envuelto en `do $$ … exception when duplicate_object then null; end $$`.
  - `create or replace function public_project_whatsapp(p_project_id uuid) returns text language sql security definer stable` que devuelve `numero` solo si `estado = 'conectado'` y el proyecto está `published`; `grant execute … to anon, authenticated`.

- [ ] **Step 4: Tipos** en `types/whatsapp-bot.ts` reflejando las columnas (snake_case, como `types/database.ts`).

- [ ] **Step 5: Verificar** `pnpm exec tsc --noEmit` → sin errores. Pedirle al usuario que pegue `schema.sql` en el SQL Editor (es producción); confirmar con él que corrió sin errores antes de Task 9.

---

### Task 2: Reglas puras

**Files:**
- Create: `lib/whatsapp-bot/reglas.ts`
- Test: `lib/whatsapp-bot/reglas.test.ts`

**Interfaces:**
- Produces:
  - `normalizarTelefono(raw: string): string | null` → dígitos E.164 sin `+`, Argentina móvil con `549`.
  - `esContestadorAutomatico(cuerpo: string, segundosDesdeNuestroUltimo: number | null): boolean`
  - `estaEnModoHumano(conv: Pick<WaConversacion,'modo'|'humano_hasta'>, ahora: Date): boolean`
  - `debeResponder(i: { bot: Pick<WaBot,'activo'|'vendedor_whatsapp'>; conv: Pick<WaConversacion,'modo'|'humano_hasta'|'creada_post_vinculo'|'contacto_numero'>; esContestador: boolean; respuestasUltimaHora: number; mensajesHoyNumero: number; ahora: Date }): { responde: true } | { responde: false; motivo: 'inactivo'|'pre_vinculo'|'vendedor'|'humano'|'contestador'|'tope_conversacion'|'tope_diario' }`
  - `debeRearmarAviso(avisadoAt: string | null, entrantes: string[]): boolean` → `entrantes` = fechas ISO (asc) de los mensajes del cliente desde el último anterior o igual a `avisadoAt` en adelante. True si nunca se avisó, o si entre dos entrantes consecutivos de esa lista hubo un hueco ≥ 7 días (el cliente volvió después de avisar).
  - `partirRespuesta(texto: string): string[]` → 1 a 3 partes por párrafo, ninguna > 4000 caracteres.
  - `msEscribiendo(texto: string): number` → entre 2000 y 8000.
  - Constantes exportadas: `HORAS_MODO_HUMANO = 12`, `DIAS_REAVISO = 7`, `MS_AGRUPAR = 8000`, `TOPE_POR_HORA = 30`, `TOPE_DIARIO = 300`.

- [ ] **Step 1: Tests que fallan**

```ts
describe('normalizarTelefono', () => {
  it.each([
    ['+54 9 11 5555-1234', '5491155551234'],
    ['5491155551234', '5491155551234'],
    ['5491155551234@c.us', '5491155551234'],
    ['011 15 5555-1234', '5491155551234'],
    ['11 5555 1234', '5491155551234'],
    ['+1 (415) 555-0100', '14155550100'],
  ])('%s -> %s', (raw, esperado) => expect(normalizarTelefono(raw)).toBe(esperado));
  it('basura -> null', () => expect(normalizarTelefono('hola')).toBeNull());
});

describe('esContestadorAutomatico', () => {
  it('texto largo a <=6s de nuestro mensaje', () =>
    expect(esContestadorAutomatico('Gracias por escribirnos, en breve un asesor se comunicará con usted.', 4)).toBe(true));
  it('frase típica sin importar el tiempo', () =>
    expect(esContestadorAutomatico('Respuesta automática: estamos fuera de horario', null)).toBe(true));
  it('mensaje humano corto', () => expect(esContestadorAutomatico('hola, precio del 4B?', 3)).toBe(false));
});

describe('debeResponder', () => {
  const ahora = new Date('2026-11-20T15:00:00Z');
  const base = { bot: { activo: true, vendedor_whatsapp: '5491166667777' },
    conv: { modo: 'bot', humano_hasta: null, creada_post_vinculo: true, contacto_numero: '5491155551234' },
    esContestador: false, respuestasUltimaHora: 0, mensajesHoyNumero: 0, ahora } as const;
  it('caso normal', () => expect(debeResponder(base)).toEqual({ responde: true }));
  it('chat previo al vínculo', () => expect(debeResponder({ ...base, conv: { ...base.conv, creada_post_vinculo: false } })).toEqual({ responde: false, motivo: 'pre_vinculo' }));
  it('es el vendedor', () => expect(debeResponder({ ...base, conv: { ...base.conv, contacto_numero: '5491166667777' } })).toEqual({ responde: false, motivo: 'vendedor' }));
  it('humano vigente', () => expect(debeResponder({ ...base, conv: { ...base.conv, modo: 'humano', humano_hasta: '2026-11-20T20:00:00Z' } })).toEqual({ responde: false, motivo: 'humano' }));
  it('humano vencido vuelve al bot', () => expect(debeResponder({ ...base, conv: { ...base.conv, modo: 'humano', humano_hasta: '2026-11-20T10:00:00Z' } })).toEqual({ responde: true }));
  it('humano sin fecha = permanente', () => expect(debeResponder({ ...base, conv: { ...base.conv, modo: 'humano', humano_hasta: null } })).toEqual({ responde: false, motivo: 'humano' }));
  it('tope por hora', () => expect(debeResponder({ ...base, respuestasUltimaHora: 30 })).toEqual({ responde: false, motivo: 'tope_conversacion' }));
  it('tope diario', () => expect(debeResponder({ ...base, mensajesHoyNumero: 300 })).toEqual({ responde: false, motivo: 'tope_diario' }));
});

describe('debeRearmarAviso', () => {
  const ahora = new Date('2026-11-20T15:00:00Z');
  it('nunca avisado', () => expect(debeRearmarAviso(null, [])).toBe(true));
  it('avisado y sigue la charla', () => expect(debeRearmarAviso('2026-11-19T10:00:00Z', ['2026-11-19T09:58:00Z', '2026-11-20T14:00:00Z'])).toBe(false));
  it('vuelve tras 11 días y sigue escribiendo', () => expect(debeRearmarAviso('2026-11-01T10:00:00Z', ['2026-11-01T09:58:00Z', '2026-11-12T10:00:00Z', '2026-11-12T10:05:00Z'])).toBe(true));
  it('hueco de 6 días no rearma', () => expect(debeRearmarAviso('2026-11-01T10:00:00Z', ['2026-11-01T09:58:00Z', '2026-11-07T09:00:00Z'])).toBe(false));
});

describe('partirRespuesta', () => {
  it('un párrafo = una parte', () => expect(partirRespuesta('Hola!')).toEqual(['Hola!']));
  it('máx 3 partes', () => expect(partirRespuesta('a\n\nb\n\nc\n\nd')).toHaveLength(3));
  it('nada supera 4000', () => partirRespuesta('x'.repeat(9000)).forEach(p => expect(p.length).toBeLessThanOrEqual(4000)));
});
it('msEscribiendo acotado', () => {
  expect(msEscribiendo('ok')).toBe(2000);
  expect(msEscribiendo('x'.repeat(5000))).toBe(8000);
});
```

- [ ] **Step 2:** `pnpm vitest run lib/whatsapp-bot/reglas.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar** en `lib/whatsapp-bot/reglas.ts`. `esContestadorAutomatico`: misma regla que aspa `whatsapp_es_automatica` (`aspa-software/supabase/migrations/0062_whatsapp_acks_automaticas.sql:33-50` y 0091): largo ≥ 40 y ≤ 6 s, o regex de frases (`respuesta autom`, `gracias por comunicarte con`, `gracias por escribirnos`, `horario de atenci`, `bienvenid[oa]`, `en breve (te|le) (responderemos|contestaremos|atenderemos)`). Orden de chequeo en `debeResponder`: inactivo → pre_vinculo → vendedor → humano → contestador → tope_diario → tope_conversacion (el test de tope por hora no choca con diario porque usa 0).
- [ ] **Step 4:** mismo comando → PASS.

---

### Task 3: Ficha del proyecto y lectura de datos

**Files:**
- Create: `lib/whatsapp-bot/ficha.ts`, `lib/whatsapp-bot/datos.ts`
- Test: `lib/whatsapp-bot/ficha.test.ts`

**Interfaces:**
- Consumes: `ProjectRow`, `BuildingRow`, `FloorRow`, `UnitRow`, `AmenityRow`, `PointOfInterestRow` de `types/database.ts`; `WaBot`.
- Produces:
  - `type UnidadBot = { codigo: string; edificio: string; piso: string; tipo: string; categoria: string; ambientes: number | null; dormitorios: number; banos: number; m2Total: number | null; m2Cubiertos: number | null; precio: number | null; moneda: string; estado: 'available'|'reserved'|'sold'; orientacion: string | null; expensas: number | null; cocheras: number; condicion: string | null; features: string[]; fotos: string[]; plano: string | null; plano3d: string | null }`
  - `type DatosProyecto = { proyecto: ProjectRow; edificios: BuildingRow[]; pisos: FloorRow[]; unidades: UnidadBot[]; amenities: AmenityRow[]; pois: PointOfInterestRow[]; calculadora: { interest_rate: number; max_years: number; min_down_payment: number } | null }`
  - `armarFicha(d: Omit<DatosProyecto,'unidades'> & { resumenUnidades: string }, bot: Pick<WaBot,'conocimiento'>): string`
  - `resumenInventario(unidades: UnidadBot[]): string` → conteos por tipo/ambientes y rango de precios de disponibles (sin listar todas).
  - `lineaUnidad(u: UnidadBot): string` y `fichaUnidad(u: UnidadBot): string`
  - `filtrarUnidades(us: UnidadBot[], f: { ambientes?: number; dormitorios?: number; precio_max?: number; moneda?: string; edificio?: string; estado?: 'available'|'reserved'|'sold'|'todas' }): UnidadBot[]` → default `estado = 'available'`, máx. 15 resultados ordenados por precio asc (null al final).
  - `cargarDatosProyecto(sb: SupabaseClient, projectId: string): Promise<DatosProyecto>` en `datos.ts` (consultas planas por `project_id`/`building_id in`/`floor_id in`, sin `next/*`; ambientes = `living_rooms + bedrooms` o los helpers de `lib/units.ts` si aplican sobre la fila).

- [ ] **Step 1: Tests que fallan** (fixtures mínimos construidos en el test):
  - `lineaUnidad` con precio 120000 USD → contiene `"USD 120.000"`, `"2 amb"`, `"65 m²"`, `"Disponible"`.
  - `lineaUnidad` con `precio: null` → contiene `"precio a consultar"` y no contiene `"null"`, `"undefined"`, `"USD 0"`.
  - `lineaUnidad` con `m2Total: null` → no contiene `"m²"`.
  - moneda `'ARS'` → `"ARS 95.000.000"`.
  - `filtrarUnidades` por defecto excluye reservadas/vendidas; `precio_max` excluye precio null; tope 15.
  - `resumenInventario([])` → `"Todavía no hay unidades cargadas."`.
  - `armarFicha` incluye nombre, ubicación, amenities por nombre, POI con minutos, el `conocimiento` literal, y con `calculadora` null no menciona tasas.
- [ ] **Step 2:** `pnpm vitest run lib/whatsapp-bot/ficha.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `ficha.ts` (formato de miles `es-AR`) y `datos.ts`.
- [ ] **Step 4:** → PASS.

---

### Task 4: Lead no destructivo y texto del aviso

**Files:**
- Create: `lib/whatsapp-bot/aviso.ts`
- Test: `lib/whatsapp-bot/aviso.test.ts`

**Interfaces:**
- Consumes: `Lead` (`types/index.ts`), `normalizarTelefono`.
- Produces:
  - `type DatosAviso = { telefono: string; nombre?: string; email?: string; unidades: string[]; resumen: string; conversacionId: string }`
  - `buscarLeadPorTelefono(leads: Lead[], telefono: string): Lead | null` (compara normalizados; el más reciente).
  - `planearLead(existente: Lead | null, d: DatosAviso, ahora: Date): { tipo: 'insert'; fila: Partial<Lead> } | { tipo: 'update'; id: string; cambios: Partial<Lead> }`
  - `textoAviso(i: { proyecto: string; nombre?: string; telefono: string; unidadesTexto: string[]; resumen: string; urlChat: string }): string` (formato exacto de la spec §7.7).

- [ ] **Step 1: Tests que fallan**
  - Sin existente → `insert` con `status: 'nuevo'`, `source: 'whatsapp_bot'`, `method: 'whatsapp'`, `phone` normalizado, `unit_name: '4B, 5A'`, `message` = resumen, `wa_conversacion_id`.
  - Existente del form web con `phone: '+54 9 11 5555-1234'`, `status: 'negociacion'`, `name: 'Juan'`, `email: null` y aviso con `telefono: '5491155551234@c.us'`, `nombre: 'Juan Pérez'`, `email: 'j@x.com'` → `buscarLeadPorTelefono` lo encuentra; `update` **sin** clave `status`, **sin** `name` (ya tenía), con `email: 'j@x.com'`, `message` = mensaje anterior + `"\n\n[WhatsApp 20/11/2026] "` + resumen, `wa_conversacion_id`.
  - `textoAviso` sin nombre → contiene `"Sin nombre"`, `"wa.me/5491155551234"` y la `urlChat`.
- [ ] **Step 2:** `pnpm vitest run lib/whatsapp-bot/aviso.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** → PASS.

---

### Task 5: IA (prompt, historial, herramientas, turno)

**Files:**
- Create: `lib/whatsapp-bot/ia/prompt.ts`, `ia/historial.ts`, `ia/herramientas.ts`, `ia/turno.ts`
- Test: `lib/whatsapp-bot/ia/historial.test.ts`, `ia/herramientas.test.ts`, `ia/turno.test.ts`
- Modify: `package.json` (`pnpm add @anthropic-ai/sdk`)

**Interfaces:**
- Consumes: Task 2 (`debeRearmarAviso`), Task 3 (`armarFicha`, `resumenInventario`, `filtrarUnidades`, `lineaUnidad`, `fichaUnidad`, `UnidadBot`), Task 4 (`DatosAviso`).
- Produces:
  - `armarSystem(ficha: string, bot: Pick<WaBot,'nombre_bot'|'criterio_aviso'>, nombreProyecto: string): Anthropic.Beta.BetaTextBlockParam[]` → bloque 1 = reglas + ficha con `cache_control: { type: 'ephemeral' }`.
  - `aMensajesClaude(ms: WaMensaje[]): Anthropic.Beta.BetaMessageParam[]` → cliente = user; bot = assistant; vendedor/telefono = assistant con prefijo `"[Mensaje del equipo de ventas] "`; audio → `"[El cliente mandó un audio]"`; imagen → `"[El cliente mandó una imagen]"` + cuerpo; une consecutivos del mismo rol; garantiza que empiece en user (descarta assistant iniciales); últimos 40.
  - `interface DepsHerramientas { unidades: UnidadBot[]; encolarImagenes(urls: string[]): Promise<void>; avisar(d: Omit<DatosAviso,'telefono'|'conversacionId'>): Promise<'avisado'|'ya_avisado'> }`
  - `HERRAMIENTAS: Anthropic.Beta.BetaTool[]` con nombres `buscar_unidades`, `ver_unidad`, `enviar_imagenes`, `avisar_vendedor` (schemas de spec §7.5, `strict: true`, `additionalProperties: false`).
  - `ejecutarHerramienta(nombre: string, input: unknown, deps: DepsHerramientas): Promise<{ texto: string; esError: boolean }>`
  - `responderTurno(i: { cliente: Pick<Anthropic,'beta'>; system: Anthropic.Beta.BetaTextBlockParam[]; mensajes: Anthropic.Beta.BetaMessageParam[]; deps: DepsHerramientas }): Promise<{ texto: string | null; motivoSinRespuesta?: 'refusal'|'error'|'max_iteraciones' }>`

- [ ] **Step 1: Tests que fallan**
  - `historial`: `[bot, cliente, cliente, vendedor]` → `[user(cliente+cliente unidos), assistant('[Mensaje del equipo de ventas] …')]`; 60 mensajes → ≤ 40.
  - `herramientas`: `ver_unidad` con código inexistente → `esError: true`, texto `"No existe la unidad X"`; `enviar_imagenes` con `que: 'fotos'` y 5 fotos → `encolarImagenes` recibe 3 URLs; unidad sin plano → `esError: true` y no encola; `avisar_vendedor` devuelve el texto de `'ya_avisado'` cuando la dep lo dice; input inválido (zod) → `esError: true`.
  - `turno` con cliente falso (`beta.messages.create` mockeado en secuencia): `tool_use(buscar_unidades)` → `end_turn` con texto → devuelve texto y la segunda llamada incluye el `tool_result`; `stop_reason: 'refusal'` → `{ texto: null, motivoSinRespuesta: 'refusal' }`; 8 tool_use seguidos → `max_iteraciones`; la llamada usa `model: 'claude-opus-5-5'`, `output_config: { effort: 'low' }`, `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`, `max_tokens: 16000`, sin `thinking`.
- [ ] **Step 2:** `pnpm vitest run lib/whatsapp-bot/ia` → FAIL.
- [ ] **Step 3: Implementar.** Bucle manual (no Tool Runner): hasta 6 iteraciones; ejecuta todos los `tool_use` de una respuesta y devuelve todos los `tool_result` en un único mensaje user; reenvía `response.content` completo como assistant; texto final = concatenación de bloques `text`. Errores tipados del SDK (`Anthropic.RateLimitError`, `APIError`): 1 reintento y luego `'error'`. Contenido del prompt (`prompt.ts`), en este orden: rol ("asesor/a comercial de {proyecto}, te presentás como {nombre_bot}" o "el asistente virtual de {proyecto}" si no hay nombre); **sos un asistente virtual y si te lo preguntan lo decís; nunca decís ser una persona**; tono rioplatense, mensajes cortos tipo WhatsApp, sin markdown ni tablas, máx. ~3 párrafos; reglas duras de no inventar (si algo no está en la ficha o en las herramientas: "lo consulto con el equipo y te confirman"), no prometer descuentos, no hablar de otros proyectos; precios y disponibilidad **siempre** vía herramientas; cuándo usar `avisar_vendedor` (lista de la spec §7.5) + `criterio_aviso` del proyecto si existe; tras avisar, decirle al cliente que alguien del equipo lo va a contactar; ficha.
- [ ] **Step 4:** → PASS.

---

### Task 6: Cliente y repositorio del puente

**Files:**
- Create: `lib/whatsapp-bot/db.ts`, `lib/whatsapp-bot/repo.ts`
- Test: `lib/whatsapp-bot/repo.test.ts` (solo lógica de armado de filas con un Supabase falso mínimo)

**Interfaces:**
- Produces (`repo.ts`, todas reciben `sb: SupabaseClient` primero):
  - `createBotClient(): SupabaseClient` (service role con `getSupabaseUrl`/`getSupabaseServiceRoleKey` de `lib/supabase/env.ts`, que no importa server-only).
  - `tomarBots(sb, host: string, segundos = 90): Promise<WaBot[]>` → update atómico `puente_host = host, puente_hasta = now()+90s` where `host_permitido = host and (puente_hasta is null or puente_hasta < now() or puente_host = host)`; devuelve los tomados.
  - `latir(sb, botId)`, `guardarEstado(sb, botId, cambios: Partial<Pick<WaBot,'estado'|'qr'|'qr_at'|'numero'|'vinculado_at'|'ultimo_error'>>)`, `limpiarPedido(sb, botId)`.
  - `obtenerOCrearConversacion(sb, bot: WaBot, contacto: { numero: string; wid: string; nombre: string | null }, primerMensajeAt: Date): Promise<WaConversacion>` → `creada_post_vinculo = primerMensajeAt >= bot.vinculado_at`.
  - `guardarMensaje(sb, m: Omit<WaMensaje,'id'|'created_at'>): Promise<'nuevo'|'duplicado'>` (upsert por `wa_id`, ignore duplicates) + actualiza `ultimo_mensaje*`, `no_leidos` (+1 si entrante).
  - `ponerModoHumano(sb, convId, hasta: Date | null)`.
  - `historial(sb, convId, n = 40): Promise<WaMensaje[]>`; `contarRespuestasBotUltimaHora(sb, convId): Promise<number>`.
  - `encolar(sb, s: Pick<WaSalida,'bot_id'|'conversacion_id'|'destino'|'cuerpo'|'adjunto_url'|'origen'|'autor_id'>)`.
  - `tomarSiguienteSalida(sb, botId): Promise<WaSalida | null>` → toma 1 `pendiente` con `proximo_intento_at <= now()` (o `enviando` con `tomado_at` > 2 min) pasándola a `enviando` con condición sobre el estado leído (optimistic: `update … eq('id').eq('estado', leido)`).
  - `marcarEnviada(sb, id, waId)`, `marcarFallo(sb, id, intentos, error)` (estado `error` al 5º, si no `pendiente` con `proximo_intento_at = now() + 2^intentos * 30s`).
  - `registrarAviso(sb, conv, datos: DatosAviso, bot: WaBot, proyecto: { name: string }, urlAdmin: string): Promise<'avisado'|'ya_avisado'>` → usa `debeRearmarAviso`, `buscarLeadPorTelefono`, `planearLead`, `textoAviso`; encola aviso solo si `bot.vendedor_whatsapp`; actualiza `avisado_at`, `resumen`, `lead_id`. Si hay `RESEND_API_KEY`, además manda el mismo email de "nuevo lead" que `app/api/leads/route.ts` al dueño del proyecto, usando `resend` directo (no `lib/email.ts`, que importa `server-only`); sin la variable, no-op.
  - `sumarMensajeDelDia(sb, bot)` (reinicia `mensajes_hoy` al cambiar `mensajes_hoy_fecha`, zona `America/Argentina/Buenos_Aires`).

- [ ] **Step 1: Tests que fallan** sobre `registrarAviso` con un fake de `sb` que registra llamadas: sin `vendedor_whatsapp` → hace insert en `leads` y **no** inserta en `wa_salida`; con aviso ya hecho hace 1 día → `'ya_avisado'` y no escribe nada; `obtenerOCrearConversacion` con primer mensaje anterior a `vinculado_at` → `creada_post_vinculo: false`.
- [ ] **Step 2:** `pnpm vitest run lib/whatsapp-bot/repo.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** → PASS.

---

### Task 7: Capa WhatsApp (portada de aspa)

**Files:**
- Create: `lib/whatsapp-bot/puente/navegador.ts`, `puente/whatsapp-web.ts`, `puente/sesion.ts`, `patches/whatsapp-web.js+1.34.7.patch`
- Test: `lib/whatsapp-bot/puente/whatsapp-web.test.ts`, `puente/parche.test.ts`
- Modify: `package.json` (deps `whatsapp-web.js@1.34.7` exacto, `qrcode`, `@types/qrcode`, dev `patch-package`, `tsx`; script `"postinstall": "patch-package"`)

**Interfaces:**
- Produces:
  - `class SesionBot` en `sesion.ts`: `constructor(botId: string, h: { onQr(dataUrl: string): void; onListo(numero: string): void; onCaida(motivo: string): void; onMensaje(m: MensajeEntrante): void; onAck(waId: string, ack: number): void })`, `iniciar(): Promise<void>`, `cerrar(): Promise<void>`, `cerrarSesion(): Promise<void>` (logout + borrar `.wwebjs_auth/session-<botId>`), `enviarTexto(wid: string, texto: string): Promise<string /*waId*/>`, `enviarImagen(wid: string, url: string): Promise<string>`, `escribiendo(wid: string, ms: number): Promise<void>`, `marcarLeido(wid: string): Promise<void>`, `estaViva(): Promise<boolean>`.
  - `type MensajeEntrante = { waId: string; deMi: boolean; wid: string; numero: string | null; nombre: string | null; esGrupo: boolean; esEstado: boolean; tipo: WaTipo; cuerpo: string; at: Date; descargarMedio(): Promise<{ mime: string; data: Buffer } | null> }`.
- Fuente a portar (`/Users/francisco/Desktop/Proyects/aspa-software`): `lib/whatsapp/bridge/navegador.ts` (DATA_PATH → `.wwebjs_auth`), `lib/whatsapp/bridge/whatsapp-web.ts` (parche `MsgKey`, medios desde caché), `lib/whatsapp/bridge/session.ts` (`LocalAuth({ clientId: botId })`, `puppeteer.headless`, `qrMaxRetries: 15`, QR → `QRCode.toDataURL`, `message_create`, `message_ack`, `disconnected`, salud con `getState` cada 60 s, detección de dormida > 2 min), resolución de `@lid` a número, `patches/whatsapp-web.js+1.34.7.patch` y sus tests (`whatsapp-web.test.ts`, `parche-wwebjs.test.ts`). **No** portar: índice de contactos, tandas, verificación, pase/mover, propuestas, voz/ogg.

- [ ] **Step 1:** Copiar los tests de aspa adaptando imports → `pnpm vitest run lib/whatsapp-bot/puente` FAIL.
- [ ] **Step 2:** `pnpm add whatsapp-web.js@1.34.7 qrcode` · `pnpm add -D patch-package tsx @types/qrcode`; copiar el parche; `pnpm install` aplica el parche sin error.
- [ ] **Step 3:** Portar `navegador.ts`, `whatsapp-web.ts` y escribir `SesionBot` reducido.
- [ ] **Step 4:** `pnpm vitest run lib/whatsapp-bot/puente` → PASS; `pnpm exec tsc --noEmit` → OK.

---

### Task 8: Recepción, agrupador, despacho y bucle principal

**Files:**
- Create: `lib/whatsapp-bot/puente/recepcion.ts`, `puente/agrupador.ts`, `puente/despacho.ts`, `scripts/whatsapp-bot.ts`, `.env.bot.example`
- Test: `lib/whatsapp-bot/puente/recepcion.test.ts`, `agrupador.test.ts`, `despacho.test.ts`
- Modify: `package.json` (`"bot": "tsx --env-file=.env.bot scripts/whatsapp-bot.ts"`), `.gitignore` (`.env.bot`, `.wwebjs_auth/`, `.wwebjs_cache/`)

**Interfaces:**
- Consumes: Tasks 2–7.
- Produces:
  - `procesarMensaje(deps: { repo: typeof import('../repo'); sb: SupabaseClient; bot: WaBot; subirMedio(convId: string, waId: string, m: { mime: string; data: Buffer }): Promise<string>; esDeLaCola(waId: string): boolean; agrupador: Agrupador; ahora(): Date }, m: MensajeEntrante): Promise<void>`
  - `class Agrupador { constructor(msEspera: number, correrTurno: (convId: string) => Promise<void>); avisar(convId: string): void; }` → debounce por conversación; nunca dos `correrTurno` simultáneos de la misma conversación; si llega `avisar` durante un turno, corre otro al terminar.
  - `despacharUno(deps: { sb; repo; sesion: Pick<SesionBot,'enviarTexto'|'enviarImagen'|'escribiendo'|'marcarLeido'>; esperar(ms: number): Promise<void>; azar(): number; registrarWaId(waId: string): void }, botId: string): Promise<'enviado'|'vacio'|'fallo'>`
  - `correrTurnoIA(...)` dentro de `scripts/whatsapp-bot.ts`: carga bot + conversación + `historial`, evalúa `debeResponder` (si no, guarda `ia_pausada_motivo`), `cargarDatosProyecto`, arma `system`, `responderTurno`, encola cada parte de `partirRespuesta` con `origen 'bot'`, `sumarMensajeDelDia`.

- [ ] **Step 1: Tests que fallan**
  - `recepcion`: grupo o estado → no guarda nada; `deMi` y `esDeLaCola(waId)` → no hace nada; `deMi` y no es de la cola → guarda con `autor: 'telefono'` y `ponerModoHumano(conv, ahora+12h)`; entrante normal → `guardarMensaje` + `agrupador.avisar(convId)`; entrante duplicado (`'duplicado'`) → no avisa; audio → guarda tipo `audio` con `media_path` y avisa.
  - `agrupador` (`vi.useFakeTimers()`): 3 `avisar` en 5 s → 1 turno a los 8 s del último; `avisar` durante un turno en curso (promesa pendiente) → segundo turno recién al resolver el primero; nunca 2 en paralelo.
  - `despacho`: ítem texto → `marcarLeido` → `escribiendo(ms en [2000,8000])` → `enviarTexto` → `marcarEnviada(waId)` → `registrarWaId(waId)`; `enviarTexto` lanza → `marcarFallo(intentos+1)`; ítem con `adjunto_url` → `enviarImagen`; `origen 'aviso'` → no llama `marcarLeido` ni `escribiendo`; sin ítems → `'vacio'`.
- [ ] **Step 2:** `pnpm vitest run lib/whatsapp-bot/puente` → FAIL.
- [ ] **Step 3: Implementar** los tres módulos y `scripts/whatsapp-bot.ts`:
  - Lee `BOT_HOST` (obligatorio, sin default), `ADMIN_BASE_URL` (para el link "Ver chat"), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.
  - Cada 5 s: `tomarBots(host)`; por bot tomado sin `SesionBot` y con `pedido = 'conectar'` o `estado = 'conectado'` → crear e `iniciar`; bots que se dejaron de tomar → `cerrar`; atiende `pedido` (`desconectar` → `cerrarSesion` + estado `desconectado`; `reiniciar` → `cerrar`+`iniciar`) y `limpiarPedido`; `latir`.
  - Despacho: suscripción Realtime a inserts de `wa_salida` + sondeo cada 10 s; un despachador por bot en serie, con pausa 1–3 s entre ítems.
  - `onQr` → `guardarEstado({ estado: 'esperando_qr', qr, qr_at })`; `onListo` → `{ estado: 'conectado', numero, qr: null, vinculado_at: vinculado_at ?? now() }` (no pisar si ya tenía; si el número cambió, actualizar `vinculado_at`); `onCaida` → `{ estado: 'error', ultimo_error }`.
  - Medios entrantes al bucket `wa-medios` en `<project_id>/<conv_id>/<waId>.<ext>`.
  - SIGTERM: cerrar sesiones sin logout.
- [ ] **Step 4:** `pnpm vitest run lib/whatsapp-bot` → PASS; `pnpm exec tsc --noEmit` → OK.

---

### Task 9: API del admin

**Files:**
- Create: `lib/whatsapp-bot/esquemas.ts`, `app/api/admin/whatsapp-bot/route.ts`, `pedido/route.ts`, `conversaciones/route.ts`, `conversaciones/[id]/route.ts`, `conversaciones/[id]/enviar/route.ts`
- Test: `lib/whatsapp-bot/esquemas.test.ts`

**Interfaces:**
- Consumes: `requireProjectAccess`, `resolveRequestedProjectId` (`lib/supabase/require-project-access.ts`), `normalizarTelefono`, tipos de Task 1.
- Produces (todas con el patrón de `app/api/admin/leads/route.ts`, cliente de sesión, 401/404 iguales):
  - `GET /api/admin/whatsapp-bot` → `{ bot: WaBot | null; puenteVivo: boolean }` (`puenteVivo` = `heartbeat_at` < 3 min). Si no existe, `bot: null`.
  - `PATCH /api/admin/whatsapp-bot` body `ConfigBot` → crea la fila si no existe (`vendedor_user_id` = usuario) o actualiza; devuelve `WaBot`.
  - `POST /api/admin/whatsapp-bot/pedido` body `{ pedido: WaPedido }` → setea `pedido`, `pedido_at`.
  - `GET /api/admin/whatsapp-bot/conversaciones` → lista ordenada por `ultimo_mensaje_at desc`, con `lead_id`, `avisado_at`, `modo`, `no_leidos`.
  - `GET …/conversaciones/[id]` → `{ conversacion, mensajes }` (mensajes con `media_url` firmada 1 h desde `wa-medios`); `PATCH` body `{ accion: 'tomar'|'devolver'|'leido' }` → `tomar`: `modo 'humano'`, `humano_hasta` +12 h; `devolver`: `modo 'bot'`, `humano_hasta` null; `leido`: `no_leidos 0`.
  - `POST …/conversaciones/[id]/enviar` body `{ texto: string }` → inserta `wa_salida` (`origen 'vendedor'`, `autor_id`, `destino` = `contacto_wid`) y pone modo humano +12 h.
  - `esquemas.ts`: `ConfigBot = z.object({ activo, nombre_bot, vendedor_nombre, vendedor_whatsapp, conocimiento, criterio_aviso }).partial()`; `vendedor_whatsapp` se normaliza con `normalizarTelefono` y es inválido si no normaliza; `validarConfigContraBot(c, bot): string | null` → error `"El WhatsApp del vendedor no puede ser el mismo número del bot"` si coinciden. `conocimiento` máx. 20000 caracteres, `texto` de envío 1–4000.

- [ ] **Step 1: Tests que fallan** en `esquemas.test.ts`: teléfono `'011 15 5555-1234'` → `'5491155551234'`; `'abc'` → error; vendedor igual al `numero` del bot → mensaje exacto; `conocimiento` de 20001 → error.
- [ ] **Step 2:** `pnpm vitest run lib/whatsapp-bot/esquemas.test.ts` → FAIL.
- [ ] **Step 3: Implementar** esquemas y rutas.
- [ ] **Step 4:** → PASS; `pnpm lint` y `pnpm exec tsc --noEmit` → OK.

---

### Task 10: Leads con pestañas + configuración del bot

**Files:**
- Modify: `app/admin/(authenticated)/(project)/leads/page.tsx`
- Create: `app/admin/(authenticated)/(project)/leads/TableroLeads.tsx`, `BotWhatsapp.tsx`

**Interfaces:**
- Consumes: rutas de Task 9; `useActiveProjectId`, `withActiveProject` (`lib/active-project-context.tsx`); estilos de `lib/panel-comercial-style.ts`.
- Produces: `page.tsx` con pestañas `Tablero | Conversaciones | Bot de WhatsApp` controladas por `?tab=tablero|conversaciones|bot` (default `tablero`); `?c=<convId>` abre Conversaciones en ese chat. `TableroLeads` = el kanban actual movido sin cambios de comportamiento.

- [ ] **Step 1:** Mover el kanban a `TableroLeads.tsx` sin cambios; verificar en el navegador (`pnpm dev`, `/admin/leads`) que drag & drop y filtros funcionan igual. **No editar datos reales en la prueba** (autosave contra Supabase compartida).
- [ ] **Step 2:** Pestañas en `page.tsx` con badge de no leídos en Conversaciones (suma de `no_leidos`).
- [ ] **Step 3:** `BotWhatsapp.tsx` según el boceto de la spec §7.8:
  - Estado: `desconectado` → botón "Vincular número" (POST pedido `conectar`) + texto "Usá un chip dedicado solo a este proyecto"; `esperando_qr` → QR grande desde `bot.qr` + pasos (WhatsApp → Dispositivos vinculados → Vincular); `conectado` → número + "Desconectar" (confirmación); `error` → `ultimo_error` + "Reintentar" (`reiniciar`). Polling cada 3 s mientras `esperando_qr` (o Realtime sobre `wa_bots`).
  - Si `!puenteVivo`: banner "El servidor del bot no responde".
  - Si el bot existe pero `host_permitido` es null: aviso "Falta habilitar el servidor para este proyecto" (lo setea el operador por SQL).
  - Campos con autosave (debounce 800 ms, mismo patrón que el resto del admin): Bot activo, Se presenta como (ayuda: "Usá un nombre si querés; si le preguntan, aclara que es un asistente virtual"), Vendedor (nombre + WhatsApp), Lo que el bot tiene que saber (textarea grande), Cuándo avisarme (opcional). Errores de validación de la API visibles bajo el campo.
- [ ] **Step 4:** Verificar en navegador con un **proyecto de prueba**: crear config, ver el QR aparecer con el bot corriendo localmente (`BOT_HOST` = nombre de la notebook y `host_permitido` igual en ese bot de prueba), escanear con el chip de prueba, ver "Conectado". `pnpm lint` OK.

---

### Task 11: Conversaciones en Leads

**Files:**
- Create: `app/admin/(authenticated)/(project)/leads/Conversaciones.tsx`
- Modify: `TableroLeads.tsx` (botón "Ver chat" en tarjetas con `wa_conversacion_id`)

**Interfaces:**
- Consumes: rutas de Task 9; cliente Supabase de navegador (`lib/supabase/client.ts`) para Realtime sobre `wa_conversaciones` y `wa_mensajes` filtrado por `project_id` / `conversacion_id`.

- [ ] **Step 1:** Lista + chat según el boceto §7.8: lista con búsqueda por nombre/número, punto de no leídos, 🔥 si `avisado_at`, etiqueta 🤖/👤 por `modo`; chat con burbujas por autor (cliente izquierda; bot, vendedor y teléfono derecha con etiqueta distinta), imágenes por `media_url`, audios con `<audio>`, estado de la salida pendiente/error; separador "🔥 Aviso enviado a {vendedor_nombre} · ver lead" en `avisado_at`.
- [ ] **Step 2:** Barra superior: "Tomar chat" / "Devolver al bot" (PATCH); caja "Escribí como vendedor…" (POST enviar). Al abrir un chat → PATCH `leido`.
- [ ] **Step 3:** Realtime: nuevos mensajes aparecen sin recargar; reordenar la lista.
- [ ] **Step 4:** "Ver chat" en el kanban → `?tab=conversaciones&c=<id>`.
- [ ] **Step 5:** Verificar end-to-end con el chip de prueba (Task 13 lista completa). `pnpm lint` OK.

---

### Task 12: Número real en el sitio público

**Files:**
- Create: `lib/project-whatsapp-context.tsx`
- Modify: `data/project-repository.ts` (agregar `whatsappNumber?: string` al `Project` devuelto por `getPublicProjectBySlug`, vía `rpc('public_project_whatsapp', { p_project_id })`), `types/index.ts` (`Project.whatsappNumber?: string`), el layout público que hoy monta el provider de `lib/project-type-context.tsx` (montar al lado `ProjectWhatsappProvider`), `components/ui/LeadCaptureModal.tsx`
- Test: `lib/project-whatsapp-context.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Produces: `ProjectWhatsappProvider({ numero, children })`, `useProjectWhatsapp(): string | null`.

- [ ] **Step 1: Test que falla:** sin provider → `null`; con `numero="5491144440000"` → ese valor.
- [ ] **Step 2:** `pnpm vitest run lib/project-whatsapp-context.test.ts` → FAIL.
- [ ] **Step 3:** Implementar; en `LeadCaptureModal` reemplazar `'5491100000000'` por `useProjectWhatsapp()`, y si es `null` ocultar la opción WhatsApp (y si `defaultMethod === 'whatsapp'` caer a `'email'`).
- [ ] **Step 4:** → PASS; ver en navegador un proyecto publicado con bot conectado (botón abre `wa.me/<número>`) y uno sin bot (sin botón).

---

### Task 13: Operación en servidor propio + prueba real

**Files:**
- Create: `ops/bot/p360-whatsapp-bot.service`, `ops/bot/instalar-bot-linux.sh`, `ops/bot/actualizar-bot.sh`, `ops/bot/README.md`

- [ ] **Step 1:** Unidad systemd: usuario `p360`, `WorkingDirectory=/home/p360/architecture360/my-app`, `ExecStart=/usr/bin/env pnpm bot`, `Restart=always`, `RestartSec=10`, `EnvironmentFile` no (usa `.env.bot` vía `--env-file`).
- [ ] **Step 2:** `instalar-bot-linux.sh` (idempotente, Debian/Ubuntu): crea usuario `p360`, instala Node 22 + pnpm + dependencias de Chromium que pide puppeteer, genera deploy key de solo lectura y muestra la pública para pegar en GitHub (`franmartos11/architecture360` → Deploy keys), clona rama `main`, `pnpm install --frozen-lockfile`, copia `.env.bot.example` a `.env.bot` si no existe, instala y habilita el servicio. `actualizar-bot.sh`: `git pull --ff-only`, `pnpm install --frozen-lockfile`, `systemctl restart p360-whatsapp-bot`.
- [ ] **Step 3:** `README.md`: elegir máquina (mini PC = menor riesgo de bloqueo; VPS = más cómodo, más riesgo), variables, cómo habilitar un proyecto (`update wa_bots set host_permitido = '<BOT_HOST>' where project_id = …`), ver logs (`journalctl -u p360-whatsapp-bot -f`), actualizar, y que los logins viven en `.wwebjs_auth/` (no se copian entre máquinas: mover de máquina = volver a escanear).
- [ ] **Step 4: Prueba real** con proyecto y chip de prueba (el usuario provee chip y `ANTHROPIC_API_KEY`). Checklist, cada ítem observado:
  1. Vincular por QR → "Conectado" en admin.
  2. Desde otro teléfono: "hola, qué tienen de 2 ambientes?" → respuesta con unidades reales y precios correctos.
  3. Tres mensajes seguidos → una sola respuesta.
  4. "mandame el plano del 4B" → llega la imagen.
  5. "¿sos un robot?" → dice que es un asistente virtual.
  6. "quiero visitarlo el sábado, soy Juan" → aviso al WhatsApp del vendedor con el formato de la spec + lead en el tablero; segundo mensaje de interés → sin segundo aviso.
  7. Responder desde Leads → llega al cliente desde el número del proyecto; el bot no contesta lo siguiente; "Devolver al bot" → vuelve a contestar.
  8. Escribir desde el celular del número del bot → el chat pasa a 👤.
  9. Mensaje desde el número del vendedor → el bot no responde.
  10. `systemctl restart` → reconecta sin QR.
  11. Botón WhatsApp del sitio público abre el número del proyecto.
