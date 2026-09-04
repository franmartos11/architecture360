import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { Globe, Mail, MapPin, Building2 } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { getPortfolioByHandle } from '@/data/profile-repository';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/auth';
import ShareProfileButton from '@/components/social/ShareProfileButton';
import FollowButton from '@/components/social/FollowButton';
import ProfileQuickEditButton from '@/components/social/ProfileQuickEditButton';
import MessageButton from '@/components/social/MessageButton';
import ProfileCompleteness from '@/components/social/ProfileCompleteness';
import ProfileTabs from '@/components/social/ProfileTabs';
import { getAvailabilityInfo } from '@/lib/profile-availability';

function waLink(w: string) { return `https://wa.me/${w.replace(/[^0-9]/g, '')}`; }

// ─── Íconos de redes ──────────────────────────────────────────────────
function LinkedinMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45Z" />
    </svg>
  );
}
function InstagramMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3.5 h-3.5">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function WhatsappMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.91-2.2-.24-.57-.49-.5-.67-.5-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.87 1.21 3.07c.15.2 2.08 3.17 5.04 4.45.7.3 1.25.48 1.68.62.7.22 1.34.19 1.84.11.56-.08 1.76-.72 2-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35Z" />
      <path d="M12.02 2C6.5 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.08-1.33A9.95 9.95 0 0 0 12.02 22C17.5 22 22 17.52 22 12S17.5 2 12.02 2Zm0 18.2c-1.65 0-3.19-.46-4.5-1.26l-.32-.19-3.02.79.8-2.94-.21-.3A8.17 8.17 0 0 1 3.8 12c0-4.53 3.7-8.2 8.22-8.2 4.53 0 8.2 3.67 8.2 8.2s-3.67 8.2-8.2 8.2Z" />
    </svg>
  );
}

// ─── Chip de red social — mismo link/lógica que antes, solo con label visible ──
function SocialChip({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      className="h-8 px-3 rounded-lg border border-trevo-dark/[0.11] bg-white/60 flex items-center gap-1.5 text-[11.5px] text-trevo-dark/65 hover:bg-white hover:border-trevo-dark/30 hover:text-trevo-dark transition-colors"
    >
      {icon}{label}
    </a>
  );
}

