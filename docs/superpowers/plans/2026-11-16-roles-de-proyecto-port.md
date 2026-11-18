# Roles de proyecto y transferencia de propiedad: plan de port sobre `main` actual

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguir el avance.

**Objetivo:** la misma funcionalidad que ya está construida y revisada en la rama `feat/roles-proyecto` (el dueño invita a otras cuentas como Editor, Gestor o Administrador y puede transferir la propiedad), pero montada sobre el `main` real, que tiene 281 commits más: panel rediseñado, BIM, proyecto activo fijado por pestaña, RLS de borradores y tests de todas las rutas de `app/api`.

**Arquitectura:** no cambia respecto de la rama vieja. Una tabla `project_members`, una función SQL `project_role_rank()` como única fuente de verdad del rango (la usan RLS y `requireProjectAccess`), triggers que protegen `owner_id`, `show_in_portfolio` y las membresías, y una tabla `project_ownership_transfers` con la RPC `accept_ownership_transfer`. Lo que cambia es **dónde** se engancha cada pieza en el código de hoy.

**Stack técnico:** Next.js 16.2 (App Router, route handlers), Supabase (Postgres, RLS, `@supabase/ssr`), vitest 4 (entorno node; `hooks/**` con jsdom por archivo), Tailwind, zod (`lib/api-validate.ts`).

**Spec:** `docs/superpowers/specs/2026-11-16-roles-de-proyecto-design.md` (copiada tal cual de la rama vieja; está aprobada y manda). Leerla antes de empezar: la tabla de roles y los anti-objetivos rigen todo el plan.

**Código de referencia:** rama `feat/roles-proyecto` (usar `git show feat/roles-proyecto:<ruta>`; los diffs, con `git diff ac9da55 feat/roles-proyecto -- <ruta>`). **Arrancar siempre desde ese código y adaptarlo; no reescribir desde cero.** El plan original está en `git show feat/roles-proyecto:docs/superpowers/plans/2026-11-16-roles-de-proyecto.md`.

---

## Restricciones globales

Heredadas del plan original, textuales:

- Roles de miembro, exactamente: `'editor' | 'gestor' | 'administrador'`. Rol efectivo del dueño: `'dueño'`. Rangos: editor=1, gestor=2, administrador=3, dueño=4 y sin acceso=0.
- El dueño **no** tiene fila en `project_members`. Su rol sale de `projects.owner_id`.
- Un Administrador gestiona (invita, cambia de rol, saca) solo filas con rol `editor` o `gestor`, e invita como máximo a `gestor`. El dueño gestiona todos los roles.
- El inventario es contenido: el Editor edita `units` completo, incluidos precio y estado.
- Solo el dueño puede borrar el proyecto, transferirlo y cambiar `show_in_portfolio`.
- Al aceptar una transferencia: `owner_id` pasa a `to_user`, se borra la fila de miembro del nuevo dueño, el dueño anterior queda como `administrador` `accepted` y `show_in_portfolio = false`. No se crea ningún crédito.
- Email de lead nuevo: al dueño y a los miembros `accepted` con rol `gestor` o `administrador`.
- Todo el SQL va al final de `supabase/schema.sql` y tiene que ser idempotente (`create … if not exists`, `drop policy if exists`, `create or replace`), siguiendo el estilo del archivo.
- **No aplicar SQL en la base de producción.** Lo aplica el usuario, pegándolo en el SQL Editor (ver `supabase/README.md`). Orden de despliegue: primero el SQL y después la app.
- Textos de la interfaz en español rioplatense, como el resto del panel ("Invitá", "Aceptá").
- ~~Trabajar en una rama nueva, `feat/roles-proyecto`~~ → **Trabajar en `feat/roles-proyecto-v2`** (worktree `.worktrees/roles-v2`, ya creada desde `origin/main` 661bc07). No tocar la rama vieja: es solo de lectura.

Nuevas, por cómo está `main` hoy:

- **Tests con Node 22** (el CI corre en Node 22; la máquina tiene Node 20): `npx -y -p node@22 node node_modules/vitest/vitest.mjs run [archivos]`. Lint: `npx eslint <archivos tocados>`. Typecheck: `npx tsc --noEmit -p .`. Build: `npx next build`. Si hace falta pnpm: `npx -y pnpm@10`.
- **Línea de base de tests (medida por el controlador desde PowerShell, cwd `C:\Users\FM\Desktop\architecture360\.worktrees\roles-v2`, con el comando de Node 22): 131 archivos, 1142 tests, todo en verde.** Correr vitest **siempre desde PowerShell con la ruta `C:\...`**: desde Git Bash (ruta `c:/` en minúscula) los `vi.mock` relativos no se aplican y aparecen falsos fallos. Nota del planificador, medida desde Git Bash: 4 archivos / 11 tests fallaban: `lib/project-base-path.test.ts`, `lib/resolve-theme.test.ts`, `lib/supabase/require-admin.test.ts` y `lib/supabase/require-project-access.test.ts`. Todos usan `vi.mock` con **ruta relativa** (`vi.mock('./server')`, `vi.mock('./auth')`…) y en este entorno Windows el mock no se aplica (`vi.mocked(...).mockReset is not a function`). Los tests que mockean con alias `@/…` pasan. Regla: en los tests nuevos o reescritos, **mockear siempre con alias `@/lib/...`**. Ningún test que hoy pasa puede quedar fallando; `require-project-access.test.ts` lo reescribe la tarea 2 y tiene que quedar verde.
- **Toda ruta nueva de `app/api/**` lleva su `route.test.ts`**, como el resto del repo: `vi.mock('@/lib/supabase/require-project-access', …)` y `mockSupabase` / `jsonRequest` de `lib/test-helpers/supabase-mock.ts` (cola de resultados por cada `.from()`, en el orden en que la ruta consulta).
- **Los tests existentes de `app/api/**` tienen que seguir pasando.** Mockean `requireProjectAccess` entero y resuelven `{ supabase, user }` **sin `role`**; ninguno afirma los argumentos de la llamada. Por eso `minRole` va dentro del objeto de opciones y no rompe nada. Solo hay que tocar los tests de las rutas que pasan a **leer** `access.role` (ver tarea 3).
- **Proyecto activo por pestaña:** todo `fetch` del panel a una ruta que resuelve "el proyecto activo" (sin id en la URL) va envuelto en `withActiveProject(url, useActiveProjectId())` de `lib/active-project-context.tsx`. Aplica a `GET/POST /api/admin/members` y a cualquier otra ruta nueva que use `resolveRequestedProjectId`. Las rutas por id (`/api/admin/members/[id]`, `/api/admin/projects/[id]/transfer`) no lo necesitan.
- **Ningún server component ni layout anidado decide permisos leyendo la cookie** (`resolveActiveProjectId()`) por debajo de `(project)/layout.tsx`: la cookie es compartida entre pestañas y puede apuntar a otro proyecto. El rol del panel sale **solo** del layout del proyecto (que fija el id para esa pestaña) y viaja por contexto.
- Validación de bodies en rutas nuevas: preferir `parseJsonBody(request, schema)` de `lib/api-validate.ts` (zod), como las rutas actuales, en vez de `request.json()` suelto.
- Después de aplicar el SQL, además del script de roles, `node supabase/verificar-rls.mjs` tiene que seguir dando los 7 chequeos en verde (un borrador no se lee desde afuera).

---

## Mapa de port

Leyenda: **tal cual** = copiar con `git show` sin cambios · **adaptar** = partir del código viejo y cambiar lo indicado · **otro archivo** = en `main` la pieza vive en otro lado · **no aplica**.

### Base de datos

