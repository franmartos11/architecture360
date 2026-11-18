-- ═══════════════════════════════════════════════════════════════════
-- Verificación de roles de proyecto y transferencia de propiedad
--
-- Cómo correrlo: después de aplicar supabase/schema.sql entero (con el
-- bloque "Roles de proyecto" del final), reemplazar abajo 'HANDLE_DUENO'
-- y 'HANDLE_OTRO' por los handles de dos cuentas reales (dos profiles
-- distintos), pegar este archivo entero en Supabase Dashboard → SQL
-- Editor → Run.
--
-- Opcional: reemplazar también 'HANDLE_TERCERO' por el handle de una
-- tercera cuenta. Con ella se comprueba que un administrador no puede
-- sacar ni cambiar a otro administrador (ni al dueño anterior después de
-- una transferencia). Si se deja el placeholder, esas comprobaciones se
-- saltean con un AVISO y el resto corre igual.
--
-- Corre todo dentro de begin; … rollback;, así que no deja rastros: el
-- proyecto, el lead, las membresías, la pieza BIM, la transferencia y el
-- destacado de prueba desaparecen al terminar.
--
-- El proyecto de prueba nace en borrador (published = false), que es lo
-- delicado: un miembro tiene que poder verlo y editarlo, alguien de
-- afuera (invitado pendiente o anon) no.
--
-- Resultado esperado: el aviso "OK: todas las verificaciones pasaron" y
-- ningún error "FALLO: …". Si una verificación no se cumple, el script
-- se corta ahí con el FALLO correspondiente.
--
-- Para impersonar se usa el rol "authenticated" (o "anon") con
-- request.jwt.claims, que es lo que lee auth.uid(); "reset role" vuelve a
-- postgres. Los bloqueos esperados se aceptan si la operación lanza
-- insufficient_privilege (42501: RLS o los triggers de guarda) o si no
-- afecta ninguna fila (RLS filtra en silencio en update/delete).
-- ═══════════════════════════════════════════════════════════════════

begin;

select set_config('t.owner', (select id::text from profiles where handle = 'HANDLE_DUENO'), true);
select set_config('t.other', (select id::text from profiles where handle = 'HANDLE_OTRO'), true);
select set_config('t.third', (select id::text from profiles where handle = 'HANDLE_TERCERO'), true);

-- ─── 1. Como postgres: proyecto en borrador, lead y destacado ───────
do $$
declare
  v_project uuid;
  v_slug text := 'verificacion-roles-' || substr(gen_random_uuid()::text, 1, 8);
begin
  if nullif(current_setting('t.owner', true), '') is null then
    raise exception 'FALLO: no existe un profile con handle HANDLE_DUENO (reemplazar el placeholder)';
  end if;
  if nullif(current_setting('t.other', true), '') is null then
    raise exception 'FALLO: no existe un profile con handle HANDLE_OTRO (reemplazar el placeholder)';
  end if;
  if current_setting('t.owner') = current_setting('t.other') then
    raise exception 'FALLO: HANDLE_DUENO y HANDLE_OTRO tienen que ser dos cuentas distintas';
  end if;
  if nullif(current_setting('t.third', true), '') is null then
    raise notice 'AVISO: sin HANDLE_TERCERO, se saltean las comprobaciones de administrador contra administrador';
  elsif current_setting('t.third') in (current_setting('t.owner'), current_setting('t.other')) then
    raise exception 'FALLO: HANDLE_TERCERO tiene que ser una cuenta distinta de HANDLE_DUENO y HANDLE_OTRO';
  end if;

  -- published = false: el caso delicado (borrador). show_in_portfolio =
  -- true para poder comprobar que la transferencia lo apaga.
  insert into projects (slug, name, owner_id, show_in_portfolio, published)
  values (v_slug, 'Verificación de roles', current_setting('t.owner')::uuid, true, false)
  returning id into v_project;

  perform set_config('t.project', v_project::text, true);
  perform set_config('t.slug', v_slug, true);

  if (select published from projects where id = v_project) is distinct from false then
    raise exception 'FALLO: el proyecto de prueba debería nacer en borrador';
  end if;

  insert into leads (project_id, name, email, message)
  values (v_project, 'Lead de prueba', 'lead@example.com', 'Verificación de roles');

  -- Destacado del dueño en su portfolio: la transferencia lo tiene que
  -- limpiar (el proyecto deja de ser suyo).
  update profiles set featured_project_id = v_project where id = current_setting('t.owner')::uuid;