interface PageProps { params: Promise<{ handle: string }>; }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const portfolio = await getPortfolioByHandle(handle);
  if (!portfolio) return { title: 'Portfolio no encontrado' };

  const title = `${portfolio.displayName} — Portfolio`;
  const description = portfolio.bio || `Proyectos de ${portfolio.displayName} en Atrium.`;
  const ogImage = portfolio.bannerImage || portfolio.avatarImage || undefined;

  return {
    title,
    description,
    openGraph: { title, description, images: ogImage ? [ogImage] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: ogImage ? [ogImage] : undefined },
    // "Aparecer en buscadores" del editor de perfil — default true, así que
    // esto solo se activa cuando alguien lo apagó explícitamente.
    ...(portfolio.isIndexed === false ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function PortfolioPage({ params }: PageProps) {
  const { handle } = await params;
  const portfolio = await getPortfolioByHandle(handle);
  if (!portfolio) notFound();

  const supabase = await createClient();
  const user = await getRequestUser();
  const isOwnProfile = user?.id === portfolio.id;
  const isCompany = portfolio.accountType === 'company';
  // "Portfolio público" del editor de perfil — el dueño siempre puede ver
  // el suyo (para poder previsualizarlo/reactivarlo), cualquier otra
  // persona lo ve como si no existiera.
  if (portfolio.isPublic === false && !isOwnProfile) notFound();
  const availabilityInfo = getAvailabilityInfo(portfolio.availability);

  // "Vistas hoy" del rail del feed — best-effort, nunca debe tumbar el
  // render del perfil si falla (mismo criterio que notify()). No cuenta
  // que el dueño mire su propio perfil. Se espera (no fire-and-forget)
  // porque en un entorno serverless la función puede cortarse apenas se
  // manda la respuesta, perdiendo cualquier promesa que quedara pendiente.
  if (!isOwnProfile) {
    try {
      const { error } = await createAdminClient().from('profile_views').insert({ profile_id: portfolio.id, viewer_id: user?.id ?? null });
      if (error) console.error('[profile_views] no se pudo registrar la vista', error);
    } catch (err) {
      console.error('[profile_views] no se pudo registrar la vista', err);
    }
  }

  // ── Follow stats + cantidad de posts (para los pills y el contador del tab) ──
  const [{ count: followerCount }, { count: followingCount }, { count: postsCount }] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', portfolio.id),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', portfolio.id),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', portfolio.id),
  ]);
  let isFollowedByMe = false;
  if (user && !isOwnProfile) {
    const { data: row } = await supabase
      .from('follows').select('follower_id')
      .eq('follower_id', user.id).eq('following_id', portfolio.id).maybeSingle();
    isFollowedByMe = !!row;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const profileUrl = `${siteUrl}/portfolio/${portfolio.handle}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': isCompany ? 'Organization' : 'Person',
    name: portfolio.displayName,
    url: profileUrl,
    ...(portfolio.avatarImage ? { image: portfolio.avatarImage } : {}),
    ...(portfolio.bio ? { description: portfolio.bio } : {}),
  };

  const experiences = portfolio.experiences ?? [];
  const education = portfolio.education ?? [];
  const certifications = portfolio.certifications ?? [];
  const awards = portfolio.awards ?? [];
  const skills = portfolio.skills ?? [];
  const specialties = portfolio.specialties ?? [];
  const languages = portfolio.languages ?? [];
  // Trayectoria solo tiene sentido para cuentas de persona — una empresa no
  // carga experiencia/educación/certificados/premios propios (ver Profile en types/index.ts).
  const hasTrayectoria = !isCompany && (experiences.length > 0 || education.length > 0 || certifications.length > 0 || awards.length > 0);
  // "Estudio" en la meta del header: no hay un campo propio de "dónde
  // trabaja hoy" en el perfil — se usa el trabajo más reciente cargado en
  // Experiencia (se asume orden más-reciente-primero, igual que se lista
  // en Trayectoria) en vez de inventar un dato que no existe.
  const currentStudio = !isCompany && experiences.length > 0 ? experiences[0].company : null;
  const memberSinceYear = new Date(portfolio.createdAt).getFullYear();

  const stats = [
    { value: portfolio.projects.length, label: 'proyectos', href: `/portfolio/${portfolio.handle}?tab=proyectos` },
    { value: portfolio.collaborations.length, label: 'colaboraciones', href: `/portfolio/${portfolio.handle}?tab=proyectos` },
    { value: followerCount ?? 0, label: 'seguidores', href: `/portfolio/${portfolio.handle}/seguidores` },
    { value: followingCount ?? 0, label: 'siguiendo', href: `/portfolio/${portfolio.handle}/siguiendo` },
  ];

  return (
    <div className="min-h-screen bg-[#f5f4f0] font-sans">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ══════════════════════════════════════════════════════
          PORTADA — patrón diagonal si no hay banner real, o la
          imagen real del perfil si el dueño cargó una.
      ══════════════════════════════════════════════════════ */}
      <div className="relative h-52 sm:h-64 md:h-72 overflow-hidden bg-[#26241f]">
        {portfolio.bannerImage ? (
          <Image src={portfolio.bannerImage} alt="Portada" fill priority className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(115deg,#2b2925_0px,#2b2925_22px,#232120_22px,#232120_44px)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-[#1c1a17]/55" />
        {isOwnProfile && (
          <div className="absolute top-4 right-4 sm:right-6">
            <ProfileQuickEditButton
              portfolio={portfolio}
              trigger={({ onClick }) => (
                <button
                  onClick={onClick}
                  className="h-8 px-3.5 rounded-lg bg-white/90 hover:bg-white flex items-center gap-1.5 text-[11.5px] font-medium text-trevo-dark transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 16l4-1 9-9-3-3-9 9z" /><path d="M14 3l3 3" /></svg>
                  Cambiar portada
                </button>
              )}
            />
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          BLOQUE DE PERFIL — avatar solapado, identidad, stats, aptitudes
      ══════════════════════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-end gap-5 -mt-12 sm:-mt-14 flex-wrap">
          {/* Avatar / logo — solapa la portada */}
          <div className={`relative w-28 h-28 sm:w-32 sm:h-32 border-[5px] border-[#f5f4f0] bg-gradient-to-br from-[#9aa896] to-[#5c7a58] shrink-0 overflow-hidden ${isCompany ? 'rounded-2xl' : 'rounded-full'}`}>
            {portfolio.avatarImage ? (
              <Image src={portfolio.avatarImage} alt={portfolio.displayName} fill sizes="128px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/85 text-4xl font-semibold">
                {portfolio.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-[280px] pb-2 flex items-end justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-trevo-dark/45">@{portfolio.handle}</span>
                {isCompany && (
                  <span className="h-[21px] px-2.5 rounded-md bg-[#5c7a58]/10 text-[10.5px] font-medium tracking-wide text-[#4a6647] flex items-center gap-1">
                    ESTUDIO DE ARQUITECTURA
                  </span>
                )}
                {availabilityInfo && portfolio.availability !== 'busy' && (
                  <span className="h-[21px] px-2.5 rounded-md bg-white border border-trevo-dark/[0.09] text-[10.5px] font-medium text-trevo-dark/65 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: availabilityInfo.color }} />
                    {availabilityInfo.label}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-[32px] font-semibold text-trevo-dark leading-tight tracking-tight mt-1">
                {portfolio.displayName}
              </h1>
              {portfolio.headline && (
                <p className="text-[13.5px] text-trevo-dark/55 font-light mt-0.5">{portfolio.headline}</p>
              )}
            </div>

            {/* Botones de acción — Editar perfil (dueño) / Seguir + Mensaje (visitante) + compartir */}
            <div className="flex items-center gap-2 shrink-0">
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
              <ShareProfileButton url={profileUrl} text={`${portfolio.displayName} en Atrium`} />
            </div>
          </div>
        </div>

        {/* Grid: columna principal (meta + bio + stats + sociales + aptitudes) / columna lateral (completar perfil) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-6 lg:gap-9 mt-5 items-start">

          <div className="min-w-0 flex flex-col gap-3.5">
            <div className="flex items-center gap-3.5 flex-wrap text-[13px] text-trevo-dark/60">
              {portfolio.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />{portfolio.location}
                </span>
              )}
              {currentStudio && (
                <>
                  <span className="w-px h-3.5 bg-trevo-dark/15" />
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />{currentStudio}
                  </span>
                </>
              )}
              {portfolio.license && (
                <>
                  <span className="w-px h-3.5 bg-trevo-dark/15" />
                  <span>Mat. {portfolio.license}</span>
                </>
              )}
              <span className="w-px h-3.5 bg-trevo-dark/15" />
              <span>En Atrium desde {memberSinceYear}</span>
            </div>

            {portfolio.bio && (
              <p className="font-light text-[14.5px] leading-relaxed text-trevo-dark/70 max-w-[56ch]">{portfolio.bio}</p>
            )}

            {/* Pills de stats — clickeables */}
            <div className="flex items-center gap-2 flex-wrap">
              {stats.map(s => (
                <Link
                  key={s.label}
                  href={s.href}
                  scroll={false}
                  className="h-[34px] px-3.5 rounded-[9px] bg-white border border-trevo-dark/[0.09] hover:border-trevo-dark/30 transition-colors flex items-baseline gap-1.5"
                >
                  <span className="font-semibold text-[14px] text-trevo-dark">{s.value}</span>
                  <span className="text-xs text-trevo-dark/50">{s.label}</span>
                </Link>
              ))}
            </div>

            {/* Chips de redes/contacto — apagable entero desde "Mostrar datos
                de contacto" del editor, sin importar qué campos tenga cargados. */}
            {portfolio.showContact !== false && (portfolio.whatsapp || portfolio.contactEmail || portfolio.linkedinUrl || portfolio.instagramUrl || portfolio.websiteUrl) && (
              <div className="flex items-center gap-2 flex-wrap">
                {portfolio.whatsapp && <SocialChip href={waLink(portfolio.whatsapp)} icon={<WhatsappMark />} label="WhatsApp" />}
                {!portfolio.whatsapp && portfolio.contactEmail && (
                  <a href={`mailto:${portfolio.contactEmail}`} className="h-8 px-3 rounded-lg border border-trevo-dark/[0.11] bg-white/60 flex items-center gap-1.5 text-[11.5px] text-trevo-dark/65 hover:bg-white hover:border-trevo-dark/30 hover:text-trevo-dark transition-colors">
                    <Mail className="w-3.5 h-3.5" />Email
                  </a>
                )}
                {portfolio.linkedinUrl && <SocialChip href={portfolio.linkedinUrl} icon={<LinkedinMark />} label="LinkedIn" />}
                {portfolio.instagramUrl && <SocialChip href={portfolio.instagramUrl} icon={<InstagramMark />} label="Instagram" />}
                {portfolio.websiteUrl && <SocialChip href={portfolio.websiteUrl} icon={<Globe className="w-3.5 h-3.5" />} label="Sitio web" />}
              </div>
            )}

            {/* Aptitudes — con nivel (1-3 puntos), más fuertes primero */}
            {skills.length > 0 && (
              <div className="bg-white border border-trevo-dark/[0.09] rounded-[13px] p-4">
                <p className="text-[10px] font-medium tracking-[0.13em] text-trevo-dark/40 mb-2.5">APTITUDES</p>
                <div className="flex flex-wrap gap-1.5">
                  {skills.slice().sort((a, b) => b.level - a.level).map(s => (
                    <span key={s.label} className="h-7 pl-2.5 pr-2 rounded-[7px] bg-trevo-dark/5 text-xs text-trevo-dark/70 flex items-center gap-1.5">
                      {s.label}
                      <span className="flex gap-[3px]">
                        {[1, 2, 3].map(n => (
                          <span key={n} className="w-[5px] h-[5px] rounded-full" style={{ background: n <= s.level ? '#5c7a58' : 'rgba(28,25,23,.16)' }} />
                        ))}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Especialidades / Idiomas */}
            {(specialties.length > 0 || languages.length > 0) && (
              <div className="bg-white border border-trevo-dark/[0.09] rounded-[13px] p-4 flex flex-col gap-3">
                {specialties.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium tracking-[0.13em] text-trevo-dark/40 mb-2.5">ESPECIALIDADES</p>
                    <div className="flex flex-wrap gap-1.5">
                      {specialties.map(sp => (
                        <span key={sp} className="h-7 px-2.5 rounded-[7px] bg-trevo-dark/5 text-xs text-trevo-dark/70 flex items-center">{sp}</span>
                      ))}
                    </div>
                  </div>
                )}
                {languages.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium tracking-[0.13em] text-trevo-dark/40 mb-2.5">IDIOMAS</p>
                    <div className="flex flex-wrap gap-1.5">
                      {languages.map(lg => (
                        <span key={lg} className="h-7 px-2.5 rounded-[7px] bg-trevo-dark/5 text-xs text-trevo-dark/70 flex items-center">{lg}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Columna lateral — completar perfil (solo dueño) */}
          {isOwnProfile && (
            <div className="flex flex-col gap-3">
              <ProfileCompleteness
                hasAvatar={!!portfolio.avatarImage}
                hasBio={!!portfolio.bio}
                hasLocation={!!portfolio.location}
                hasProject={portfolio.projects.length > 0 || portfolio.collaborations.length > 0}
              />
            </div>
          )}
        </div>

        {/* ── Equipo (solo empresas) — se preserva, sin mapeo directo al mock ── */}
        {isCompany && portfolio.team && portfolio.team.length > 0 && (
          <div className="mt-8">
            <p className="text-[10px] font-medium tracking-[0.13em] text-trevo-dark/40 mb-3">EQUIPO</p>
            <div className="flex flex-wrap gap-2.5">
              {portfolio.team.map(m => (
                <Link key={m.handle} href={`/portfolio/${m.handle}`}
                  className="group flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-white border border-trevo-dark/[0.09] hover:border-trevo-dark/30 transition-colors">
                  <div className="relative w-7 h-7 rounded-full overflow-hidden bg-trevo-dark/5 shrink-0">
                    {m.avatarImage
                      ? <Image src={m.avatarImage} alt={m.displayName} fill sizes="28px" className="object-cover" />
                      : <span className="w-full h-full flex items-center justify-center text-[11px] text-trevo-dark/40 font-medium">{m.displayName.charAt(0).toUpperCase()}</span>
                    }
                  </div>
                  <span className="text-sm text-trevo-dark/75 group-hover:text-trevo-dark transition-colors">{m.displayName}</span>
                  <span className="text-[11px] text-trevo-dark/40">{m.projectCount} proy.</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          TABS — Proyectos / Publicaciones / Trayectoria
      ══════════════════════════════════════════════════════ */}
      <div className="mt-6">
        <Suspense>
          <ProfileTabs
            handle={portfolio.handle}
            isOwner={isOwnProfile}
            projects={portfolio.projects}
            collaborations={portfolio.collaborations}
            hasTrayectoria={hasTrayectoria}
            experiences={experiences}
            education={education}
            certifications={certifications}
            awards={awards}
            featuredProjectId={portfolio.featuredProjectId}
            postsCount={postsCount ?? 0}
            loggedIn={!!user}
            currentProfileHandle={isOwnProfile ? portfolio.handle : null}
            currentAvatarImage={isOwnProfile ? portfolio.avatarImage : null}
          />
        </Suspense>
      </div>
    </div>
  );
}
