import { redirect } from 'next/navigation';
import { getRequestUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { getBimModelsByAuthor } from '@/data/bim-repository';
import BimAdminClient from './BimAdminClient';

export const metadata = { title: 'Modelos BIM' };

export default async function BimAdminPage() {
  const user = await getRequestUser();
  if (!user) redirect('/admin/login');

  const supabase = await createClient();

  // bim_models.author_id referencia profiles(id), que es opt-in (ver
  // supabase/schema.sql) — sin un handle todavía no hay a dónde publicar
  // una pieza. Mismo patrón que app/(social)/guardados/page.tsx.
  const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profile) redirect('/admin/portfolio');

  const [models, { data: projectRows }] = await Promise.all([
    getBimModelsByAuthor(user.id),
    supabase.from('projects').select('id, name').eq('owner_id', user.id).order('name'),
  ]);

  return (
    <BimAdminClient
      initialModels={models}
      projects={(projectRows ?? []) as { id: string; name: string }[]}
    />
  );
}
