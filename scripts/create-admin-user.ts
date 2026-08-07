/**
 * Crea (o resetea la contraseña de) un usuario admin en Supabase Auth.
 *
 * Uso: node --env-file=.env.local scripts/create-admin-user.ts <email> [password]
 * Si no se pasa password, se genera uno aleatorio y se imprime por consola.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('✗ Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local.');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Uso: node --env-file=.env.local scripts/create-admin-user.ts <email> [password]');
  process.exit(1);
}

const password = process.argv[3] ?? crypto.randomUUID().slice(0, 16);

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  // ¿Ya existe? (paginado simple, alcanza para la cantidad de usuarios de este panel)
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users.find(u => u.email === email);

  if (found) {
    const { error } = await supabase.auth.admin.updateUserById(found.id, { password });
    if (error) throw error;
    console.log(`✓ Ya existía — contraseña actualizada para ${email}`);
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`✓ Usuario admin creado: ${email}`);
  }

  console.log(`  Contraseña: ${password}`);
  console.log('  (Guardala en un lugar seguro — no queda registrada en ningún lado más que acá)');
}

main().catch(err => {
  console.error('✗ Falló:', err);
  process.exit(1);
});