end $$;

-- ─── 2. Como owner: rango 4, invitar a other, nace pending ──────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_rank int;
  v_status text;
  v_invited_by uuid;
  v_leads int;
  v_self_inserted boolean := false;
begin
  v_rank := project_role_rank(current_setting('t.project')::uuid);
  if v_rank is distinct from 4 then
    raise exception 'FALLO: el dueño debería tener rango 4 y tiene %', v_rank;
  end if;

  -- El dueño no puede agregarse a sí mismo como miembro.
  begin
    insert into project_members (project_id, user_id, role, invited_by)
    values (
      current_setting('t.project')::uuid,
      current_setting('t.owner')::uuid,
      'administrador',
      current_setting('t.owner')::uuid
    );
    v_self_inserted := true;
  exception
    when insufficient_privilege then null;
    when others then
      raise exception 'FALLO: que el dueño se agregue como miembro falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_self_inserted then
    raise exception 'FALLO: el dueño pudo agregarse a sí mismo como miembro';
  end if;

  -- Pide "accepted" y un invited_by falso a propósito: el trigger tiene
  -- que forzar "pending" e invited_by = quien invita.
  insert into project_members (project_id, user_id, role, status, invited_by)
  values (
    current_setting('t.project')::uuid,
    current_setting('t.other')::uuid,
    'editor',
    'accepted',
    current_setting('t.other')::uuid
  );

  select status, invited_by into v_status, v_invited_by
  from project_members
  where project_id = current_setting('t.project')::uuid
    and user_id = current_setting('t.other')::uuid;
  if v_status is distinct from 'pending' then
    raise exception 'FALLO: la membresía nueva debería nacer pending y quedó %', v_status;
  end if;
  if v_invited_by is distinct from current_setting('t.owner')::uuid then
    raise exception 'FALLO: invited_by debería ser el dueño y quedó %', v_invited_by;
  end if;

  -- Control del paso 4: el dueño sí ve el lead.
  select count(*) into v_leads from leads where project_id = current_setting('t.project')::uuid;
  if v_leads <> 1 then
    raise exception 'FALLO: el dueño debería ver 1 lead y ve %', v_leads;
  end if;
end $$;

-- ─── 3. Como other (pendiente): rango 0, no ve el borrador ni escribe
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.other'), 'role', 'authenticated')::text, true);

do $$
declare
  v_rank int;
  v_count int;
  v_inserted boolean := false;
begin
  v_rank := project_role_rank(current_setting('t.project')::uuid);
  if v_rank is distinct from 0 then
    raise exception 'FALLO: un miembro pendiente debería tener rango 0 y tiene %', v_rank;
  end if;

  select count(*) into v_count from projects where id = current_setting('t.project')::uuid;
  if v_count <> 0 then
    raise exception 'FALLO: un invitado pendiente no debería ver el borrador y ve % fila(s)', v_count;
  end if;

  begin
    insert into buildings (project_id, slug, name)
    values (current_setting('t.project')::uuid, 'torre-pendiente', 'Torre pendiente');
    v_inserted := true;
  exception
    when insufficient_privilege then null;
    when others then
      raise exception 'FALLO: el insert en buildings de un pendiente falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_inserted then
    raise exception 'FALLO: un miembro pendiente pudo insertar en buildings';
  end if;

  begin
    insert into bim_models (project_id, title)
    values (current_setting('t.project')::uuid, 'Pieza de un pendiente');
    v_inserted := true;
  exception
    when insufficient_privilege then null;
    when others then
      raise exception 'FALLO: el insert en bim_models de un pendiente falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_inserted then
    raise exception 'FALLO: un miembro pendiente pudo insertar en bim_models';
  end if;
