'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Plus, ExternalLink } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { PROJECT_STRUCTURES } from '@/lib/project-types';
import { getProjectHref } from '@/lib/project-url';
import PostFeed from '@/components/social/PostFeed';
import type { ProjectType, PortfolioProjectSummary, ProfileExperience, ProfileEducation, ProfileCertification, ProfileAward } from '@/types';
import type { PortfolioCollaboration } from '@/data/profile-repository';

type TabKey = 'proyectos' | 'publicaciones' | 'trayectoria';

interface ProfileTabsProps {
  handle: string;
  isOwner: boolean;
  projects: PortfolioProjectSummary[];
  collaborations: PortfolioCollaboration[];
  hasTrayectoria: boolean;
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  certifications: ProfileCertification[];
  awards: ProfileAward[];
  /** Proyecto propio elegido en el editor de perfil — tiene prioridad sobre el heurístico de abajo. */
  featuredProjectId?: string | null;
  postsCount: number;
  loggedIn: boolean;
  currentProfileHandle: string | null;
  currentAvatarImage: string | null;
}

// ─── Tarjeta de proyecto (grande / chica, reutilizada en Proyectos y Colaboraciones) ──
function ProjectTile({ slug, name, masterplanImage, label, sub, featured = false }: {
  slug: string; name: string; masterplanImage: string | null;
  label?: string; sub?: string; featured?: boolean;
}) {
  return (
    <Link
      href={getProjectHref(slug)}
      className={`group rounded-2xl overflow-hidden bg-white border border-trevo-dark/[0.09] hover:border-trevo-dark/30 transition-colors flex flex-col ${featured ? '' : ''}`}
    >
      <div className={`relative ${featured ? 'aspect-[16/10]' : 'aspect-[4/3]'} overflow-hidden bg-[repeating-linear-gradient(115deg,#e6e3dc_0px,#e6e3dc_18px,#dcd8d0_18px,#dcd8d0_36px)]`}>
        {masterplanImage ? (
          <Image
            src={masterplanImage} alt={name} fill
            sizes={featured ? '(min-width: 1024px) 66vw, 100vw' : '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'}
            placeholder="blur" blurDataURL={shimmerDataUrl()}
            className="object-cover"
          />
        ) : null}
        {featured && (
          <span className="absolute top-3 left-3 h-6 px-2.5 rounded-md bg-[#1c1a17]/80 text-white text-[10px] font-medium tracking-wide flex items-center">
            DESTACADO
          </span>
        )}
      </div>
      <div className={`flex flex-col gap-1 flex-1 ${featured ? 'p-4' : 'p-3.5'}`}>
        <p className={`font-semibold text-trevo-dark leading-snug ${featured ? 'text-lg' : 'text-[15px]'}`}>{name}</p>
        {(label || sub) && (
          <p className="text-xs text-trevo-dark/50 font-light">{label}{label && sub ? ' · ' : ''}{sub}</p>
        )}
      </div>
    </Link>
  );
}

