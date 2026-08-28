import 'server-only';
import { cache } from 'react';
import { createClient } from './server';

// supabase.auth.getUser() hace un round trip de red a la API de Auth de
// Supabase para validar el token. En un mismo render de SSR se lo llama
// desde varios lugares (el layout de /admin, el layout de proyecto,
// requireProjectAccess) — React.cache() colapsa todas esas llamadas a UNA
// sola por request. Fuera de un render (route handlers) se comporta como
// una llamada normal, sin efecto negativo.
export const getRequestUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