end $$;

-- ─── 4. Como other: aceptar → rango 1, ve y edita el borrador ───────
do $$
declare
  v_rows int;
  v_rank int;
  v_count int;
  v_leads int;
  v_id uuid;
  v_building uuid;
  v_floor uuid;
  v_bim uuid;
begin
  update project_members
  set status = 'accepted', updated_at = now()
  where project_id = current_setting('t.project')::uuid
    and user_id = current_setting('t.other')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FALLO: aceptar la invitación debería afectar 1 fila y afectó %', v_rows;
  end if;

  v_rank := project_role_rank(current_setting('t.project')::uuid);
  if v_rank is distinct from 1 then
    raise exception 'FALLO: un editor aceptado debería tener rango 1 y tiene %', v_rank;
  end if;

  -- Ve el borrador ("members read projects").
  select count(*) into v_count from projects where id = current_setting('t.project')::uuid;
  if v_count <> 1 then
    raise exception 'FALLO: un editor aceptado debería ver el borrador y ve % fila(s)', v_count;
  end if;

  -- Lo edita con returning, como PATCH /api/admin/project (update …
  -- .select().single()): con returning, Postgres exige además las
  -- políticas de select.
  begin
    update projects set name = name || ' x'
    where id = current_setting('t.project')::uuid
    returning id into v_id;
  exception when others then
    raise exception 'FALLO: un editor no pudo editar el nombre del borrador: % (%)', sqlerrm, sqlstate;
  end;
  if v_id is distinct from current_setting('t.project')::uuid then
    raise exception 'FALLO: el update con returning del editor no devolvió la fila del borrador';
  end if;

  begin
    insert into buildings (project_id, slug, name)
    values (current_setting('t.project')::uuid, 'torre-editor', 'Torre del editor')
    returning id into v_building;
  exception when others then
    raise exception 'FALLO: un editor aceptado no pudo insertar en buildings: % (%)', sqlerrm, sqlstate;
  end;

  select count(*) into v_count from buildings where project_id = current_setting('t.project')::uuid;
  if v_count <> 1 then
    raise exception 'FALLO: un editor debería leer 1 edificio del borrador y lee %', v_count;
  end if;

  begin
    insert into floors (building_id, number, label)
    values (v_building, 1, 'P1')
    returning id into v_floor;
  exception when others then
    raise exception 'FALLO: un editor aceptado no pudo insertar en floors: % (%)', sqlerrm, sqlstate;
  end;

  -- BIM es contenido: editor en adelante (decisión 3).
  begin
    insert into bim_models (project_id, title)
    values (current_setting('t.project')::uuid, 'Pieza del editor')
    returning id into v_bim;
  exception when others then
    raise exception 'FALLO: un editor aceptado no pudo insertar en bim_models: % (%)', sqlerrm, sqlstate;
  end;

  begin
    insert into bim_model_floors (bim_model_id, floor_id) values (v_bim, v_floor);
  exception when others then
    raise exception 'FALLO: un editor aceptado no pudo insertar en bim_model_floors: % (%)', sqlerrm, sqlstate;
  end;

  select count(*) into v_count from bim_models where project_id = current_setting('t.project')::uuid;
  if v_count <> 1 then
    raise exception 'FALLO: un editor debería leer 1 pieza BIM sin publicar y lee %', v_count;
  end if;

  select count(*) into v_leads from leads where project_id = current_setting('t.project')::uuid;
  if v_leads <> 0 then
    raise exception 'FALLO: un editor no debería ver leads y ve %', v_leads;
  end if;
end $$;

-- ─── 5. Como other (editor): no toca dueño, portfolio, publicación,
--        dirección ni rol, y no borra ──────────────────────────────────
do $$
declare
  v_rows int;
  v_owner uuid;
  v_portfolio boolean;
  v_published boolean;
  v_slug text;
  v_role text;
  v_blocked boolean;