| Archivo de la rama vieja | Estado | Qué hacer |
|---|---|---|
| `supabase/schema.sql` (bloque "Roles de proyecto") | **adaptar** | Tarea 1. El bloque va al final, **después del bloque de BIM** (hoy termina en la línea 1736). Además de lo que ya reemplazaba, tiene que reemplazar las políticas de BIM y sumar una política de lectura para miembros en `projects` (ver análisis 1). El ajuste de la revisión final (1862a20: `guard_project_members` con rango 4 para administradores, `guard_project_members_delete` nuevo) entra tal cual. La parte de "ubicación del bloque" de 1862a20 (devolver `api_rate_limit_hits enable rls` a su sección) **no aplica**: en `main` ya está en su lugar (línea 1427). |
| `supabase/schema.sql` (check de `notifications.type` en su sección original + comentarios cruzados) | **adaptar** | Mismas tres ediciones fuera del bloque: ampliar el check original (hoy línea 1101-1103), comentario en `project_collaborators` (línea 290-296), comentario en el bloque "RLS de escritura por dueño" (línea 853-865). Sumar el mismo tipo de comentario arriba de "Lectura pública" (línea 773) y del bloque BIM. |
| `supabase/tests/roles-verificacion.sql` | **adaptar** | Copiar y sumar los casos nuevos de la tarea 1 (borrador, BIM, `published`). La carpeta `supabase/tests/` no existe en `main`: crearla. |

### Librerías

| Archivo | Estado | Qué hacer |
|---|---|---|
| `lib/project-roles.ts` + `.test.ts` | **tal cual** | |
| `lib/project-role-context.tsx` | **tal cual** | Se monta en otro lugar (layout, no shell): ver tarea 5. |
| `lib/member-invite.ts` + `.test.ts` | **tal cual** | |
| `lib/transfer.ts` + `.test.ts` | **tal cual** | |
| `lib/lead-recipients.ts` + `.test.ts` | **tal cual** | |
| `lib/merge-projects.ts` + `.test.ts` | **tal cual** | El tipo genérico `T extends { id; created_at }` encaja con las columnas actuales del listado. |
| `lib/notify.ts` | **tal cual** (el cambio) | Solo la unión `NotificationType`. |
| `lib/supabase/require-project-access.ts` | **adaptar** | En `main` la firma es `requireProjectAccess(projectId, { revalidate })`, usa `getRequestUser()` (React `cache`) y `after()` para revalidar. `minRole` entra **en el objeto de opciones**, no como segundo argumento posicional. Se conserva el log del error de la RPC (ae49985). Suma `resolveProjectIdFromMember`. |
| `lib/supabase/require-project-access.test.ts` | **adaptar** | Reescribir los tests con alias `@/lib/supabase/server` y `@/lib/supabase/auth` (o mockear `getRequestUser`), con `rpc` en el mock. Conservar los dos tests de `resolveProjectIdFromBimModel` que hoy existen. |
| — (nuevo) `lib/test-helpers/supabase-mock.ts` | **adaptar (nuevo en el port)** | Sumarle `rpc` al cliente mock (ver tarea 2). La rama vieja no lo necesitaba porque no tenía tests de rutas. |

### Rutas API

| Archivo | Estado | Qué hacer |
|---|---|---|
| `app/api/admin/leads/route.ts`, `leads/[id]/route.ts` | **adaptar** | `{ minRole: 'gestor' }` (y `revalidate: true` donde ya estaba). `leads/[id]` hoy solo tiene `PATCH`. |
| `app/api/admin/collaborators/route.ts`, `collaborators/[id]/route.ts` | **adaptar** | `{ revalidate: true, minRole: 'administrador' }`. |
| `app/api/admin/projects/[id]/route.ts` (DELETE) | **adaptar** | `{ revalidate: true, minRole: 'dueño' }`. El borrado en sí sigue con el cliente admin (sin cambios). |
| `app/api/admin/project/route.ts` | **adaptar** | 403 si `showInPortfolio` y el rol no es `'dueño'`. Además, regla nueva para `published` y `slug` (decisión abierta 1). Agregar `role` al GET es opcional: el panel ya recibe el rol por contexto. |
| `app/api/admin/projects/route.ts` (GET) | **adaptar** | El GET de `main` trae muchas más columnas y conteos (progreso, faltantes, unidades, comentarios, créditos). Integrar `mergeProjectsWithRoles` sin perder nada de eso; los conteos de leads solo para `hasRole(role, 'gestor')`. |
| `app/api/leads/route.ts` | **adaptar** | Mismo cambio de destinatarios, pero `createAdminClient()` **dentro** del `try` (el test "si falla el envío de email…" hace que `createAdminClient` tire). |
| `app/api/admin/members/route.ts`, `members/[id]/route.ts` | **adaptar** | Cambiar `requireProjectAccess(id, 'x')` por `requireProjectAccess(id, { minRole: 'x' })` (y `revalidate` no hace falta: no toca contenido público). Validar con zod. Escribir `route.test.ts`. |
| `app/api/members/mine/route.ts` | **adaptar** | El nombre del proyecto **no** se puede leer con el cliente de sesión si el proyecto es borrador (el invitado tiene rango 0). Leer `projects(id, name, slug)` con `createAdminClient()`, filtrando por los `project_id` de las filas propias ya obtenidas. `route.test.ts`. |
| `app/api/members/[id]/route.ts`, `members/[id]/respond/route.ts` | **tal cual** (+ test) | `respond` ya trae el filtro de pendientes, el 404 y el 42501→403 de ae49985, y `escapeHtml` en el email. Escribir `route.test.ts`. |
| `app/api/admin/projects/[id]/transfer/route.ts` | **adaptar** | `{ minRole: 'dueño' }`. Validar con zod. `route.test.ts`. |
| `app/api/transfers/[id]/respond/route.ts` | **tal cual** (+ test) | `route.test.ts` (necesita `rpc` en el mock). |
| — (nuevo en `main`) `app/api/admin/projects/[id]/duplicate/route.ts` | **decidir** | `{ revalidate: true, minRole: 'dueño' }` (decisión abierta 2). |
| — (nuevo en `main`) `app/api/admin/bim/**` | **sin cambio de código** | Quedan en `editor` por defecto (decisión abierta 3). Lo que cambia es la RLS de `bim_models*`. |
| — (nuevo en `main`) `guided`, `calculate-travel-times`, `project/preview`, `project/immersive-summary`, `active-project`, `settings`, `floors/[id]/apply-template`, `floors/[id]/copy-delimitation`, `buildings/[id]/duplicate`, `floors/[id]/duplicate`, `units/bulk`, `aerial-hotspots/bulk` | **sin cambio** | Todo es contenido: `editor` por defecto. |
| `upload`, `fonts`, `saved-themes`, `geocode`, `profile`, `profile/cv` | **sin cambio** | Son por cuenta, no por proyecto. |
| — (nuevo en `main`) `data/project-repository.ts` (`getSiteProject`) | **adaptar (nuevo en el port)** | La vista previa del borrador hoy filtra `.eq('owner_id', user.id)`: un miembro recibiría 404 en "Ver sitio". Sacar ese filtro y confiar en la RLS del cliente de sesión (si el borrador se ve, es porque es dueño o miembro aceptado). |

### Panel

