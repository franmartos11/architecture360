import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { Globe, Mail, MapPin, ExternalLink, ArrowUpRight } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { getPortfolioByHandle } from '@/data/profile-repository';
import { PROJECT_STRUCTURES } from '@/lib/project-types';
import { createClient } from '@/lib/supabase/server';
import PostFeed from '@/components/social/PostFeed';
import FollowButton from '@/components/social/FollowButton';
import ProfileQuickEditButton from '@/components/social/ProfileQuickEditButton';
import MessageButton from '@/components/social/MessageButton';
import ProfileCompleteness from '@/components/social/ProfileCompleteness';
import type { ProfileExperience, ProfileEducation, ProfileCertification } from '@/types';

function waLink(w: string) { return `https://wa.me/${w.replace(/[^0-9]/g, '')}`; }

// ─── Íconos de redes ──────────────────────────────────────────────────
function LinkedinMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45Z" />
    </svg>
  );
}
function InstagramMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function WhatsappMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.91-2.2-.24-.57-.49-.5-.67-.5-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.87 1.21 3.07c.15.2 2.08 3.17 5.04 4.45.7.3 1.25.48 1.68.62.7.22 1.34.19 1.84.11.56-.08 1.76-.72 2-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35Z" />
      <path d="M12.02 2C6.5 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.08-1.33A9.95 9.95 0 0 0 12.02 22C17.5 22 22 17.52 22 12S17.5 2 12.02 2Zm0 18.2c-1.65 0-3.19-.46-4.5-1.26l-.32-.19-3.02.79.8-2.94-.21-.3A8.17 8.17 0 0 1 3.8 12c0-4.53 3.7-8.2 8.22-8.2 4.53 0 8.2 3.67 8.2 8.2s-3.67 8.2-8.2 8.2Z" />
    </svg>
  );
}

// ─── Tarjeta de proyecto ────────────────────────────────────────────────
function ProjectCard({ slug, name, masterplanImage, label, sub, featured = false }: {
  slug: string; name: string; masterplanImage: string | null;
  label?: string; sub?: string; featured?: boolean;
}) {
  const aspect = featured ? 'aspect-[16/9]' : 'aspect-[4/3]';
  return (
    <Link
      href={`/proyecto/${slug}`}
      className="group relative block overflow-hidden rounded-2xl bg-stone-100"
    >
      <div className={`relative ${aspect} overflow-hidden`}>
        {masterplanImage ? (
          <Image
            src={masterplanImage} alt={name} fill
            sizes={featured ? '(min-width: 1024px) 66vw, 100vw' : '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'}
            placeholder="blur" blurDataURL={shimmerDataUrl()}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-stone-300 text-4xl bg-stone-100">🏗️</div>
        )}
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {/* "Ver proyecto" pill on hover */}
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5 text-white text-xs font-medium tracking-wide translate-y-3 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          Ver proyecto <ArrowUpRight className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="pt-3.5 pb-1 px-0.5">
        <p className="font-semibold text-stone-900 leading-snug text-[15px]">{name}</p>
        {(label || sub) && (
          <p className="text-xs text-stone-400 font-light mt-0.5">
            {label}{label && sub ? ' · ' : ''}{sub}
          </p>
        )}
      </div>
    </Link>
  );
}