begin
  -- 5a. Apropiarse del proyecto.
  v_rows := -1;
  begin
    update projects set owner_id = current_setting('t.other')::uuid
    where id = current_setting('t.project')::uuid;
    get diagnostics v_rows = row_count;
  exception
    when insufficient_privilege then v_rows := 0;
    when others then
      raise exception 'FALLO: cambiar owner_id falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 0 then
    raise exception 'FALLO: un editor pudo cambiar owner_id';
  end if;

  -- 5b. Mostrar u ocultar en el portfolio.
  v_rows := -1;
  begin
    update projects set show_in_portfolio = not show_in_portfolio
    where id = current_setting('t.project')::uuid;
    get diagnostics v_rows = row_count;
  exception
    when insufficient_privilege then v_rows := 0;
    when others then
      raise exception 'FALLO: cambiar show_in_portfolio falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 0 then
    raise exception 'FALLO: un editor pudo cambiar show_in_portfolio';
  end if;

  -- 5c. Publicar (decisión 1: administrador o más). Tiene que ser 42501
  -- del trigger, no un update que RLS filtra: el editor sí puede editar
  -- el proyecto (paso 4), así que 0 filas también sería un error.
  v_blocked := false;
  v_rows := -1;
  begin
    update projects set published = true
    where id = current_setting('t.project')::uuid;
    get diagnostics v_rows = row_count;
  exception
    when insufficient_privilege then v_blocked := true;
    when others then
      raise exception 'FALLO: publicar falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if not v_blocked then
    raise exception 'FALLO: publicar como editor debería fallar con 42501 y afectó % fila(s)', v_rows;
  end if;

  -- 5d. Cambiar la dirección (slug), misma regla.
  v_blocked := false;
  v_rows := -1;
  begin
    update projects set slug = slug || '-editor'
    where id = current_setting('t.project')::uuid;
    get diagnostics v_rows = row_count;
  exception
    when insufficient_privilege then v_blocked := true;
    when others then
      raise exception 'FALLO: cambiar el slug falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if not v_blocked then
    raise exception 'FALLO: cambiar el slug como editor debería fallar con 42501 y afectó % fila(s)', v_rows;
  end if;

  -- 5e. Subirse de rol.
  v_rows := -1;
  begin
    update project_members set role = 'administrador'
    where user_id = current_setting('t.other')::uuid
      and project_id = current_setting('t.project')::uuid;
    get diagnostics v_rows = row_count;
  exception
    when insufficient_privilege then v_rows := 0;
    when others then
      raise exception 'FALLO: subirse de rol falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 0 then
    raise exception 'FALLO: un editor pudo subirse a administrador';
  end if;

  -- 5f. Borrar el proyecto.
  v_rows := -1;
  begin
    delete from projects where id = current_setting('t.project')::uuid;
    get diagnostics v_rows = row_count;
  exception
    when insufficient_privilege then v_rows := 0;
    when others then
      raise exception 'FALLO: borrar el proyecto falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 0 then
    raise exception 'FALLO: un editor pudo borrar el proyecto';
  end if;

  -- Nada de lo anterior dejó rastro.
  select owner_id, show_in_portfolio, published, slug
  into v_owner, v_portfolio, v_published, v_slug
  from projects where id = current_setting('t.project')::uuid;
  if v_owner is distinct from current_setting('t.owner')::uuid or v_portfolio is distinct from true then
    raise exception 'FALLO: el proyecto cambió de dueño o de portfolio (owner %, portfolio %)', v_owner, v_portfolio;
  end if;
  if v_published is distinct from false or v_slug is distinct from current_setting('t.slug') then
    raise exception 'FALLO: el proyecto cambió de publicación o de slug (published %, slug %)', v_published, v_slug;
  end if;

  select role into v_role from project_members
  where project_id = current_setting('t.project')::uuid and user_id = current_setting('t.other')::uuid;
  if v_role is distinct from 'editor' then
    raise exception 'FALLO: el rol del editor cambió a %', v_role;
  end if;