| Archivo de la rama vieja | Estado | Dónde va en `main` |
|---|---|---|
| `(project)/layout.tsx` | **adaptar** | Pasa `role={access.role}` al shell y envuelve **todo** (incluido `PublishStateProvider`) en `<ProjectRoleProvider role={access.role}>`, para que los controles de publicar también lean el rol. |
| `(project)/ProjectAdminShell.tsx` | **adaptar** | El shell es otro (menú "Ficha / Unidades / Sitio web / Operación / Configuración"). `canSeeLeads = showLeads && hasRole(role, 'gestor')` gobierna el ítem Leads, el título "Operación" y `useNewLeadsCount(canSeeLeads)`. Insignia de rol con `Pill` de `panel-ui` debajo del email si el rol no es `'dueño'`. |
| `(project)/leads/layout.tsx` | **no aplica** | Leía la cookie (ver restricciones). Se reemplaza por una guarda en el cliente en `(project)/leads/page.tsx`: si `!hasRole(useProjectRole(), 'gestor')`, `router.replace('/admin')` y no se pide nada. |
| `(project)/page.tsx` (dashboard) | **adaptar** | El `Promise.all` de hoy usa `withActiveProject`; el fetch de leads pasa a `Promise.resolve([])` si no es gestor, y se ocultan la tarjeta "Últimos leads" (con "Abrir CRM →") y cualquier cifra de leads. `useCallback` con `canSeeLeads` en las dependencias. |
| `hooks/useNewLeadsCount.ts` | **adaptar** | Hoy usa `useActiveProjectId` y `startTransition`. Firma `useNewLeadsCount(enabled = true)`: con `false` no hace fetch ni polling y devuelve `count: 0`. Actualizar `hooks/useNewLeadsCount.test.ts`. |
| `(project)/proyecto/page.tsx` (créditos y comentarios) | **otro archivo** | En `main` los créditos y la moderación de comentarios viven en el capítulo **Ficha → Equipo**: `(project)/proyecto/equipo/page.tsx`. Ahí va el gating de d0d6a24: formulario de créditos, "Editar" y "Quitar" solo para administrador o más (para el resto, lista de solo lectura con la línea "Solo los administradores pueden editar los créditos."), y "Borrar" comentario solo para administrador o más. `proyecto/page.tsx` (Esencial) no se toca. |
| `components/admin/section-editors/TeamEditor.tsx` | **adaptar** | Mismo gating de d0d6a24 sobre el archivo de hoy (que ya usa `withActiveProject`). |
| `(project)/settings/page.tsx` | **adaptar** | La página es otra (secciones "Visibilidad del sitio", "Comercial", "Zona de peligro"). Ver análisis 4. |
| `components/admin/TeamMembersCard.tsx` | **adaptar** | Lógica tal cual; estilo de `panel-ui` (sección como las de Configuración, `btnPrimary`, `fieldClass`, `Pill`); invitar con `PersonSearchSelect` (como el capítulo Equipo) en vez de un input de handle; `GET/POST` con `withActiveProject`. |
| `components/admin/TransferOwnershipCard.tsx` | **adaptar** | Lógica tal cual (`projectId` por prop, rutas por id); estilo de `panel-ui`; elegir destinatario con `PersonSearchSelect`. |
| `components/admin/PendingInvitations.tsx` | **adaptar** | Lógica tal cual; estilo de la página "Mis proyectos" actual. |
| `app/admin/(authenticated)/proyectos/page.tsx` | **adaptar** | `ProjectRow.role`; insignia; `PendingInvitations` entre el encabezado ("Mis proyectos" + filtros) y la grilla; en el menú de la tarjeta, "Duplicar" y "Eliminar proyecto" solo para `'dueño'`. |
| `app/admin/(authenticated)/portfolio/page.tsx` | **adaptar** | El filtro `role === 'dueño'` va en `setProjects(projectsData.projects ?? [])` (hoy línea 170). |
| `components/app/NotificationsPanel.tsx` | **adaptar** | Hoy hay una función `notificationHref(n)`: los cuatro tipos nuevos devuelven `/admin/proyectos`. Textos de `TEXT_BY_TYPE` tal cual. |
| — (nuevo en `main`) `components/admin/SitePublishStatus.tsx`, `PublishCallout.tsx`, `PublishReadinessCard` | **adaptar (nuevo en el port)** | Ocultar o deshabilitar el botón de publicar según la decisión abierta 1. |
| — (nuevo en `main`) textos "Solo vos lo ves" | **adaptar** | `settings/page.tsx:143`, `SitePublishStatus.tsx:32`, `project-landing/DraftPreviewBar.tsx:36`: "Solo vos y las personas con acceso al proyecto lo ven". |

### Docs

| Archivo | Estado |
|---|---|
| `docs/superpowers/specs/2026-11-16-roles-de-proyecto-design.md` | **tal cual** (ya copiada en este commit) |
| `docs/superpowers/plans/2026-11-16-roles-de-proyecto.md` | **no aplica**: lo reemplaza este plan |

---

## Análisis del código actual

### 1. `supabase/schema.sql`: qué políticas hay que reemplazar

Todas las políticas que hoy miran `projects.owner_id` para escribir contenido del proyecto, con el nombre que tienen en `main`:

| Tabla | Política actual (línea) | Reemplazo en el bloque de roles |
|---|---|---|
| `projects` | `owner write projects` (`for all`, 866-869) | Se borra y se parte en `owner insert projects` / `member update projects` (rango ≥ 1) / `owner delete projects`, como en la rama vieja. |
| `projects` | `public read projects` (`published or owner_id = auth.uid()`, 782-784) | **No se toca.** Se suma `members read projects` (`for select to authenticated using ((select project_role_rank(projects.id)) >= 1)`). |
| `buildings`, `amenities`, `points_of_interest`, `aerial_slides`, `calculator_settings` | `owner write …` (871-951) | `for all` rango ≥ 1 (como la rama vieja). |
| `floors`, `units`, `aerial_hotspots` | `owner write …` (880-924) | `for all` rango ≥ 1 subiendo por las FKs (como la rama vieja). |
| `leads` | `owner read/update/delete leads` (957-976) | rango ≥ 2. |
| `project_collaborators` | `owner manage collaborators` (318-325) | rango ≥ 3. |
| `project_comments` | `owner delete project comments` (743-747) | rango ≥ 3. |
| **`bim_models`** (nuevo) | `project owner read bim_models` (1694-1698) y `project owner write bim_models` (1700-1707) | Se conservan los nombres: read pasa a rango ≥ 1 (para que un miembro vea piezas sin publicar) y write a `for all` rango ≥ 1. `public read bim_models` no se toca. |
| **`bim_model_floors`**, **`bim_model_units`** (nuevos) | `project owner all …` (1718-1721, 1731-1734) | `for all` con `(select project_role_rank((select project_id from bim_models where id = <tabla>.bim_model_id))) >= 1`. |

Revisado y **sin cambios**: `public read …` de las tablas hijas (siguen siendo `published or owner_id`; el `for all` por rango ya le da lectura al miembro), `fonts` y `saved_themes` (por cuenta), `profiles.featured_project_id` y `posts.shared_project_id` (referencias, sin política propia), y el storage: `project-media` y `bim-models` no tienen políticas de escritura (se sube con service role desde rutas que ya chequean acceso), así que no hay nada por rol en storage.

**Impacto de "el borrador no se lee desde afuera" (fe7cee2), lo más delicado del port.** La rama vieja asumía `public read projects using (true)`. Hoy un proyecto en borrador solo lo ve su dueño. Sin la política `members read projects`:
- **Un miembro no puede editar un proyecto en borrador.** `PATCH /api/admin/project` hace `update … .select().single()`. Con `WHERE` y `RETURNING`, Postgres exige además pasar las políticas de **select**, así que el update afecta 0 filas y devuelve error. Lo mismo pasa con `(project)/layout.tsx`, que lee el proyecto con el cliente de sesión y redirige a "Mis proyectos" si no lo ve. O sea, el miembro ni entra al panel.
- **"Mis proyectos" pierde en silencio los borradores compartidos.** El embed `project:projects(...)` de las membresías vuelve `null` y `mergeProjectsWithRoles` lo descarta (por diseño). No hay error: simplemente no aparece.
- **`guard_project_members_delete` deja de proteger a los administradores en borradores.** Su `exists (select 1 from projects where id = old.project_id)` corre como el usuario, con RLS. Si un administrador (no dueño) no ve el proyecto, el `exists` da falso y lo deja sacar a otro administrador. Lo mismo pasa con el chequeo "el dueño no puede ser miembro" de `guard_project_members`. Con `members read projects` se arregla, pero además **declarar `guard_project_members` y `guard_project_members_delete` como `security definer set search_path = public, pg_temp`**, para que no dependan de la RLS de lectura. `auth.uid()` y `project_role_rank()` dan lo mismo con `security definer`, porque leen el JWT de la sesión y no el rol de Postgres.
- **`project_role_rank` en sí no se ve afectado:** es `security definer` y lee `projects` sin RLS. **Ojo:** la política nueva de `projects` llama a una función que lee `projects`. No hay recursión solo porque la función, al ser `security definer` y del dueño de la tabla, se salta la RLS. Si la verificación tira `42P17 infinite recursion`, la causa es esa.
- **No meter `project_role_rank` dentro de `public read projects`.** Esa política es `to anon, authenticated`, y la función tiene `revoke execute … from anon`. Por eso va como política aparte, `to authenticated`.
- **El invitado pendiente (rango 0) no ve el nombre de un borrador.** Lo resuelve `GET /api/members/mine` leyendo con el cliente admin (ver mapa). La RPC de aceptar transferencia es `security definer`, así que no tiene problema.
- **Embeds y vista previa:** `getProjectBySlug` (cliente de sesión) arma la vista previa del panel con todas las tablas hijas. Con `members read projects` más los `for all` por rango, un miembro ve el borrador completo. Solo falta sacar el `.eq('owner_id', …)` de `getSiteProject` para que "Ver sitio" no dé 404.
- `verificar-rls.mjs` (anon) no cambia de resultado: todo lo nuevo es `to authenticated`.