// ─── Sección: Aptitudes ────────────────────────────────────────────────
function SkillsSection({ skills }: { skills: string[] }) {
  if (!skills.length) return null;
  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-stone-400 mb-3">Aptitudes</h3>
      <div className="flex flex-wrap gap-2">
        {skills.map(s => (
          <span key={s} className="px-3 py-1 rounded-full text-[13px] text-stone-600 bg-stone-100 border border-stone-200">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Sección: Experiencia (timeline) ──────────────────────────────────
function ExperienceSection({ items }: { items: ProfileExperience[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-stone-400 mb-4">Experiencia</h3>
      <div className="space-y-5">
        {items.map((exp, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-stone-300 mt-1.5 shrink-0" />
              {i < items.length - 1 && <div className="w-px flex-1 bg-stone-200 mt-1.5" />}
            </div>
            <div className="pb-5 last:pb-0">
              <p className="font-semibold text-stone-900 text-sm leading-snug">{exp.role}</p>
              <p className="text-stone-500 text-sm">{exp.company} · <span className="font-light">{exp.startYear} – {exp.endYear || 'Presente'}</span></p>
              {exp.description && <p className="mt-1.5 text-stone-500 text-[13px] font-light leading-relaxed">{exp.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sección: Educación ───────────────────────────────────────────────
function EducationSection({ items }: { items: ProfileEducation[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-stone-400 mb-4">Educación</h3>
      <div className="space-y-4">
        {items.map((edu, i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center shrink-0 border border-stone-200">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 text-stone-400">
                <path d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-stone-900 text-sm leading-snug">{edu.career || edu.institution}</p>
              {edu.career && <p className="text-stone-500 text-[13px]">{edu.institution}</p>}
              <p className="text-stone-400 text-[13px] font-light">
                {edu.startYear}{edu.startYear ? ' – ' : ''}{edu.endYear || (edu.startYear ? 'En curso' : '')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sección: Certificados ────────────────────────────────────────────
function CertificationsSection({ items }: { items: ProfileCertification[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-stone-400 mb-4">Certificados</h3>
      <div className="space-y-3">
        {items.map((cert, i) => (
          <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl border border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm transition-all">
            {cert.imageUrl ? (
              <a href={cert.imageUrl} target="_blank" rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg overflow-hidden border border-stone-200 shrink-0 hover:opacity-80 transition-opacity">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cert.imageUrl} alt={cert.name} className="w-full h-full object-cover" />
              </a>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0 text-stone-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-stone-800 text-[13px] leading-snug">{cert.name}</p>
                {cert.url && (
                  <a href={cert.url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 text-stone-300 hover:text-stone-600 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <p className="text-stone-400 text-xs mt-0.5">{cert.issuer} · {cert.year}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PageProps { params: Promise<{ handle: string }>; }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const portfolio = await getPortfolioByHandle(handle);
  if (!portfolio) return { title: 'Portfolio no encontrado' };

  const title = `${portfolio.displayName} — Portfolio`;
  const description = portfolio.bio || `Proyectos de ${portfolio.displayName} en 360Proyects.`;
  const ogImage = portfolio.bannerImage || portfolio.avatarImage || undefined;

  return {
    title,
    description,
    openGraph: { title, description, images: ogImage ? [ogImage] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: ogImage ? [ogImage] : undefined },
  };
}

export default async function PortfolioPage({ params }: PageProps) {
  const { handle } = await params;
  const portfolio = await getPortfolioByHandle(handle);
  if (!portfolio) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isOwnProfile = user?.id === portfolio.id;
  const isCompany = portfolio.accountType === 'company';

  // ── Follow stats ──
  const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', portfolio.id),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', portfolio.id),
  ]);
  let isFollowedByMe = false;
  if (user && !isOwnProfile) {
    const { data: row } = await supabase
      .from('follows').select('follower_id')
      .eq('follower_id', user.id).eq('following_id', portfolio.id).maybeSingle();
    isFollowedByMe = !!row;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': isCompany ? 'Organization' : 'Person',
    name: portfolio.displayName,
    url: `${siteUrl}/portfolio/${portfolio.handle}`,
    ...(portfolio.avatarImage ? { image: portfolio.avatarImage } : {}),
    ...(portfolio.bio ? { description: portfolio.bio } : {}),
  };

  const hasProjects = portfolio.projects.length > 0 || portfolio.collaborations.length > 0;
  const hasSidebar = !isCompany && (
    (portfolio.skills?.length ?? 0) > 0 ||
    (portfolio.experiences?.length ?? 0) > 0 ||
    (portfolio.education?.length ?? 0) > 0 ||
    (portfolio.certifications?.length ?? 0) > 0
  );

  // Proyecto destacado: el primero si hay 3 o más
  const featuredProject = portfolio.projects.length >= 3 ? portfolio.projects[0] : null;
  const restProjects = featuredProject ? portfolio.projects.slice(1) : portfolio.projects;

  return (
    <div className="min-h-screen bg-[#F5F4F0] font-sans">
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ══════════════════════════════════════════════════════
          HERO — Banner + Info del perfil
      ══════════════════════════════════════════════════════ */}
      <header className="relative">
        {/* Banner */}
        <div className={`relative w-full overflow-hidden bg-stone-900 ${portfolio.bannerImage ? 'h-56 sm:h-72 md:h-80' : 'h-36 sm:h-48'}`}>
          {portfolio.bannerImage && (
            <Image src={portfolio.bannerImage} alt="Banner" fill priority className="object-cover opacity-80" />
          )}
          {/* Gradiente sutil hacia abajo */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-stone-900/60" />
        </div>

        {/* Info del perfil — superpuesta al fondo del banner */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Avatar — solapa el banner */}
          <div className={`relative -mt-12 sm:-mt-14 shrink-0 border-4 border-[#F5F4F0] bg-stone-200 shadow-lg inline-block ${isCompany ? 'w-24 h-24 sm:w-28 sm:h-28 rounded-2xl' : 'w-24 h-24 sm:w-28 sm:h-28 rounded-full'} overflow-hidden`}>
            {portfolio.avatarImage ? (
              <Image src={portfolio.avatarImage} alt={portfolio.displayName} fill sizes="112px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-400 text-3xl font-light">
                {portfolio.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Texto + contacto — siempre sobre el fondo claro */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mt-4 pb-8">
            <div>
              {isCompany && (
                <span className="inline-block text-[10px] font-semibold tracking-[0.15em] uppercase text-stone-400 mb-1.5">Estudio de arquitectura</span>
              )}
              <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 leading-tight tracking-tight">{portfolio.displayName}</h1>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                {portfolio.location && (
                  <p className="flex items-center gap-1 text-sm text-stone-500 font-light">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />{portfolio.location}
                  </p>
                )}
                <Link href={`/portfolio/${portfolio.handle}/seguidores`} className="text-sm text-stone-500 font-light hover:text-stone-800 transition-colors">
                  <span className="font-semibold text-stone-800">{followerCount ?? 0}</span> seguidores
                </Link>
                <Link href={`/portfolio/${portfolio.handle}/siguiendo`} className="text-sm text-stone-500 font-light hover:text-stone-800 transition-colors">
                  <span className="font-semibold text-stone-800">{followingCount ?? 0}</span> siguiendo
                </Link>
              </div>
              {portfolio.bio && (
                <p className="mt-2 text-stone-500 font-light text-sm sm:text-base leading-relaxed max-w-lg">{portfolio.bio}</p>
              )}
            </div>

            {/* Botones de contacto + Seguir/Editar */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {isOwnProfile && <ProfileQuickEditButton portfolio={portfolio} />}
                {!isOwnProfile && (
                  <>
                    <FollowButton
                      handle={portfolio.handle}
                      initialFollowing={isFollowedByMe}
                      initialCount={followerCount ?? 0}
                      loggedIn={!!user}
                    />
                    <MessageButton handle={portfolio.handle} loggedIn={!!user} />
                  </>
                )}
                <div className="flex items-center gap-1.5">
                  {portfolio.whatsapp && (
                    <a href={waLink(portfolio.whatsapp)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"
                      className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:border-stone-400 bg-white transition-colors">
                      <WhatsappMark />
                    </a>
                  )}
                  {!portfolio.whatsapp && portfolio.contactEmail && (
                    <a href={`mailto:${portfolio.contactEmail}`} aria-label="Email"
                      className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:border-stone-400 bg-white transition-colors">
                      <Mail className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {portfolio.linkedinUrl && (
                    <a href={portfolio.linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"
                      className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:border-stone-400 bg-white transition-colors">
                      <LinkedinMark />
                    </a>
                  )}
                  {portfolio.instagramUrl && (
                    <a href={portfolio.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                      className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:border-stone-400 bg-white transition-colors">
                      <InstagramMark />
                    </a>
                  )}
                  {portfolio.websiteUrl && (
                    <a href={portfolio.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label="Sitio web"
                      className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:border-stone-400 bg-white transition-colors">
                      <Globe className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════
          CUERPO PRINCIPAL — 2 columnas en desktop
      ══════════════════════════════════════════════════════ */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">
        <div className={`flex flex-col ${hasSidebar ? 'lg:flex-row' : ''} gap-12 lg:gap-16`}>

          {/* ── Columna principal (izquierda) ── */}
          <div className="flex-1 min-w-0 space-y-16">

            {isOwnProfile && (
              <ProfileCompleteness
                hasAvatar={!!portfolio.avatarImage}
                hasBio={!!portfolio.bio}
                hasLocation={!!portfolio.location}
                hasProject={hasProjects}
              />
            )}

            {/* ❶ PROYECTOS — primer plano */}
            {hasProjects && (
              <section aria-labelledby="projects-heading">
                <h2 id="projects-heading" className="text-[11px] font-semibold tracking-[0.12em] uppercase text-stone-400 mb-5">
                  Proyectos
                </h2>

                {/* Proyecto destacado (grande) */}
                {featuredProject && (
                  <div className="mb-5">
                    <ProjectCard
                      slug={featuredProject.slug}
                      name={featuredProject.name}
                      masterplanImage={featuredProject.masterplanImage}
                      label={PROJECT_STRUCTURES[featuredProject.projectType]?.label ?? featuredProject.projectType}
                      sub={featuredProject.academicYear ?? undefined}
                      featured
                    />
                  </div>
                )}

                {/* Grilla del resto */}
                {restProjects.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {restProjects.map(p => (
                      <ProjectCard
                        key={p.slug} slug={p.slug} name={p.name}
                        masterplanImage={p.masterplanImage}
                        label={PROJECT_STRUCTURES[p.projectType]?.label ?? p.projectType}
                        sub={p.academicYear ?? undefined}
                      />
                    ))}
                  </div>
                )}

                {/* Colaboraciones */}
                {portfolio.collaborations.length > 0 && (
                  <div className={restProjects.length > 0 || featuredProject ? 'mt-10' : ''}>
                    <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-stone-400 mb-5">Colaboraciones</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {portfolio.collaborations.map(p => (
                        <ProjectCard
                          key={p.slug} slug={p.slug} name={p.name}
                          masterplanImage={p.masterplanImage}
                          sub={p.contribution}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {!hasProjects && (
              <section className="py-20 text-center">
                <p className="text-stone-300 text-4xl mb-4">◻</p>
                <p className="text-stone-400 font-light">Todavía no hay proyectos publicados.</p>
              </section>
            )}

            {/* ── Equipo (solo empresas) ── */}
            {isCompany && portfolio.team && portfolio.team.length > 0 && (
              <section aria-labelledby="team-heading">
                <h2 id="team-heading" className="text-[11px] font-semibold tracking-[0.12em] uppercase text-stone-400 mb-5">Equipo</h2>
                <div className="flex flex-wrap gap-3">
                  {portfolio.team.map(m => (
                    <Link key={m.handle} href={`/portfolio/${m.handle}`}
                      className="group flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-white border border-stone-200 hover:border-stone-400 hover:shadow-sm transition-all">
                      <div className="relative w-7 h-7 rounded-full overflow-hidden bg-stone-100 shrink-0">
                        {m.avatarImage
                          ? <Image src={m.avatarImage} alt={m.displayName} fill sizes="28px" className="object-cover" />
                          : <span className="w-full h-full flex items-center justify-center text-[11px] text-stone-400 font-medium">{m.displayName.charAt(0).toUpperCase()}</span>
                        }
                      </div>
                      <span className="text-sm text-stone-700 group-hover:text-stone-900 transition-colors">{m.displayName}</span>
                      <span className="text-[11px] text-stone-400">{m.projectCount} {m.projectCount === 1 ? 'proy.' : 'proy.'}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* ❷ POSTS */}
            <section aria-labelledby="posts-heading">
              <h2 id="posts-heading" className="text-[11px] font-semibold tracking-[0.12em] uppercase text-stone-400 mb-5">
                Publicaciones
              </h2>
              <PostFeed
                authorHandle={portfolio.handle}
                loggedIn={!!user}
                currentProfileHandle={isOwnProfile ? portfolio.handle : null}
                currentAvatarImage={isOwnProfile ? portfolio.avatarImage : null}
              />
            </section>

            {/* ❸ SECCIONES PROFESIONALES — solo en mobile (en desktop van al sidebar) */}
            {hasSidebar && (
              <div className="lg:hidden space-y-10 border-t border-stone-200 pt-10">
                {portfolio.skills && portfolio.skills.length > 0 && <SkillsSection skills={portfolio.skills} />}
                {!isCompany && portfolio.experiences && portfolio.experiences.length > 0 && <ExperienceSection items={portfolio.experiences} />}
                {!isCompany && portfolio.education && portfolio.education.length > 0 && <EducationSection items={portfolio.education} />}
                {!isCompany && portfolio.certifications && portfolio.certifications.length > 0 && <CertificationsSection items={portfolio.certifications} />}
              </div>
            )}
          </div>

          {/* ── Sidebar (solo desktop) — Aptitudes, Experiencia, Educación, Certificados ── */}
          {hasSidebar && (
            <aside className="hidden lg:block w-72 xl:w-80 shrink-0 space-y-10 pt-0">
              <div className="sticky top-6 space-y-8">
                {portfolio.skills && portfolio.skills.length > 0 && <SkillsSection skills={portfolio.skills} />}
                {!isCompany && portfolio.experiences && portfolio.experiences.length > 0 && (
                  <>
                    <div className="h-px bg-stone-200" />
                    <ExperienceSection items={portfolio.experiences} />
                  </>
                )}
                {!isCompany && portfolio.education && portfolio.education.length > 0 && (
                  <>
                    <div className="h-px bg-stone-200" />
                    <EducationSection items={portfolio.education} />
                  </>
                )}
                {!isCompany && portfolio.certifications && portfolio.certifications.length > 0 && (
                  <>
                    <div className="h-px bg-stone-200" />
                    <CertificationsSection items={portfolio.certifications} />
                  </>
                )}
              </div>
            </aside>
          )}

        </div>
      </main>
    </div>
  );
}