end $$;

-- ─── 6. Administradores en el borrador ──────────────────────────────
-- owner nombra administrador a other. Con una tercera cuenta, además la
-- nombra administradora y comprueba que other (administrador, no dueño)
-- no puede sacarla ni cambiarle el rol. La guarda de borrado mira
-- projects con un exists: en un borrador, si corriera con la RLS de
-- quien borra, podría dar falso y dejarlo pasar.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_rows int;
begin
  begin
    update project_members set role = 'administrador', updated_at = now()
    where project_id = current_setting('t.project')::uuid
      and user_id = current_setting('t.other')::uuid;
    get diagnostics v_rows = row_count;
  exception when others then
    raise exception 'FALLO: el dueño no pudo nombrar administrador a other: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 1 then
    raise exception 'FALLO: nombrar administrador a other debería afectar 1 fila y afectó %', v_rows;
  end if;

  if nullif(current_setting('t.third', true), '') is not null then
    begin
      insert into project_members (project_id, user_id, role, invited_by)
      values (
        current_setting('t.project')::uuid,
        current_setting('t.third')::uuid,
        'administrador',
        current_setting('t.owner')::uuid
      );
    exception when others then
      raise exception 'FALLO: el dueño no pudo invitar a la tercera cuenta como administradora: % (%)', sqlerrm, sqlstate;
    end;

    -- La tercera cuenta acepta su propia invitación.
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.third'), 'role', 'authenticated')::text, true);
    update project_members set status = 'accepted', updated_at = now()
    where project_id = current_setting('t.project')::uuid
      and user_id = current_setting('t.third')::uuid;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'FALLO: la tercera cuenta no pudo aceptar su invitación (afectó % filas)', v_rows;
    end if;
    if project_role_rank(current_setting('t.project')::uuid) is distinct from 3 then
      raise exception 'FALLO: la tercera cuenta debería tener rango 3 después de aceptar';
    end if;
  end if;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.other'), 'role', 'authenticated')::text, true);

do $$
declare
  v_rank int;
  v_count int;
  v_rows int;
  v_role text;
begin
  v_rank := project_role_rank(current_setting('t.project')::uuid);
  if v_rank is distinct from 3 then
    raise exception 'FALLO: other como administrador debería tener rango 3 y tiene %', v_rank;
  end if;

  select count(*) into v_count from projects where id = current_setting('t.project')::uuid;
  if v_count <> 1 then
    raise exception 'FALLO: un administrador debería ver el borrador y ve % fila(s)', v_count;
  end if;

  -- Un administrador no toca su propia fila (ni bajarse el rol).
  v_rows := -1;
  begin
    update project_members set role = 'gestor'
    where project_id = current_setting('t.project')::uuid
      and user_id = current_setting('t.other')::uuid;
    get diagnostics v_rows = row_count;
  exception
    when insufficient_privilege then v_rows := 0;
    when others then
      raise exception 'FALLO: que un administrador se cambie el rol falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 0 then
    raise exception 'FALLO: un administrador pudo cambiarse su propio rol';
  end if;

  if nullif(current_setting('t.third', true), '') is not null then
    -- Sacar a otro administrador: solo el dueño.
    v_rows := -1;
    begin
      delete from project_members
      where project_id = current_setting('t.project')::uuid
        and user_id = current_setting('t.third')::uuid;
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
      when others then
        raise exception 'FALLO: que un administrador saque a otro falló con un error inesperado: % (%)', sqlerrm, sqlstate;
    end;
    if v_rows <> 0 then
      raise exception 'FALLO: un administrador pudo sacar a otro administrador en un borrador';
    end if;

    -- Cambiarle el rol a otro administrador: solo el dueño.
    v_rows := -1;
    begin
      update project_members set role = 'gestor'
      where project_id = current_setting('t.project')::uuid
        and user_id = current_setting('t.third')::uuid;
      get diagnostics v_rows = row_count;
    exception
      when insufficient_privilege then v_rows := 0;
      when others then
        raise exception 'FALLO: que un administrador cambie a otro falló con un error inesperado: % (%)', sqlerrm, sqlstate;
    end;
    if v_rows <> 0 then
      raise exception 'FALLO: un administrador pudo cambiarle el rol a otro administrador';
    end if;

    select role into v_role from project_members
    where project_id = current_setting('t.project')::uuid and user_id = current_setting('t.third')::uuid;
    if v_role is distinct from 'administrador' then
      raise exception 'FALLO: la tercera cuenta debería seguir como administradora y está como %', v_role;
    end if;
  end if;
