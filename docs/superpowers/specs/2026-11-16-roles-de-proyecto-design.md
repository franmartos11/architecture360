# Roles de proyecto y transferencia de propiedad — Diseño

Fecha: 2026-11-16
Estado: listo para aprobación

## Intención

Hoy un proyecto lo edita únicamente su dueño (`projects.owner_id`). Si dos personas
trabajan juntas en un proyecto, una tiene que pasarle todo a la otra para que lo
cargue. Queremos que el dueño pueda invitar a otras cuentas a **cargar y editar el
proyecto desde su propia cuenta**, con un **rol** que define qué ven y qué pueden
hacer, y que el dueño pueda **transferir la propiedad** a otra cuenta. El dueño
sigue siendo uno solo.

## Objetivos

- Que el dueño invite a otra cuenta (por su `handle`) con uno de tres roles fijos.
- Que la persona invitada acepte, vea el proyecto en "Mis proyectos" y trabaje en
  el panel admin con los permisos de su rol.
- Que el dueño cambie el rol de un miembro o lo saque.
- Que el dueño transfiera la propiedad a otra cuenta, que la tiene que aceptar.
- Que los permisos se apliquen **en dos capas**: en la app
  (`requireProjectAccess`) y en la base (RLS), igual que hoy con el dueño.

## No objetivos

- Edición simultánea en tiempo real (bloqueos o cursores). Si dos personas editan
  lo mismo, gana el último que guarda, como pasa hoy con dos pestañas abiertas.
- Permisos sueltos por casilla. Son tres roles fijos.
- Varios dueños.
- Que las fuentes y temas guardados (`fonts` y `saved_themes`, que son por
  cuenta) se compartan entre miembros.
- Cambiar el sistema de créditos públicos (`project_collaborators`). Sigue igual y
  separado.

## Anti-objetivos (que funcione pero esté mal)

- Que un miembro pueda **cambiarse a sí mismo el `owner_id`**, borrar el proyecto
  o subirse de rol, aunque sea llamando directo a la API o a Supabase desde el
  navegador.
- Que un Editor vea los **leads**, que son datos personales de compradores.
- Que alguien termine siendo miembro o dueño de un proyecto **sin haberlo
  aceptado**.
- Que aceptar un crédito público dé acceso de edición, o al revés.
- Que el dueño anterior pierda el acceso de golpe al transferir.

## Roles

Orden de menor a mayor: `editor` < `gestor` < `administrador` < dueño.

| Puede… | Editor | Gestor | Administrador | Dueño |
|---|:-:|:-:|:-:|:-:|
| Cargar y editar contenido: edificios, pisos, unidades, planos, tours 360°, vistas aéreas, amenities, POIs y ubicación, galería, antes/después, datos académicos, estilo, secciones, calculadora, **inventario** (precios y estados de unidades) | ✓ | ✓ | ✓ | ✓ |
| Ver y gestionar leads | | ✓ | ✓ | ✓ |
| Recibir el email de lead nuevo | | ✓ | ✓ | ✓ |
| Invitar, cambiar de rol y sacar miembros (menos al dueño). Gestionar créditos públicos | | | ✓ | ✓ |
| Mostrar u ocultar el proyecto en el portfolio (`show_in_portfolio`) | | | | ✓ |
| Borrar el proyecto | | | | ✓ |
| Transferir la propiedad | | | | ✓ |

Decisiones mías, marcadas para que las revises:
- **El inventario es contenido** (confirmado por el usuario). El Editor puede
  cambiar precios y estados de unidades. Edita la misma tabla `units` que la
  sección Edificios, así que no hace falta control por columna.
- **Un Administrador gestiona Editores y Gestores, pero no a otros
  Administradores ni al dueño.** Puede invitar como máximo a Gestor. Solo el dueño
  nombra, cambia o saca Administradores. Así el dueño anterior, que queda como
  Administrador después de una transferencia, no puede ser expulsado por otro
  Administrador; solo el nuevo dueño puede sacarlo.
- **`show_in_portfolio` es solo del dueño**, porque el portfolio es del dueño.
- **El email de lead nuevo** va al dueño y a cada miembro aceptado con rol Gestor o
  superior.

## Enfoques considerados

- **A. Tabla nueva `project_members` con rol (elegido).** Separa "acreditar" de
  "dar acceso". Una sola función en la base resuelve el rol y la usan tanto RLS
  como la app. Copia el circuito de invitación y aceptación de colaboradores.
- **B. Agregar un rol a `project_collaborators`.** Lleva menos código, pero esa
  tabla tiene lectura pública de las filas aceptadas, así que los permisos de cada
  persona quedarían a la vista. Además mezcla crédito con acceso. Descartado.
- **C. Permisos sueltos por casilla.** Es lo más flexible, pero cada casilla suma
  una regla en RLS y en la interfaz, y el usuario pidió roles. Descartado.

## Diseño

### Base de datos (`supabase/schema.sql`, idempotente, como el resto del archivo)