### 2. `lib/supabase/require-project-access.ts`

Hoy: `requireProjectAccess(projectId, { revalidate = false } = {})` → `ProjectAccess { user, supabase } | null`, con `getRequestUser()` y `.from('projects').eq('owner_id', user.id)`. Hay 57 llamadas en 38 archivos, y 36 archivos de test de rutas lo mockean entero con `vi.fn()`.

Decisión:
- Firma nueva: `requireProjectAccess(projectId: string, { revalidate = false, minRole = 'editor' }: { revalidate?: boolean; minRole?: ProjectRole } = {}): Promise<ProjectAccess | null>`.
- `ProjectAccess` suma `role: ProjectRole` (obligatorio). La forma devuelta es un superconjunto de la de hoy. Los mocks que resuelven `{ supabase, user } as never` siguen compilando y pasando.
- Resuelve el rango con `supabase.rpc('project_role_rank', { p_project_id: projectId })`. Si hay error: `console.error('[requireProjectAccess] project_role_rank falló:', error)` y `null` (fail-closed). Después `rankToRole` y `hasRole`. `after(() => revalidateProjectById(...))` solo si hay acceso, como hoy.
- Las llamadas existentes no se tocan, salvo las de la tabla de la tarea 3.

### 3. Rutas: rol mínimo de cada una

| Ruta | Rol mínimo |
|---|---|
| Todas las de contenido: `aerial-*`, `amenities*`, `buildings*`, `floors*` (incluidas `apply-template`, `copy-delimitation`, `duplicate`), `units*` (incluida `bulk`), `points-of-interest*`, `calculate-travel-times`, `guided` (GET/POST/PATCH), `settings` (calculadora), `project/preview`, `project/immersive-summary`, `active-project`, `bim*` (incluido `upload-model`) | `editor` (default, sin cambio de código) |
| `GET /api/admin/project` | `editor` |
| `PATCH /api/admin/project` | `editor`. Con `showInPortfolio` → 403 si no es `dueño`. Con `published` o `slug` → 403 si no es `administrador` o más (decisión abierta 1). |
| `GET /api/admin/leads`, `PATCH /api/admin/leads/[id]` | `gestor` |
| `POST /api/admin/collaborators`, `PATCH/DELETE /api/admin/collaborators/[id]` | `administrador` |
| `DELETE /api/comments/[id]` | sin `requireProjectAccess`: decide la RLS (autor, o rango ≥ 3) |
| `DELETE /api/admin/projects/[id]` | `dueño` |
| `POST /api/admin/projects/[id]/duplicate` | `dueño` (decisión abierta 2) |
| `GET /api/admin/projects` | sesión; propios + membresías aceptadas, cada uno con `role` |
| `POST /api/admin/projects` | sin cambio (el proyecto nuevo es de quien lo crea) |
| Nuevas: `GET /api/admin/members` | `editor` |
| `POST /api/admin/members`, `PATCH/DELETE /api/admin/members/[id]` | `administrador` (más `canManageMember`) |
| `GET /api/members/mine`, `PATCH /api/members/[id]/respond`, `DELETE /api/members/[id]` | solo sesión (filas propias) |
| `GET/POST/DELETE /api/admin/projects/[id]/transfer` | `dueño` |
| `PATCH /api/transfers/[id]/respond` | solo sesión (`to_user`) |
| Server: `(project)/layout.tsx`, `(project)/carga/page.tsx` | `editor` |

### 4. Interfaz

- **Rol en el cliente:** `(project)/layout.tsx` ya resuelve `requireProjectAccess(projectId)` una vez por pestaña y fija el id con `ActiveProjectIdProvider`. El rol sale de esa misma llamada y viaja por `ProjectRoleProvider`, montado en el layout por fuera de `PublishStateProvider`. Así el rol y el proyecto de la pestaña siempre coinciden.
- **Menú (`ProjectAdminShell`):** Leads y el título "Operación" (cuando solo existiría por Leads) dependen de `canSeeLeads`. Insignia de rol debajo del email. "Configuración" queda para todos: tiene "Comercial" (contenido).
- **Configuración (`settings/page.tsx`)**, en orden:
  1. "Visibilidad del sitio" (publicar y dirección pública): editable según la decisión abierta 1. Si el rol no alcanza, se muestra en solo lectura con la línea "Solo un administrador o el dueño puede publicar o cambiar la dirección".
  2. "Comercial": todos.
  3. **Nueva: "Acceso al proyecto"** (`TeamMembersCard`), para administrador o más. No se llama "Equipo" porque ese nombre ya lo usa el capítulo de créditos de la Ficha; la spec deja los textos a criterio.
  4. **Nueva: "Transferir propiedad"** (`TransferOwnershipCard`), solo para el dueño.
  5. "Zona de peligro" (Duplicar y Eliminar), solo para el dueño.
- **Ficha → Equipo (`proyecto/equipo/page.tsx`)** y **`TeamEditor`:** el gating de d0d6a24.
- **Dashboard:** sin leads para menos que gestor.
- **Leads (`leads/page.tsx`):** guarda en el cliente por rol.
- **Mis proyectos:** `PendingInvitations` arriba de la grilla, insignia por tarjeta, menú de la tarjeta según el rol, conteo de leads en 0 para menos que gestor (lo hace la API).
- **Portfolio:** solo los propios.
- **Campanita:** cuatro tipos nuevos, con link a `/admin/proyectos`.
- **Publicar:** `SitePublishStatus`, `PublishCallout` y `PublishReadinessCard` ocultan el botón "Publicar" si el rol no alcanza (decisión abierta 1). Siguen mostrando el estado.

### 5. `app/api/leads/route.ts`

Hoy notifica solo al dueño: `createAdminClient().auth.admin.getUserById(project.owner_id)` dentro de un `try`, con `escapeHtml` en el HTML. El port aplica el cambio de la rama vieja: lee `project_members` con el cliente admin y hace un `try/catch` por destinatario de `leadRecipientIds`. Hay un matiz por los tests existentes: `const admin = createAdminClient()` tiene que quedar **dentro** de un `try`, porque el test "si falla el envío de email, la respuesta sigue siendo success (best-effort)" hace que tire. Si la lectura de miembros falla, igual se avisa al dueño. El mock de `admin` en el test "lead válido…" no tiene `.from`: se le agrega para el test nuevo, y el test viejo sigue pasando porque la falla de lectura se traga.

---

### Task 1: SQL de roles sobre el `schema.sql` actual, y script de verificación

**Archivos:**
- Modificar: `supabase/schema.sql`. Un bloque nuevo al final (después de la línea 1736, el bloque BIM) y las tres ediciones fuera del bloque que lista el mapa.
- Crear: `supabase/tests/roles-verificacion.sql`.