end $$;

-- ─── 7. Como owner: transferir a other; una sola pendiente ──────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_transfer uuid;
  v_inserted boolean := false;
begin
  insert into project_ownership_transfers (project_id, from_user, to_user)
  values (
    current_setting('t.project')::uuid,
    current_setting('t.owner')::uuid,
    current_setting('t.other')::uuid
  )
  returning id into v_transfer;

  perform set_config('t.transfer', v_transfer::text, true);

  begin
    insert into project_ownership_transfers (project_id, from_user, to_user, status)
    values (
      current_setting('t.project')::uuid,
      current_setting('t.owner')::uuid,
      current_setting('t.other')::uuid,
      'pending'
    );
    v_inserted := true;
  exception
    when unique_violation then null;
    when others then
      raise exception 'FALLO: la segunda transferencia falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_inserted then
    raise exception 'FALLO: se pudieron crear dos transferencias pendientes para el mismo proyecto';
  end if;
end $$;

-- ─── 8. Como other: no acepta por update; acepta con la RPC ─────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.other'), 'role', 'authenticated')::text, true);

do $$
declare
  v_rows int := -1;
  v_project uuid;
begin
  begin
    update project_ownership_transfers set status = 'accepted'
    where id = current_setting('t.transfer')::uuid;
    get diagnostics v_rows = row_count;
  exception
    when insufficient_privilege then v_rows := 0;
    when others then
      raise exception 'FALLO: aceptar por update falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 0 then
    raise exception 'FALLO: el destinatario pudo aceptar la transferencia con un update directo';
  end if;

  begin
    v_project := accept_ownership_transfer(current_setting('t.transfer')::uuid);
  exception when others then
    raise exception 'FALLO: accept_ownership_transfer falló para el destinatario: % (%)', sqlerrm, sqlstate;
  end;
  if v_project is distinct from current_setting('t.project')::uuid then
    raise exception 'FALLO: accept_ownership_transfer devolvió % en vez del project_id', v_project;
  end if;
end $$;

-- Resultado de la transferencia, mirado como postgres (sin RLS).
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  v_owner uuid;
  v_portfolio boolean;
  v_status text;
  v_featured uuid;
begin
  select owner_id, show_in_portfolio into v_owner, v_portfolio
  from projects where id = current_setting('t.project')::uuid;
  if v_owner is distinct from current_setting('t.other')::uuid then
    raise exception 'FALLO: después de aceptar, owner_id debería ser other y es %', v_owner;
  end if;
  if v_portfolio is distinct from false then
    raise exception 'FALLO: después de aceptar, show_in_portfolio debería ser false y es %', v_portfolio;
  end if;

  if exists (
    select 1 from project_members
    where project_id = current_setting('t.project')::uuid and user_id = current_setting('t.other')::uuid
  ) then
    raise exception 'FALLO: el nuevo dueño sigue teniendo fila en project_members';
  end if;

  if not exists (
    select 1 from project_members
    where project_id = current_setting('t.project')::uuid
      and user_id = current_setting('t.owner')::uuid
      and role = 'administrador'
      and status = 'accepted'
  ) then
    raise exception 'FALLO: el dueño anterior no quedó como administrador accepted';
  end if;

  select status into v_status from project_ownership_transfers where id = current_setting('t.transfer')::uuid;
  if v_status is distinct from 'accepted' then
    raise exception 'FALLO: la transferencia debería quedar accepted y quedó %', v_status;
  end if;

  select featured_project_id into v_featured from profiles where id = current_setting('t.owner')::uuid;
  if v_featured is not distinct from current_setting('t.project')::uuid then
    raise exception 'FALLO: el dueño anterior sigue teniendo el proyecto transferido como destacado';
  end if;

  -- El flag de la RPC quedó apagado: no deja los triggers abiertos.
  if coalesce(current_setting('app.ownership_transfer', true), '') = 'on' then
    raise exception 'FALLO: app.ownership_transfer quedó encendido después de la RPC';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.other'), 'role', 'authenticated')::text, true);