**Tabla `project_members`**
- `id uuid pk`, `project_id → projects(id) on delete cascade`,
  `user_id → profiles(id) on delete cascade` (el mismo patrón que
  `project_collaborators.profile_id`, donde `profiles.id = auth.users.id`).
- `role text check in ('editor','gestor','administrador')`.
- `status text check in ('pending','accepted','declined')`, default `pending`.
- `invited_by uuid → auth.users(id)`, `created_at` y `updated_at`.
- `unique (project_id, user_id)`.
- El dueño **no** tiene fila. Su rol sale de `projects.owner_id`.

**Función `project_role_rank(p_project_id uuid) returns int`**
- `security definer`, `stable` y `set search_path = public`. Usa `auth.uid()`.
- Devuelve 4 si es el dueño, 3 si es administrador, 2 si es gestor, 1 si es
  editor (solo filas `accepted`) y 0 si no tiene acceso.
- Es `security definer` para que las políticas de `project_members` puedan
  llamarla sin recursión de RLS.
- Las políticas la invocan como `(select project_role_rank(x.project_id))`, para
  que se evalúe una vez por consulta y no por fila.

**Reemplazo de políticas "owner write …"**
- Tablas de contenido (`buildings`, `floors`, `units`, `aerial_slides`,
  `aerial_hotspots`, `amenities`, `points_of_interest` y `calculator_settings`):
  `for all` con `rank >= 1`. Las anidadas (`floors`, `units` y `aerial_hotspots`)
  resuelven el `project_id` subiendo por las claves foráneas, como hoy.
- `leads`: select, update y delete con `rank >= 2`. El insert público sigue igual.
- `project_collaborators`: la gestión pasa a pedir `rank >= 3`. Las políticas de
  lectura pública y de respuesta del acreditado siguen igual.
- `project_comments`: el delete del dueño pasa a pedir `rank >= 3`.
- `projects`:
  - insert: `owner_id = auth.uid()` (sin cambios).
  - update: `rank >= 1`.
  - delete: `owner_id = auth.uid()`.
  - **Trigger `before update`** que rechaza el cambio de `owner_id` salvo que lo
    haga la función de transferencia (por ejemplo, con un flag de sesión
    `set_config('app.ownership_transfer','on', true)` que solo pone esa función).
    El mismo trigger rechaza cambios de `show_in_portfolio` si `auth.uid()` no es
    el dueño. Sin este trigger, la política de update dejaría que cualquier
    Editor se apropie del proyecto.
- `project_members`:
  - select: el propio `user_id`, o `rank >= 1` en ese proyecto (los miembros ven
    quién más está).
  - insert y delete: `rank >= 3` (ver la nota).
  - update: con `rank >= 3` se cambia el rol. La propia persona puede cambiar solo
    su `status` (aceptar, rechazar o irse).
  - Nota: las reglas finas entre roles (un Administrador invita como máximo a
    Gestor y no toca filas con rol `administrador`) se validan en la ruta de la
    app. En RLS alcanza con `rank >= 3`, igual que la nota existente sobre
    `invitee update own collaborator row`. Queda a criterio del implementador
    llevarlas también a la base si sale prolijo.
  - **Trigger `before insert or update` en `project_members`** (obligatorio):
    toda fila nace `pending`. Quien no tiene `rank >= 3` solo puede cambiar el
    `status` de su propia fila (aceptar, rechazar o irse), nunca su `role`.

**Tabla `project_ownership_transfers`**
- `id`, `project_id → projects on delete cascade`, `from_user`, `to_user →
  profiles(id)`, `status in ('pending','accepted','declined','cancelled')`,
  `created_at` y `updated_at`.
- Índice único parcial: como mucho una transferencia `pending` por proyecto.
- RLS: el dueño la crea y la cancela. `to_user` la ve y la rechaza. `to_user`
  **no** puede pasarla a `accepted` por update directo: aceptar solo se hace con
  la RPC.
- Para transferir, el destinatario debe tener perfil con `handle` (se busca por
  handle, igual que en las invitaciones).

**RPC `accept_ownership_transfer(p_transfer_id uuid)`** (`security definer`)
- Verifica que `auth.uid() = to_user`, que `status = 'pending'` y que `from_user`
  siga siendo el dueño actual. Si no se cumple, falla.
- En una sola transacción: activa el flag, hace `projects.owner_id = to_user`,
  borra la fila de `project_members` del nuevo dueño si existía, hace upsert del
  dueño anterior como `administrador` `accepted`, pone
  `show_in_portfolio = false` y marca la transferencia `accepted`.
- **Portfolio al transferir** (decisión mía): el proyecto sale de la vista pública
  hasta que el nuevo dueño decida mostrarlo en su portfolio. Así no aparece de
  golpe en un portfolio ajeno. No se crea ningún crédito automático para el dueño
  anterior: si el nuevo dueño quiere acreditarlo, lo invita con el flujo de
  créditos de siempre y el dueño anterior lo acepta.

