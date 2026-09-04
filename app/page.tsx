import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LandingNav from '@/components/landing/LandingNav';
import LandingHero from '@/components/landing/LandingHero';
import LandingAudienceTabs from '@/components/landing/LandingAudienceTabs';
import LandingCapabilities from '@/components/landing/LandingCapabilities';
import LandingProductInside from '@/components/landing/LandingProductInside';
import LandingHowItWorks from '@/components/landing/LandingHowItWorks';
import LandingFeaturedProjects from '@/components/landing/LandingFeaturedProjects';
import LandingPortfolio from '@/components/landing/LandingPortfolio';
import LandingFeaturePills from '@/components/landing/LandingFeaturePills';
import LandingFaq from '@/components/landing/LandingFaq';
import LandingFinalCta from '@/components/landing/LandingFinalCta';
import LandingFooter from '@/components/landing/LandingFooter';

// Landing del producto en sí (no la de un proyecto inmobiliario individual,
// esas viven en /proyecto/[slug]) — explica de qué se trata Atrium y
// lleva a registrarse o ingresar.
//
// Si ya hay sesión, no tiene sentido mostrarle la landing a alguien que ya
// es cuenta — lo mandamos directo al feed.
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/feed');

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      <LandingNav />
      <LandingHero />
      <LandingAudienceTabs />
      <LandingCapabilities />
      <LandingProductInside />
      <LandingHowItWorks />
      <LandingFeaturedProjects />
      <LandingPortfolio />
      <LandingFeaturePills />
      <LandingFaq />
      <LandingFinalCta />
      <LandingFooter />
    </div>
  );
}