do $$
declare
  v_rank int;
begin
  v_rank := project_role_rank(current_setting('t.project')::uuid);
  if v_rank is distinct from 4 then
    raise exception 'FALLO: el nuevo dueño debería tener rango 4 y tiene %', v_rank;
  end if;
end $$;

-- ─── 9. Como owner (ahora administrador): rango 3, no acepta ajenas,
--        sí publica y cambia el slug ─────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_rank int;
  v_accepted boolean := false;
  v_owner uuid;
  v_rows int;
begin
  v_rank := project_role_rank(current_setting('t.project')::uuid);
  if v_rank is distinct from 3 then
    raise exception 'FALLO: el dueño anterior debería tener rango 3 y tiene %', v_rank;
  end if;

  -- t.transfer es para other, no para esta cuenta.
  begin
    perform accept_ownership_transfer(current_setting('t.transfer')::uuid);
    v_accepted := true;
  exception
    when insufficient_privilege then null;
    when others then
      raise exception 'FALLO: aceptar una transferencia ajena falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_accepted then
    raise exception 'FALLO: el dueño anterior pudo aceptar una transferencia que no es suya';
  end if;

  select owner_id into v_owner from projects where id = current_setting('t.project')::uuid;
  if v_owner is distinct from current_setting('t.other')::uuid then
    raise exception 'FALLO: el proyecto cambió de dueño después de un intento ajeno (owner %)', v_owner;
  end if;

  -- Decisión 1: un administrador (rango 3) sí publica, despublica y
  -- cambia el slug. Se deja todo como estaba (borrador, slug original)
  -- para el paso 11.
  begin
    update projects set published = true where id = current_setting('t.project')::uuid;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'FALLO: publicar como administrador debería afectar 1 fila y afectó %', v_rows;
    end if;
    update projects set published = false where id = current_setting('t.project')::uuid;
    update projects set slug = slug || '-adm' where id = current_setting('t.project')::uuid;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'FALLO: cambiar el slug como administrador debería afectar 1 fila y afectó %', v_rows;
    end if;
    update projects set slug = current_setting('t.slug') where id = current_setting('t.project')::uuid;
  exception
    when raise_exception then raise;
    when others then
      raise exception 'FALLO: un administrador no pudo publicar o cambiar el slug: % (%)', sqlerrm, sqlstate;
  end;

  if (select published from projects where id = current_setting('t.project')::uuid) is distinct from false then
    raise exception 'FALLO: el proyecto debería haber vuelto a borrador';
  end if;
end $$;

-- 9b. Con una tercera cuenta: otro administrador no puede sacar ni
-- cambiar al dueño anterior (el caso que motiva la guarda de borrado).
do $$
declare
  v_rows int;
