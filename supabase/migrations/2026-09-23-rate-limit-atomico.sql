-- Migración: rate limit en una sola consulta y sin ventana de carrera.
--
-- Antes la app hacía dos consultas por pedido protegido (contar y después
-- insertar). Costaba el doble contra la misma base que sirve el contenido, y
-- entre una y otra se colaban pedidos: dos simultáneos leían el mismo conteo
-- por debajo del límite y pasaban los dos.
--
-- Cómo aplicarla: dashboard de Supabase → SQL Editor → pegar y Run.
-- Es idempotente (create or replace) y no toca datos.
--
-- El código anda con y sin esto: si la función no está, lib/rate-limit.ts
-- avisa por consola y sigue con el camino viejo. O sea que el deploy del
-- código y el de esta migración pueden ir en cualquier orden.

-- Contar e insertar en una sola ida y vuelta, y sin ventana de carrera.
--
-- Antes esto eran dos consultas desde la app (un count y después un insert).
-- Además de costar el doble, entre una y otra se colaban pedidos: dos
-- requests simultáneos leían el mismo count por debajo del límite y ambos
-- pasaban. El advisory lock, que se suelta solo al terminar la transacción,
-- serializa a los que comparten clave — dos claves distintas no se estorban.
--
-- security definer: la llama el cliente de service-role igual, pero así la
-- función no depende de qué permisos tenga quien la invoque sobre la tabla.
create or replace function check_rate_limit(
  p_key text,
  p_window_seconds int,
  p_max int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext(p_key));

  select count(*) into v_count
  from api_rate_limit_hits
  where key = p_key
    and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max then
    return false;
  end if;

  insert into api_rate_limit_hits (key) values (p_key);

  -- Limpieza oportunista: sin esto la tabla crece para siempre. No hace
  -- falta que sea exacta, sólo que no se acumule.
  if random() < 0.01 then
    delete from api_rate_limit_hits where created_at < now() - interval '24 hours';
  end if;

  return true;
end;
$$;

revoke all on function check_rate_limit(text, int, int) from public, anon, authenticated;