**Interfaces que produce** (las mismas que la rama vieja, más lo nuevo):
- `project_members`, `project_role_rank(p_project_id uuid) returns int`, `project_ownership_transfers`, `accept_ownership_transfer(p_transfer_id uuid) returns uuid` y los triggers `guard_project_owner_fields`, `guard_project_members` y `guard_project_members_delete`. Las definiciones están en `git show feat/roles-proyecto:supabase/schema.sql`, desde `-- ═══ Roles de proyecto` hasta el final.
- Nuevo: la política `members read projects` en `projects` (select, `to authenticated`, rango ≥ 1).
- Nuevo: `bim_models`, `bim_model_floors` y `bim_model_units` con escritura por rango ≥ 1, conservando sus nombres actuales.
- Nuevo: `guard_project_owner_fields` también rechaza los cambios de `published` y de `slug` cuando `auth.uid() is not null and project_role_rank(old.id) < 3 and not v_transfer` (con errcode `42501`). Es la decisión abierta 1: si el usuario elige otra cosa, cambia solo el umbral.
- Cambio: `guard_project_members` y `guard_project_members_delete` pasan a `security definer set search_path = public, pg_temp`.
- `notifications_type_check` con los cuatro tipos nuevos, en los dos lugares.
- Recomendado: `accept_ownership_transfer` también limpia el destacado del dueño anterior (`update profiles set featured_project_id = null where id = from_user and featured_project_id = project_id`). Es inofensivo y evita un id destacado colgando.

- [ ] **Paso 1:** copiar el bloque de la rama vieja al final de `schema.sql`. Agregar al comentario de cabecera un párrafo sobre los borradores, la política `members read projects` y por qué los triggers son `security definer`.
- [ ] **Paso 2:** agregar los reemplazos de BIM y la política `members read projects`. Ampliar `guard_project_owner_fields` con `published`/`slug`.
- [ ] **Paso 3:** hacer las ediciones fuera del bloque (check de notificaciones y comentarios cruzados en "Lectura pública", "RLS de escritura por dueño", `project_collaborators` y BIM).
- [ ] **Paso 4:** partir de `git show feat/roles-proyecto:supabase/tests/roles-verificacion.sql` y sumar estos casos, dentro del mismo `begin … rollback`:
  1. El proyecto de prueba nace con `published = false`.
  2. Como `other`, con la invitación pendiente: `select count(*) from projects where id = t.project` da 0.
  3. Como `other`, ya editor aceptado:
     - `select` del proyecto da 1;
     - `update projects set name = name || ' x' where id = t.project returning id` devuelve 1 fila;
     - puede leer `buildings` del borrador;
     - `insert` en `bim_models` del proyecto funciona;
     - `update projects set published = true` falla con `42501`.
  4. Como un tercer usuario administrador (`HANDLE_TERCERO`, opcional), en el borrador: no puede borrar la fila de otro administrador. Si el script solo tiene dos handles, cubrirlo con `owner` → `other` administrador, y después `other` intenta borrar al dueño anterior tras la transferencia.
  5. Como `anon` (`set local role anon`), el borrador sigue sin leerse.
- [ ] **Paso 5: Verificación.** No hay Supabase local. Pedirle al usuario que pegue `schema.sql` entero en el SQL Editor de una base de prueba (o la de producción, si así lo decide), después `supabase/tests/roles-verificacion.sql` con sus handles, y que corra `node supabase/verificar-rls.mjs`.
  - Resultado esperado: `OK: todas las verificaciones pasaron`, ningún `FALLO:` y los 7 chequeos de `verificar-rls.mjs` en verde.
  - Si todavía no se puede, marcar la tarea como "SQL escrito, sin verificar" y seguir: las tareas 2 a 7 se prueban con mocks.
- [ ] **Paso 6: Commit**
```bash
git add supabase/schema.sql supabase/tests/roles-verificacion.sql
git commit -m "feat(db): roles de proyecto, transferencia y RLS por rango sobre el esquema actual"
```

---

### Task 2: Reglas de roles, `requireProjectAccess` con rol y mock con `rpc`

**Archivos:**
- Crear (con `git show`, tal cual): `lib/project-roles.ts`, `lib/project-roles.test.ts`, `lib/project-role-context.tsx`, `lib/merge-projects.ts`, `lib/merge-projects.test.ts`, `lib/member-invite.ts`, `lib/member-invite.test.ts`, `lib/transfer.ts`, `lib/transfer.test.ts`, `lib/lead-recipients.ts`, `lib/lead-recipients.test.ts`.
- Modificar: `lib/supabase/require-project-access.ts`, `lib/supabase/require-project-access.test.ts`, `lib/test-helpers/supabase-mock.ts` y `lib/notify.ts` (la unión de tipos).

**Interfaces:**
- Consume: la RPC `project_role_rank` (tarea 1).
- Produce (sin cambios de nombre respecto de la rama vieja):
  - `ProjectRole`, `MemberRole`, `MEMBER_ROLES`, `ROLE_RANK`, `ROLE_LABELS`;
  - `rankToRole(rank: number): ProjectRole | null`;
  - `hasRole(role: ProjectRole | null, min: ProjectRole): boolean`;
  - `canManageMember(actor: ProjectRole, target: MemberRole): boolean`;
  - `isMemberRole(v: unknown): v is MemberRole`;
  - `ProjectRoleProvider({ role, children })` y `useProjectRole(): ProjectRole` (default `'editor'`);
  - `mergeProjectsWithRoles<T extends { id: string; created_at: string }>(owned: T[], memberships: { role: MemberRole; project: T | null }[]): (T & { role: ProjectRole })[]`;
  - `planMemberInvite(...)`, `validateTransferTarget(...)` y `leadRecipientIds(ownerId: string, members: { user_id: string; role: MemberRole; status: string }[]): string[]`, con las firmas del plan original.
- Produce: `interface ProjectAccess { user: User; supabase: SupabaseClient; role: ProjectRole }`.
- Produce: `requireProjectAccess(projectId: string, opts?: { revalidate?: boolean; minRole?: ProjectRole }): Promise<ProjectAccess | null>`.
- Produce: `resolveProjectIdFromMember(memberId: string): Promise<string | null>`.
- Produce: `mockSupabase({ results, user, storage, rpc })`. `rpc?: MockResult[]` es una cola aparte para `supabase.rpc(...)` (un `vi.fn` que devuelve el siguiente resultado; si la cola está vacía, tira un error claro, igual que `.from()`).
- Produce: `NotificationType` con `'project_invite' | 'project_invite_accepted' | 'ownership_transfer' | 'ownership_transfer_accepted'`.

- [ ] **Paso 1:** traer los archivos "tal cual" con `git show feat/roles-proyecto:<ruta> > <ruta>`.
- [ ] **Paso 2:** reescribir `require-project-access.test.ts` con mocks por alias:
  - `vi.mock('@/lib/supabase/server', …)`, o mockear `@/lib/supabase/auth` → `getRequestUser`;
  - `vi.mock('next/headers')`, `vi.mock('next/server', () => ({ after: vi.fn() }))`, `vi.mock('@/lib/revalidate-project', …)` y `vi.mock('server-only')`.

  Tests:
  - `devuelve null si no hay sesión`;
  - `devuelve null con rango 0 (sin acceso o invitación pendiente)`;
  - `devuelve null si el rol no alcanza el mínimo` (rango 1 con `{ minRole: 'gestor' }`);
  - `devuelve role 'dueño' con rango 4`;
  - `por defecto exige editor`;
  - `llama la RPC con p_project_id` (`expect(rpc).toHaveBeenCalledWith('project_role_rank', { p_project_id: 'project-1' })`);
  - `devuelve null y loguea si la RPC falla`;
  - nuevo: `con revalidate: true y acceso, agenda la revalidación` (`after` llamado);
  - nuevo: `sin acceso no agenda revalidación`;
  - conservar `resolveProjectIdFromBimModel` (2 tests);
  - nuevo: `resolveProjectIdFromMember devuelve el project_id de la fila`.