begin
  if nullif(current_setting('t.third', true), '') is null then
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.third'), 'role', 'authenticated')::text, true);

  v_rows := -1;
  begin
    delete from project_members
    where project_id = current_setting('t.project')::uuid
      and user_id = current_setting('t.owner')::uuid;
    get diagnostics v_rows = row_count;
  exception
    when insufficient_privilege then v_rows := 0;
    when others then
      raise exception 'FALLO: que un administrador saque al dueño anterior falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 0 then
    raise exception 'FALLO: otro administrador pudo sacar al dueño anterior';
  end if;

  v_rows := -1;
  begin
    update project_members set role = 'editor'
    where project_id = current_setting('t.project')::uuid
      and user_id = current_setting('t.owner')::uuid;
    get diagnostics v_rows = row_count;
  exception
    when insufficient_privilege then v_rows := 0;
    when others then
      raise exception 'FALLO: que un administrador baje al dueño anterior falló con un error inesperado: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 0 then
    raise exception 'FALLO: otro administrador pudo bajarle el rol al dueño anterior';
  end if;
end $$;

-- ─── 10. Como other (nuevo dueño): cambia y saca a un administrador ─
-- Los triggers solo dejan tocar filas de administrador al dueño (rango 4):
-- acá se comprueba que el dueño sí puede, sobre la fila del dueño anterior.
--
-- Verificación manual (no la cubre este script): con un administrador
-- aceptado que NO sea el dueño, invitar a alguien con role =
-- 'administrador' → 42501.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.other'), 'role', 'authenticated')::text, true);

do $$
declare
  v_rows int;
  v_role text;
begin
  begin
    update project_members set role = 'gestor', updated_at = now()
    where project_id = current_setting('t.project')::uuid
      and user_id = current_setting('t.owner')::uuid;
    get diagnostics v_rows = row_count;
  exception when others then
    raise exception 'FALLO: el dueño no pudo bajar de rol a un administrador: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 1 then
    raise exception 'FALLO: bajar de rol al administrador debería afectar 1 fila y afectó %', v_rows;
  end if;

  begin
    update project_members set role = 'administrador', updated_at = now()
    where project_id = current_setting('t.project')::uuid
      and user_id = current_setting('t.owner')::uuid;
    get diagnostics v_rows = row_count;
  exception when others then
    raise exception 'FALLO: el dueño no pudo nombrar administrador a un miembro: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 1 then
    raise exception 'FALLO: subir a administrador debería afectar 1 fila y afectó %', v_rows;
  end if;

  select role into v_role from project_members
  where project_id = current_setting('t.project')::uuid and user_id = current_setting('t.owner')::uuid;
  if v_role is distinct from 'administrador' then
    raise exception 'FALLO: el dueño anterior debería volver a ser administrador y es %', v_role;
  end if;

  begin
    delete from project_members
    where project_id = current_setting('t.project')::uuid
      and user_id = current_setting('t.owner')::uuid;
    get diagnostics v_rows = row_count;
  exception when others then
    raise exception 'FALLO: el dueño no pudo sacar a un administrador: % (%)', sqlerrm, sqlstate;
  end;
  if v_rows <> 1 then
    raise exception 'FALLO: sacar al administrador debería afectar 1 fila y afectó %', v_rows;
  end if;
end $$;

-- ─── 11. Como anon: el borrador sigue sin leerse ─────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

do $$
declare
  v_count int;
begin
  select count(*) into v_count from projects where id = current_setting('t.project')::uuid;
  if v_count <> 0 then
    raise exception 'FALLO: anon lee el borrador (% fila(s))', v_count;
  end if;

  select count(*) into v_count from buildings where project_id = current_setting('t.project')::uuid;
  if v_count <> 0 then
    raise exception 'FALLO: anon lee los edificios del borrador (% fila(s))', v_count;
  end if;

  select count(*) into v_count
  from floors join buildings on buildings.id = floors.building_id
  where buildings.project_id = current_setting('t.project')::uuid;
  if v_count <> 0 then
    raise exception 'FALLO: anon lee los pisos del borrador (% fila(s))', v_count;
  end if;

  select count(*) into v_count from bim_models where project_id = current_setting('t.project')::uuid;
  if v_count <> 0 then
    raise exception 'FALLO: anon lee las piezas BIM del borrador (% fila(s))', v_count;
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

do $$
begin
  raise notice 'OK: todas las verificaciones pasaron';
end $$;

rollback;