function CollaborationCard({ c }: { c: PortfolioCollaboration }) {
  return (
    <Link
      href={getProjectHref(c.slug)}
      className="group rounded-2xl overflow-hidden bg-white border border-trevo-dark/[0.09] hover:border-trevo-dark/30 transition-colors"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[repeating-linear-gradient(115deg,#e6e3dc_0px,#e6e3dc_16px,#dcd8d0_16px,#dcd8d0_32px)]">
        {c.masterplanImage && (
          <Image src={c.masterplanImage} alt={c.name} fill sizes="(min-width: 1024px) 25vw, 50vw" placeholder="blur" blurDataURL={shimmerDataUrl()} className="object-cover" />
        )}
      </div>
      <div className="p-3.5 flex flex-col gap-1.5">
        <p className="font-semibold text-trevo-dark text-sm leading-snug">{c.name}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-trevo-dark/50 font-light">{c.contribution}</span>
        </div>
      </div>
    </Link>
  );
}

function ExperienceTimeline({ items }: { items: ProfileExperience[] }) {
  if (!items.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-trevo-dark/[0.09] p-5 flex flex-col gap-4">
      <p className="text-[10px] font-medium tracking-[0.13em] text-trevo-dark/40">EXPERIENCIA</p>
      <div className="flex flex-col">
        {items.map((exp, i) => (
          <div key={i} className="flex gap-3.5">
            <div className="flex flex-col items-center pt-1.5 shrink-0">
              <div className="w-2 h-2 rounded-full bg-[#5c7a58]" />
              {i < items.length - 1 && <div className="w-px flex-1 bg-trevo-dark/[0.13] mt-1" />}
            </div>
            <div className="min-w-0 pb-4 last:pb-0">
              <p className="font-semibold text-trevo-dark text-sm">{exp.role}</p>
              <p className="text-trevo-dark/60 text-[12.5px] mt-0.5">{exp.company} · {exp.startYear} – {exp.endYear || 'Presente'}</p>
              {exp.description && <p className="text-trevo-dark/55 text-[12.5px] leading-relaxed font-light mt-1.5">{exp.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EducationCard({ items }: { items: ProfileEducation[] }) {
  if (!items.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-trevo-dark/[0.09] p-5 flex flex-col gap-3.5">
      <p className="text-[10px] font-medium tracking-[0.13em] text-trevo-dark/40">EDUCACIÓN</p>
      {items.map((edu, i) => (
        <div key={i} className="flex gap-3">
          <div className="w-9 h-9 rounded-lg bg-trevo-dark/5 flex items-center justify-center shrink-0 text-trevo-dark/45">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[17px] h-[17px]">
              <path d="M2 8l10-4 10 4-10 4z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 10.5V16c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8v-5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-trevo-dark text-sm leading-snug">{edu.career || edu.institution}</p>
            {edu.career && <p className="text-trevo-dark/60 text-[12.5px]">{edu.institution}</p>}
            <p className="text-trevo-dark/45 text-xs font-light mt-0.5">
              {edu.startYear}{edu.startYear ? ' – ' : ''}{edu.endYear || (edu.startYear ? 'En curso' : '')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CertificatesCard({ items }: { items: ProfileCertification[] }) {
  if (!items.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-trevo-dark/[0.09] p-5 flex flex-col gap-3">
      <p className="text-[10px] font-medium tracking-[0.13em] text-trevo-dark/40">CERTIFICADOS</p>
      {items.map((cert, i) => (
        <a
          key={i}
          href={cert.url || cert.imageUrl || undefined}
          target={cert.url || cert.imageUrl ? '_blank' : undefined}
          rel="noopener noreferrer"
          className={`flex items-center gap-3 p-2.5 rounded-[11px] border border-trevo-dark/[0.09] transition-colors ${cert.url || cert.imageUrl ? 'hover:border-trevo-dark/30 cursor-pointer' : 'cursor-default'}`}
        >
          {cert.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cert.imageUrl} alt={cert.name} className="w-9 h-9 rounded-lg object-cover shrink-0 border border-trevo-dark/10" />
          ) : (
            <div className="w-9 h-9 rounded-lg shrink-0 bg-[repeating-linear-gradient(115deg,#e6e3dc_0px,#e6e3dc_10px,#dcd8d0_10px,#dcd8d0_20px)]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-trevo-dark text-[13px] leading-snug truncate">{cert.name}</p>
            <p className="text-trevo-dark/48 text-[11.5px] font-light">{cert.issuer} · {cert.year}</p>
          </div>
          {(cert.url || cert.imageUrl) && <ExternalLink className="w-3.5 h-3.5 text-trevo-dark/35 shrink-0" />}
        </a>
      ))}
    </div>
  );
}

function AwardsCard({ items }: { items: ProfileAward[] }) {
  if (!items.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-trevo-dark/[0.09] p-5 flex flex-col gap-3">
      <p className="text-[10px] font-medium tracking-[0.13em] text-trevo-dark/40">PREMIOS Y PUBLICACIONES</p>
      {items.map((award, i) => (
        <a
          key={i}
          href={award.url || undefined}
          target={award.url ? '_blank' : undefined}
          rel="noopener noreferrer"
          className={`flex items-center gap-3 p-2.5 rounded-[11px] border border-trevo-dark/[0.09] transition-colors ${award.url ? 'hover:border-trevo-dark/30 cursor-pointer' : 'cursor-default'}`}
        >
          <div className="w-9 h-9 rounded-lg shrink-0 bg-trevo-dark/5 flex items-center justify-center text-trevo-dark/45">★</div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-trevo-dark text-[13px] leading-snug truncate">{award.name}</p>
            <p className="text-trevo-dark/48 text-[11.5px] font-light">{[award.issuer, award.year].filter(Boolean).join(' · ')}</p>
          </div>
          {award.url && <ExternalLink className="w-3.5 h-3.5 text-trevo-dark/35 shrink-0" />}
        </a>
      ))}
    </div>
  );
}

export default function ProfileTabs({
  handle, isOwner, projects, collaborations, hasTrayectoria,
  experiences, education, certifications, awards, featuredProjectId, postsCount,
  loggedIn, currentProfileHandle, currentAvatarImage,
}: ProfileTabsProps) {
  // El tab activo vive en la URL (?tab=...) en vez de en un useState local —
  // así los pills de stats del header ("proyectos"/"colaboraciones") pueden
  // linkear acá con un <Link href="?tab=proyectos"> plano y siempre quedan
  // en sync, sin duplicar la fuente de verdad ni pisarse con la navegación
  // de TransitionLink (que no remonta este componente cliente).
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const paramTab = searchParams.get('tab');
  const tab: TabKey = paramTab === 'publicaciones' || paramTab === 'trayectoria' ? paramTab : 'proyectos';
  const setTab = (next: TabKey) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set('tab', next);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  };
  const [filter, setFilter] = useState<'Todos' | ProjectType>('Todos');

  const availableTypes = useMemo(() => {
    const seen = new Set<ProjectType>();
    projects.forEach(p => seen.add(p.projectType));
    return Array.from(seen);
  }, [projects]);

  const filteredProjects = filter === 'Todos' ? projects : projects.filter(p => p.projectType === filter);
  // El proyecto elegido a mano en el editor de perfil gana; sin uno elegido,
  // se cae al heurístico de antes (el primero, solo si hay 3+).
  const explicitFeatured = featuredProjectId ? filteredProjects.find(p => p.id === featuredProjectId) : undefined;
  const featuredProject = explicitFeatured ?? (filteredProjects.length >= 3 ? filteredProjects[0] : null);
  const restProjects = featuredProject ? filteredProjects.filter(p => p.slug !== featuredProject.slug) : filteredProjects;
  const sideProjects = restProjects.slice(0, 2);
  const gridProjects = featuredProject ? restProjects.slice(2) : restProjects;

  const tabs: { key: TabKey; label: string; count: string }[] = [
    { key: 'proyectos', label: 'Proyectos', count: String(projects.length + collaborations.length) },
    { key: 'publicaciones', label: 'Publicaciones', count: postsCount > 0 ? String(postsCount) : '' },
    ...(hasTrayectoria ? [{ key: 'trayectoria' as TabKey, label: 'Trayectoria', count: '' }] : []),
  ];

  return (
    <div>
      {/* Barra de tabs — sticky debajo del header de la app (h-14 = 56px, dejamos 58px como el mockup) */}
      <div className="sticky top-14 z-10 bg-[#f5f4f0]/95 backdrop-blur-sm border-b border-trevo-dark/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`h-12 px-1 mr-6 flex items-center gap-1.5 whitespace-nowrap text-[13.5px] transition-colors ${
                tab === t.key ? 'font-medium text-trevo-dark shadow-[inset_0_-2px_0_#1c1a17]' : 'font-normal text-trevo-dark/50 hover:text-trevo-dark/80'
              }`}
            >
              {t.label}
              {t.count && <span className="text-[11.5px] text-trevo-dark/40">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24">

        {tab === 'proyectos' && (
          <div className="flex flex-col gap-7">
            {projects.length + collaborations.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-trevo-dark/20 text-4xl mb-4">◻</p>
                <p className="text-trevo-dark/45 font-light">Todavía no hay proyectos publicados.</p>
              </div>
            ) : (
              <>
                {projects.length > 0 && (
                  <>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(['Todos', ...availableTypes] as const).map(f => (
                          <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`h-[34px] px-3.5 rounded-[9px] text-[12.5px] border transition-colors ${
                              filter === f
                                ? 'bg-[#1c1a17] text-white border-[#1c1a17] font-medium'
                                : 'bg-white text-trevo-dark/60 border-trevo-dark/[0.11] hover:border-trevo-dark/30'
                            }`}
                          >
                            {f === 'Todos' ? 'Todos' : (PROJECT_STRUCTURES[f]?.label ?? f)}
                          </button>
                        ))}
                      </div>
                      {isOwner && (
                        <Link
                          href="/admin/proyectos"
                          className="h-[34px] px-3.5 rounded-[9px] border border-dashed border-trevo-dark/25 text-[12.5px] font-medium text-trevo-dark/65 hover:border-[#5c7a58] hover:text-[#4a6647] transition-colors flex items-center gap-2"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Agregar proyecto
                        </Link>
                      )}
                    </div>

                    {filteredProjects.length === 0 ? (
                      <p className="text-trevo-dark/45 font-light py-10 text-center">No hay proyectos de este tipo.</p>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4 items-stretch">
                        {featuredProject ? (
                          <>
                            <ProjectTile
                              slug={featuredProject.slug} name={featuredProject.name}
                              masterplanImage={featuredProject.masterplanImage}
                              label={PROJECT_STRUCTURES[featuredProject.projectType]?.label ?? featuredProject.projectType}
                              sub={featuredProject.academicYear ?? undefined}
                              featured
                            />
                            {sideProjects.length > 0 && (
                              <div className="grid grid-rows-1 sm:grid-rows-2 gap-4 min-w-0">
                                {sideProjects.map(p => (
                                  <ProjectTile
                                    key={p.slug} slug={p.slug} name={p.name} masterplanImage={p.masterplanImage}
                                    label={PROJECT_STRUCTURES[p.projectType]?.label ?? p.projectType}
                                    sub={p.academicYear ?? undefined}
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredProjects.map(p => (
                              <ProjectTile
                                key={p.slug} slug={p.slug} name={p.name} masterplanImage={p.masterplanImage}
                                label={PROJECT_STRUCTURES[p.projectType]?.label ?? p.projectType}
                                sub={p.academicYear ?? undefined}
                              />
                            ))}
                          </div>
                        )}
                        {featuredProject && gridProjects.length > 0 && (
                          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {gridProjects.map(p => (
                              <ProjectTile
                                key={p.slug} slug={p.slug} name={p.name} masterplanImage={p.masterplanImage}
                                label={PROJECT_STRUCTURES[p.projectType]?.label ?? p.projectType}
                                sub={p.academicYear ?? undefined}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {collaborations.length > 0 && (
                  <div className="flex flex-col gap-3.5">
                    <div className="flex items-baseline gap-2.5">
                      <p className="text-[10px] font-medium tracking-[0.13em] text-trevo-dark/40">COLABORACIONES</p>
                      <p className="text-[11.5px] font-light text-trevo-dark/45">Proyectos de otros estudios donde participó</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {collaborations.map(c => <CollaborationCard key={c.slug} c={c} />)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'publicaciones' && (
          <PostFeed
            authorHandle={handle}
            loggedIn={loggedIn}
            currentProfileHandle={currentProfileHandle}
            currentAvatarImage={currentAvatarImage}
          />
        )}

        {tab === 'trayectoria' && hasTrayectoria && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <ExperienceTimeline items={experiences} />
            <div className="flex flex-col gap-4">
              <EducationCard items={education} />
              <CertificatesCard items={certifications} />
              <AwardsCard items={awards} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