- [ ] **Paso 3:** correr los tests y verificar que fallan.

  Ejecutar: `npx -y -p node@22 node node_modules/vitest/vitest.mjs run lib/supabase/require-project-access.test.ts`

  Resultado esperado: FAIL (no hay `rpc` ni `minRole`). Si en cambio falla con `mockReset is not a function`, todavía queda un `vi.mock` relativo.
- [ ] **Paso 4:** implementar `requireProjectAccess` como en el análisis 2, `resolveProjectIdFromMember` y el `rpc` del mock. Actualizar el comentario de `requireProjectAccess`: "tener al menos `minRole`", no "ser el dueño".
- [ ] **Paso 5:** verificar.

  Ejecutar:
  - `npx -y -p node@22 node node_modules/vitest/vitest.mjs run lib/project-roles.test.ts lib/merge-projects.test.ts lib/member-invite.test.ts lib/transfer.test.ts lib/lead-recipients.test.ts lib/supabase/require-project-access.test.ts`
  - `npx -y -p node@22 node node_modules/vitest/vitest.mjs run app/api`
  - `npx tsc --noEmit -p .`

  Resultado esperado:
  - el primer comando, todo en PASS;
  - `app/api`, los mismos verdes que en la línea de base (ninguna ruta lee `role` todavía);
  - tsc sin errores.
- [ ] **Paso 6: Commit**
```bash
git add lib/
git commit -m "feat: requireProjectAccess resuelve el rol del usuario en el proyecto"
```

---

### Task 3: Rol mínimo en las rutas existentes, listado con proyectos compartidos y vista previa para miembros

**Archivos:**
- Modificar:
  - `app/api/admin/leads/route.ts` y `leads/[id]/route.ts`;
  - `app/api/admin/collaborators/route.ts` y `collaborators/[id]/route.ts`;
  - `app/api/admin/projects/[id]/route.ts` y `projects/[id]/duplicate/route.ts`;
  - `app/api/admin/project/route.ts`;
  - `app/api/admin/projects/route.ts`;
  - `data/project-repository.ts` (`getSiteProject`).
- Modificar los tests: `app/api/admin/leads/route.test.ts`, `leads/[id]/route.test.ts`, `collaborators/route.test.ts`, `collaborators/[id]/route.test.ts`, `projects/[id]/route.test.ts`, `projects/[id]/duplicate/route.test.ts`, `project/route.test.ts` y `projects/route.test.ts`.

**Interfaces:**
- Consume: `requireProjectAccess(..., { minRole })`, `hasRole` y `mergeProjectsWithRoles` (tarea 2).
- Produce: `GET /api/admin/projects` → `{ projects: (ProjectRow & { role: ProjectRole })[], activeProjectId }`. `ProjectRow` conserva todo lo que devuelve hoy (`pendingLeadsCount`, `commentsCount`, `unitsCount`, `progress`, `missing`). Columnas comunes en una constante `PROJECT_COLUMNS` (las de la línea 30 de hoy). Las membresías salen de `project_members.select('role, project:projects(<PROJECT_COLUMNS>)').eq('user_id', user.id).eq('status', 'accepted')`. Todos los conteos se calculan sobre `projectIds` de la lista unida; leads solo sobre `leadProjectIds` (rol gestor o más).
- Produce: `PATCH /api/admin/project`:
  - 403 `{ error: 'Solo el dueño puede cambiar la visibilidad en el portfolio' }` si viene `showInPortfolio` y el rol no es `dueño`;
  - 403 `{ error: 'Solo un administrador o el dueño puede publicar o cambiar la dirección del sitio' }` si viene `published` o `slug` y `!hasRole(role, 'administrador')`;
  - ambos chequeos van antes de cualquier consulta.

- [ ] **Paso 1: Tests que fallan.**
  - En cada ruta con `minRole`, un test `pide el rol mínimo <rol>` con `expect(requireProjectAccess).toHaveBeenCalledWith('project-1', expect.objectContaining({ minRole: '<rol>' }))`. Va en leads, `leads/[id]`, collaborators (POST), `collaborators/[id]` (PATCH y DELETE), `projects/[id]` DELETE y duplicate.
  - En `project/route.test.ts`:
    - `showInPortfolio sin ser dueño: 403 sin tocar la base`;
    - `published siendo editor: 403`;
    - `slug siendo editor: 403`;
    - `published siendo administrador: pasa`.
  - En los tests existentes de `published` (líneas ~363-390), agregar `role: 'dueño'` al acceso mockeado.
  - En `projects/route.test.ts`, insertar en la cola el resultado de la consulta de membresías (va justo después de la de propios, porque salen del mismo `Promise.all`) en `error al listar…`, `sin proyectos…` y `con proyectos…`. Tests nuevos:
    - `incluye los proyectos compartidos con su rol`;
    - `no consulta leads de proyectos donde el rol es editor`;
    - `error al listar membresías: 500`.
- [ ] **Paso 2:** correr los tests y verificar que fallan.

  Ejecutar: `npx -y -p node@22 node node_modules/vitest/vitest.mjs run app/api/admin/leads app/api/admin/collaborators app/api/admin/projects app/api/admin/project`

  Resultado esperado: FAIL solo en los tests nuevos.
- [ ] **Paso 3:** implementar.
  - En `getSiteProject`, sacar `.eq('owner_id', user.id)` y dejar un comentario: la RLS del cliente de sesión solo devuelve el borrador al dueño o a un miembro aceptado.
- [ ] **Paso 4:** verificar.

  Ejecutar:
  - `npx -y -p node@22 node node_modules/vitest/vitest.mjs run app/api lib`
  - `npx tsc --noEmit -p .`
  - `npx eslint app/api/admin data/project-repository.ts`

  Resultado esperado: sin fallas nuevas respecto de la línea de base. Fuera de los 3 archivos de base que fallan por los mocks relativos, todo en verde.
- [ ] **Paso 5: Commit**
```bash
git add app/api/admin data/project-repository.ts
git commit -m "feat: rutas admin exigen el rol mínimo de cada acción y listan proyectos compartidos"
```

---

### Task 4: API de miembros

**Archivos:**
- Crear (partiendo de la rama vieja):
  - `app/api/admin/members/route.ts` y `app/api/admin/members/[id]/route.ts`;
  - `app/api/members/mine/route.ts`;
  - `app/api/members/[id]/route.ts`;
  - `app/api/members/[id]/respond/route.ts`.
- Crear: un `route.test.ts` junto a cada una.

**Interfaces:** las mismas del plan original (tarea 4), con estos cambios:
- `requireProjectAccess(projectId, { minRole: 'editor' | 'administrador' })`.
- Bodies con zod:
  - POST: `z.object({ handle: z.string().min(1), role: z.enum(['editor','gestor','administrador']) })`;
  - PATCH: `{ role }`;
  - respond: `{ status: z.enum(['accepted','declined']) }`.
- `GET /api/members/mine` → `{ invitations: { id, role, project: { id, name, slug } | null, inviter: { handle, display_name } | null }[], transfers: { id, project: { id, name } | null, from: { handle, display_name } | null }[] }`. Lee las filas propias `pending` con el cliente de sesión y **los nombres de proyecto con `createAdminClient()`**, filtrando `in('id', <project_ids de esas filas>)`.
- Respuestas de error: las de la rama vieja (incluidos 23505 → 409, 42501 → 403 y "Invitación no encontrada" → 404 en `respond` si la fila no estaba `pending`).