**Notificaciones**: se amplía el check de `notifications.type` con
`project_invite`, `project_invite_accepted`, `ownership_transfer` y
`ownership_transfer_accepted`.

### App

**`lib/supabase/require-project-access.ts`**
- `requireProjectAccess(projectId, minRole = 'editor')` devuelve
  `{ user, supabase, role }` o `null`. Resuelve el rol con la misma RPC
  `project_role_rank` (una sola fuente de verdad).
- Exporta el tipo `ProjectRole = 'editor'|'gestor'|'administrador'|'dueño'` y un
  helper `hasRole(role, min)`.
- Las ~26 rutas que lo usan siguen llamándolo igual (por defecto, `editor`). Las
  que necesitan más rol lo piden explícitamente:
  - `gestor`: `api/admin/leads`, `api/admin/leads/[id]`.
  - `administrador`: `api/admin/collaborators`, `api/admin/collaborators/[id]` y
    las rutas nuevas de miembros.
  - `dueño`: `DELETE api/admin/projects/[id]` y las rutas de transferencia.
  - `PATCH api/admin/project`: con `editor` alcanza, pero si el body trae
    `showInPortfolio` se exige `dueño`.
- Las rutas por cuenta (`fonts`, `saved-themes`, `upload`, `geocode`) no cambian.

**Rutas nuevas**
- `GET/POST api/admin/members`: lista e invita por `handle` con rol. Valida que no
  sea el dueño ni ya miembro, reinvita si estaba `declined` y aplica rate limit.
  Todo copiado del POST de colaboradores. Notifica in-app y por email.
- `PATCH/DELETE api/admin/members/[id]`: cambia el rol o saca al miembro.
- `GET api/members/mine` y `POST api/members/[id]/respond`: invitaciones pendientes
  de la cuenta logueada, para aceptar o rechazar. También sirve para "irme del
  proyecto".
- `POST api/admin/projects/[id]/transfer` (crear),
  `DELETE …/transfer` (cancelar) y `POST api/transfers/[id]/respond`
  (aceptar con la RPC, o rechazar).

**`GET api/admin/projects` ("Mis proyectos")**: devuelve los proyectos propios más
los de las membresías aceptadas, cada uno con su `role`. Los conteos de leads
pendientes solo se calculan para los proyectos donde el rol es `gestor` o
superior. `/admin/portfolio` usa ese mismo endpoint, pero tiene que seguir
mostrando solo los proyectos propios: se filtra por `role = 'dueño'`, o se agrega
un parámetro.

**Interfaz**
- `/admin/proyectos`: una insignia con el rol en cada tarjeta y una sección
  "Invitaciones pendientes" arriba, con proyectos y transferencias para aceptar o
  rechazar.
- Panel del proyecto: el layout pasa `role` a `ProjectAdminShell`, que oculta del
  menú lo que el rol no puede usar (Leads si es menor que gestor). Las páginas
  ocultan los controles que no corresponden: zona de peligro y toggle de portfolio
  solo para el dueño, gestión de créditos para administrador o superior. Si
  alguien entra por URL a una página sin permiso, la página redirige al dashboard
  del proyecto.
- Nueva sección **"Equipo"** en `/admin/settings` (administrador o superior):
  lista de miembros con rol y estado, invitar por handle con selector de rol,
  cambiar rol y sacar. Para el dueño, además, **"Transferir propiedad"** con
  confirmación, que muestra el estado si hay una transferencia pendiente.
- `NotificationsPanel`: textos y links para los cuatro tipos nuevos.
- Email de lead nuevo (`api/leads/route.ts`): destinatarios = dueño + miembros
  aceptados con rol gestor o superior.

### Migración y despliegue

- Todo va en `supabase/schema.sql` (idempotente) y se aplica pegándolo en el SQL
  Editor, como indica `supabase/README.md`.
- Proyectos existentes: no hace falta migrar datos. Sin filas en
  `project_members`, todo se comporta igual que hoy.
- Orden: primero la base (las políticas nuevas son un superconjunto para el dueño,
  así que no rompen la app vieja) y después la app.

### Pruebas

- Unitarias (vitest, como `require-project-access.test.ts`): resolución de rol y
  `hasRole`, y la validación de la ruta de miembros (un administrador no invita
  por encima de su rol ni toca al dueño).
- Verificación manual con dos cuentas, documentada en el plan: invitar → aceptar
  → cargar contenido como editor → editor sin acceso a leads (ni por menú, ni por
  URL, ni por API) → intento de cambiar `owner_id` desde el cliente Supabase con
  la sesión del editor, que debe fallar → transferir → aceptar → el dueño anterior
  queda como administrador.

## Qué queda a criterio del implementador

- Nombres exactos de las rutas y componentes, y textos de la interfaz.
- Si las reglas finas entre administradores se llevan también a RLS.
- Mecanismo exacto del trigger para distinguir la transferencia legítima (flag de
  sesión u otro equivalente), siempre que un update directo de `owner_id` desde
  la sesión de un miembro falle.
- Diseño visual de la sección Equipo, en línea con el panel existente.
