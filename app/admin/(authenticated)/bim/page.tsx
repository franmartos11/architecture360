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