- [ ] **Paso 1: Tests que fallan.** Cada `route.test.ts` cubre:
  - `members` GET:
    - `sin proyecto activo: 404`;
    - `sin acceso: 401`;
    - `devuelve dueño, miembros y myRole`.
  - `members` POST:
    - `body inválido: 400 antes de chequear acceso`;
    - `pide rol administrador`;
    - `handle inexistente: 404`;
    - `un administrador invitando administrador: 403` (vía `planMemberInvite`);
    - `ya es parte del equipo: 409`;
    - `reinvita a quien rechazó con un solo update, 201`;
    - `rate limit: 429`;
    - `invitación nueva: inserta, notifica project_invite, 201`;
    - `insert rechazado por el trigger (42501): 403`.
  - `members/[id]` PATCH y DELETE:
    - `miembro inexistente: 404`;
    - `administrador sobre fila de administrador: 403`;
    - `dueño cambia rol: 200`.
  - `members/mine`:
    - `sin sesión: 401`;
    - `lee nombres de proyecto con el cliente admin` (para que un borrador no salga con `project: null`).
  - `members/[id]/respond`:
    - `status inválido: 400`;
    - `solo responde filas pendientes: 404 si no estaba pending`;
    - `42501: 403`;
    - `aceptar notifica project_invite_accepted al que invitó`.
  - `members/[id]` DELETE:
    - `borra solo la fila propia`;
    - `ninguna fila: 404`.
- [ ] **Paso 2:** correr los tests y verificar que fallan.

  Ejecutar: `npx -y -p node@22 node node_modules/vitest/vitest.mjs run app/api/admin/members app/api/members`

  Resultado esperado: FAIL.
- [ ] **Paso 3:** implementar, copiando y adaptando con `git show feat/roles-proyecto:app/api/admin/members/route.ts`, etc.
- [ ] **Paso 4:** verificar.

  Ejecutar:
  - el mismo vitest;
  - `npx tsc --noEmit -p .`;
  - `npx eslint app/api/admin/members app/api/members`.

  Resultado esperado: todo en PASS y sin errores.
- [ ] **Paso 5: Commit**
```bash
git add app/api/admin/members app/api/members
git commit -m "feat: API para invitar, gestionar y aceptar miembros de proyecto"
```

---

### Task 5: Transferencia de propiedad y emails de leads al equipo

**Archivos:**
- Crear (partiendo de la rama vieja): `app/api/admin/projects/[id]/transfer/route.ts` y `app/api/transfers/[id]/respond/route.ts`, con su `route.test.ts`.
- Modificar: `app/api/leads/route.ts` y `app/api/leads/route.test.ts`.

**Interfaces:**
- Consume:
  - `validateTransferTarget(input: { ownerId: string; ownerHasHandle: boolean; targetId: string | null; hasPending: boolean }): { error: string; status: 400 | 404 | 409 } | null`;
  - la RPC `accept_ownership_transfer`;
  - `leadRecipientIds`.
- Produce: `GET/POST/DELETE /api/admin/projects/[id]/transfer` (`{ minRole: 'dueño' }`), con las respuestas de la rama vieja. El body de POST se valida con zod: `{ handle }`.
- Produce: `PATCH /api/transfers/[id]/respond` (`{ status: 'accepted' | 'declined' }`). Si acepta: `rpc('accept_ownership_transfer', { p_transfer_id })`, 409 con el mensaje si falla, `{ projectId }` y notificación `ownership_transfer_accepted` si sale bien. Si rechaza: update a `declined` filtrado por `to_user`, 404 si no afectó filas.

- [ ] **Paso 1: Tests que fallan.**
  - `transfer`:
    - `pide rol dueño`;
    - `transferir a uno mismo: 400`;
    - `handle inexistente: 404`;
    - `ya hay una pendiente: 409`;
    - `23505 por carrera: 409`;
    - `crea, notifica ownership_transfer y manda email con el nombre escapado`;
    - `DELETE sin pendiente: 404`.
  - `transfers/[id]/respond`:
    - `aceptar llama la RPC con p_transfer_id y devuelve projectId`;
    - `error de la RPC: 409 con el mensaje`;
    - `rechazar actualiza solo si es to_user`;
    - `rechazar algo que no es propio: 404`.
  - `leads`:
    - nuevo `notifica también a gestores y administradores aceptados, no a editores ni pendientes` (`sendEmail` con 3 destinatarios);
    - nuevo `si falla la lectura de miembros, igual avisa al dueño`;
    - los 7 tests existentes, sin cambios y en PASS.
- [ ] **Paso 2:** correr los tests y verificar que fallan.

  Ejecutar: `npx -y -p node@22 node node_modules/vitest/vitest.mjs run app/api/admin/projects app/api/transfers app/api/leads`

  Resultado esperado: FAIL en los nuevos.
- [ ] **Paso 3:** implementar. En `api/leads`, `createAdminClient()` va dentro de `try`, y hay un `try/catch` por destinatario.
- [ ] **Paso 4:** verificar.

  Ejecutar:
  - el mismo vitest;
  - `npx tsc --noEmit -p .`;
  - `npx eslint app/api/admin/projects app/api/transfers app/api/leads`.

  Resultado esperado: todo en PASS.
- [ ] **Paso 5: Commit**
```bash
git add app/api/admin/projects app/api/transfers app/api/leads
git commit -m "feat: transferencia de propiedad y leads nuevos al equipo comercial"
```

---

### Task 6: El panel del proyecto respeta el rol

**Archivos:**
- Modificar:
  - `app/admin/(authenticated)/(project)/layout.tsx` y `ProjectAdminShell.tsx`;
  - `app/admin/(authenticated)/(project)/page.tsx` y `leads/page.tsx`;
  - `app/admin/(authenticated)/(project)/proyecto/equipo/page.tsx` y `settings/page.tsx` (visibilidad, zona de peligro y textos; las tarjetas nuevas van en la tarea 7);
  - `components/admin/section-editors/TeamEditor.tsx`;
  - `components/admin/SitePublishStatus.tsx` y `components/admin/PublishCallout.tsx`;
  - `components/project-landing/DraftPreviewBar.tsx` (solo el texto);
  - `hooks/useNewLeadsCount.ts` y `hooks/useNewLeadsCount.test.ts`.

**Interfaces:**
- Consume: `ProjectRoleProvider`, `useProjectRole`, `hasRole`, `ROLE_LABELS` y `access.role` del layout.
- Produce:
  - `ProjectAdminShell` con la prop nueva `role: ProjectRole`;
  - `useNewLeadsCount(enabled?: boolean)` (default `true`), que devuelve `{ count, markSeen }`; con `false`, `count` es 0 y no hay fetch.

- [ ] **Paso 1: Tests del hook.** En `hooks/useNewLeadsCount.test.ts` sumar:
  - `enabled=false: no hace fetch ni polling y count es 0`;
  - `pasar de false a true arranca el polling`.

  Los 6 tests existentes siguen pasando sin cambios, gracias al default `true`.
- [ ] **Paso 2:** correr y verificar que fallan.

  Ejecutar: `npx -y -p node@22 node node_modules/vitest/vitest.mjs run hooks/useNewLeadsCount.test.ts`

  Resultado esperado: FAIL en los nuevos.
- [ ] **Paso 3:** implementar según el mapa y el análisis 4.
  - `canSeeLeads` controla en el shell: el ítem Leads, el título "Operación" (`(canSeeLeads || (hasUnitStep && !typeConfig.singleBuilding))`) y el hook.
  - `isOwner` controla la Zona de peligro.
  - `canPublish = hasRole(role, 'administrador')` (decisión abierta 1) controla los botones de publicar y el input de dirección pública. Es un nombre local; no confundirlo con `publishState.canPublish`, que es completitud.
- [ ] **Paso 4:** verificar.

  Ejecutar:
  - `npx -y -p node@22 node node_modules/vitest/vitest.mjs run`
  - `npx tsc --noEmit -p .`
  - `npx eslint "app/admin/(authenticated)/(project)" components/admin hooks components/project-landing/DraftPreviewBar.tsx`
  - `npx next build`

  Resultado esperado: sin fallas nuevas respecto de la línea de base, y build OK.
