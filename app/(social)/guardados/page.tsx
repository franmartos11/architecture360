import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRequestUser } from '@/lib/supabase/auth';
import PostFeed from '@/components/social/PostFeed';

const title = 'Guardados — Atrium';
const description = 'Los posts que guardaste para ver más tarde.';

export const metadata: Metadata = {
  title,
  description,
};

export default async function GuardadosPage() {
  const user = await getRequestUser();
  if (!user) redirect('/admin/login');

  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('handle, avatar_image').eq('id', user.id).maybeSingle();
  if (!profile) redirect('/admin/portfolio');

  return (
    <div>
      <section className="py-8 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto mb-2">
          <h1 className="text-xl font-semibold text-trevo-dark">Guardados</h1>
          <p className="text-sm text-trevo-dark/50 mt-0.5">Los posts que guardaste para ver más tarde.</p>
        </div>
        <PostFeed
          loggedIn
          currentProfileHandle={profile.handle}
          currentAvatarImage={profile.avatar_image}
          scope="saved"
        />
      </section>
    </div>
  );
}