- [ ] **Paso 5: Verificación manual** (requiere el SQL aplicado en la base de `next dev`). Con dos cuentas, A dueña y B Editor aceptada (se puede insertar a mano en el SQL Editor si la tarea 7 no está):
  - B entra al proyecto **en borrador**. El panel abre, Esencial guarda y "Ver sitio" muestra la vista previa (puntos 1 y 2 del foco de revisión).
  - B no ve Leads en el menú. El dashboard carga sin la tarjeta de leads y sin errores en consola. `/admin/leads` por URL vuelve a `/admin`.
  - B ve los créditos en el capítulo Equipo en solo lectura y sin "Borrar" en los comentarios.
  - B no ve la Zona de peligro y no puede publicar.
  - Con dos pestañas, una de A en el proyecto X y otra de A en Y donde A es Editor: cada pestaña muestra el menú de su propio rol (punto 3 del foco de revisión).
  - A saca a B (a mano en SQL). B recarga y termina en `/admin/proyectos`, sin errores.
- [ ] **Paso 6: Commit**
```bash
git add "app/admin/(authenticated)/(project)" components/admin components/project-landing/DraftPreviewBar.tsx hooks/useNewLeadsCount.ts hooks/useNewLeadsCount.test.ts
git commit -m "feat: el panel del proyecto oculta lo que el rol no puede usar"
```

---

### Task 7: Acceso al proyecto, transferencia, invitaciones, portfolio y notificaciones; cierre

**Archivos:**
- Crear (partiendo de la rama vieja y adaptando el estilo): `components/admin/TeamMembersCard.tsx`, `components/admin/TransferOwnershipCard.tsx` y `components/admin/PendingInvitations.tsx`.
- Modificar:
  - `app/admin/(authenticated)/(project)/settings/page.tsx` (montar las tarjetas);
  - `app/admin/(authenticated)/proyectos/page.tsx`;
  - `app/admin/(authenticated)/portfolio/page.tsx`;
  - `components/app/NotificationsPanel.tsx`.

**Interfaces:**
- `TeamMembersCard()` no recibe props. Lee `useProjectRole()` y `useActiveProjectId()`, y llama a `GET/POST withActiveProject('/api/admin/members', id)` y a `PATCH/DELETE /api/admin/members/[id]`.
  - Comportamiento de la rama vieja: dueño arriba sin acciones; selector de rol y "Quitar" solo si `canManageMember(myRole, m.role)`; roles invitables = `MEMBER_ROLES.filter(r => canManageMember(myRole, r))`.
  - La línea de ayuda por rol es la del plan original.
  - Se invita con `PersonSearchSelect`.
- `TransferOwnershipCard({ projectId }: { projectId: string })`: los dos estados del plan original, con el mismo texto de confirmación (vía `useConfirm`).
- `PendingInvitations({ onChange }: { onChange: () => void })`: no muestra nada si no hay pendientes.
- `NotificationsPanel`: `notificationHref` devuelve `/admin/proyectos` para los cuatro tipos nuevos. `TEXT_BY_TYPE` lleva los cuatro textos del plan original.

- [ ] **Paso 1:** implementar las tres tarjetas y montarlas: Configuración en el orden del análisis 4, y Mis proyectos según el mapa.
  - En Mis proyectos, `ProjectRow` suma `role: ProjectRole`. La insignia es `ROLE_LABELS[role]` y aparece si el rol no es `'dueño'`. "Duplicar" y "Eliminar proyecto" solo para el dueño.
  - En Portfolio, filtrar `role === 'dueño'`.
- [ ] **Paso 2:** verificar.

  Ejecutar:
  - `npx -y -p node@22 node node_modules/vitest/vitest.mjs run`
  - `npx tsc --noEmit -p .`
  - `npx eslint components/admin components/app "app/admin/(authenticated)"`
  - `npx next build`

  Resultado esperado: sin fallas nuevas respecto de la línea de base, y build OK.
- [ ] **Paso 3: Verificación manual de punta a punta** (con los handles reales del usuario):
  1. A invita a B como Editor. B ve la notificación, entra a "Mis proyectos" y ve la invitación con el nombre del proyecto **aunque el proyecto sea borrador**. Acepta, ve el proyecto con la insignia "Editor" y carga contenido.
  2. B no ve el proyecto en su `/admin/portfolio`.
  3. A invita a C como Administrador. C entra a Configuración → "Acceso al proyecto": solo ofrece Editor y Gestor, y no puede cambiar ni quitar a otros administradores.
  4. A transfiere a B y B acepta. Después:
     - B lo ve como dueño;
     - A lo ve con la insignia "Administrador";
     - el proyecto quedó fuera del portfolio;
     - B puede volver a mostrarlo.
  5. B rechaza una invitación de otro proyecto y A la reenvía sin error.
  6. Un lead nuevo le llega por email a la dueña y a los gestores y administradores, no a los editores.
- [ ] **Paso 4: Commit**
```bash
git add components/admin components/app "app/admin/(authenticated)"
git commit -m "feat: acceso al proyecto, transferencia e invitaciones pendientes en el panel"
```
- [ ] **Paso 5: Cierre.** Correr la suite completa, tsc, lint de todo lo tocado y build. Antes de mergear, recordarle al usuario el orden:
  1. aplicar `schema.sql` en producción;
  2. correr `supabase/tests/roles-verificacion.sql` y `node supabase/verificar-rls.mjs`;
  3. recién ahí mergear a `main`, que despliega la app.

---

## Foco de revisión

1. **Miembros y proyectos en borrador.** Sin `members read projects`, un miembro no entra al panel de un borrador, no puede guardar (el `update … returning` afecta 0 filas), el borrador desaparece en silencio de "Mis proyectos" y la guarda de administradores se puede saltear. Se cubre en la tarea 1 (casos 2, 3 y 4 de la verificación) y en la tarea 6 (verificación manual con el proyecto en borrador).
2. **Políticas que quedan atrás en tablas nuevas.** Las de BIM (`bim_models`, `bim_model_floors`, `bim_model_units`) son las que la rama vieja no conocía. Antes de cerrar la tarea 1, `grep -n "owner_id = auth.uid()" supabase/schema.sql`: las únicas que pueden quedar son `public read …` (lectura del dueño, que se suma al `for all` por rango), `fonts`/`saved_themes` y las redefinidas por el bloque final.
3. **Proyecto activo por pestaña contra rol.** El rol tiene que salir del mismo `projectId` que fija `ActiveProjectIdProvider`. Ninguna guarda nueva lee la cookie, y `TeamMembersCard` usa `withActiveProject`. Si no, en dos pestañas se mezclan rol y proyecto.
4. **Mocks de los tests de rutas.** `minRole` va en el objeto de opciones. Las rutas que leen `access.role` (`project` PATCH, `members`, `transfer`) necesitan `role` en el mock. Los mocks nuevos van con alias `@/…`, no rutas relativas. La cola de `projects/route.test.ts` cambia por la consulta de membresías.
5. **Orden de despliegue: el SQL antes que la app.** La app nueva sin el SQL deja a **todos**, dueños incluidos, sin acceso: la RPC `project_role_rank` no existe y `requireProjectAccess` falla cerrado. El SQL nuevo con la app vieja funciona, porque para el dueño es un superconjunto. Como el merge a `main` despliega, el SQL se aplica antes del merge.

---

## Decisiones abiertas

La spec no las cubre. **Confirmadas por el usuario el 2026-11-16: las tres van con el valor propuesto** (publicar y slug: Administrador o más; duplicar: solo el dueño; BIM: Editor o más).

1. **Quién publica o despublica el sitio y cambia su dirección (`published`, `slug`)**, que no existían cuando se escribió la spec. Propuesta: **Administrador o más**, en la app (403) y en la base (`guard_project_owner_fields`). Exponer precios en público o romper links compartidos no es "cargar contenido". Alternativas: Editor (tratarlo como contenido) o solo el dueño (como `show_in_portfolio`).
2. **Quién duplica el proyecto** (ruta nueva; la copia queda a nombre de quien duplica). Propuesta: **solo el dueño**. Si no, cualquier Editor se lleva una copia completa del proyecto ajeno a su cuenta.
3. **Qué rol necesita BIM** (subir modelos, editar piezas, `is_public`). Propuesta: **Editor**, porque la spec define "contenido" como todo lo que se carga en el proyecto. Las piezas siguen el proyecto si se transfiere, igual que el resto del contenido.
