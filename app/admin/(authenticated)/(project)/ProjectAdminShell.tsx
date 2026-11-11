'use client';

import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useEffect, useState } from 'react';
import { useNewLeadsCount } from '@/hooks/useNewLeadsCount';
import SitePublishStatus, { PublishReadinessCard } from '@/components/admin/SitePublishStatus';
import { getProjectDisplayUrl } from '@/lib/project-url';
import { ProjectTypeProvider } from '@/lib/project-type-context';
import { getProjectTypeConfig } from '@/lib/project-types';

import { pluralize } from '@/lib/units';
import { useCustomDomain } from '@/lib/custom-domain-context';
interface ActiveProject {
  id: string;
  slug: string;
  name: string;
  project_type: string;
  sale_mode: string;
}

// Sidebar + chrome de todo lo que vive DENTRO de un proyecto — a
// diferencia del layout raíz de /admin, este ya sabe con certeza qué
// proyecto está activo (lo valida su layout padre, del lado del
// servidor) así que acá solo se encarga de la presentación.
export default function ProjectAdminShell({
  project,
  userEmail,
  singleBuildingHref,
  unitsCount = 0,
  children,
}: {
  project: ActiveProject;
  userEmail: string | null;
  /** Casa / loteo: link directo al editor de datos, resuelto en el server. */
  singleBuildingHref?: string | null;
  /** Unidades cargadas (contado en el layout del servidor) — para "Unidades 48" en el menú. */
  unitsCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { count: newLeadsCount, markSeen: markLeadsSeen } = useNewLeadsCount();
  const typeConfig = getProjectTypeConfig(project.project_type, project.sale_mode);
  const { hasFloorStep, hasUnitStep, buildingLabel, unitLabel, unitIsLand, showLeads } = typeConfig;
  // Valor de project_type / sale_mode que no existe en el catálogo — el
  // proyecto se está mostrando como "Edificio — Para vender" por descarte.
  // Casi siempre es dato viejo (valor combinado legacy, migración a medias).
  const badType = typeConfig.fallbackFields.type ? project.project_type : null;
  const badSaleMode = typeConfig.fallbackFields.saleMode ? project.sale_mode : null;
  const customDomain = useCustomDomain();
  const shareUrl = typeof window !== 'undefined' ? getProjectDisplayUrl(project.slug, window.location.origin, customDomain) : '';

  useEffect(() => {
    if (pathname === '/admin/leads') markLeadsSeen();
  }, [pathname, markLeadsSeen]);

  // Cierra el menú mobile al navegar — se resetea durante el render (no en
  // un efecto) siguiendo el patrón de React para "ajustar estado cuando
  // cambia una prop": https://react.dev/learn/you-might-not-need-an-effect
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileNavOpen(false);
  }

  // "Ficha": el contenido del proyecto en 7 capítulos (diseño de la carga
  // de proyectos). Se expande mientras se navega cualquiera de ellos.
  const fichaChapters = [
    { label: 'Esencial', href: '/admin/proyecto', exact: true },
    { label: 'Relato', href: '/admin/proyecto/relato' },
    { label: 'Galería', href: '/admin/proyecto/galeria' },
    { label: 'Entorno', href: '/admin/proyecto/entorno', also: ['/admin/proyecto/ubicacion', '/admin/proyecto/amenities'] },
    { label: 'Obra', href: '/admin/proyecto/avance' },
    { label: 'Inmersivo', href: '/admin/proyecto/recorrido', also: ['/admin/proyecto/bim'] },
    { label: 'Equipo', href: '/admin/proyecto/equipo' },
  ];
  const chapterActive = (c: { href: string; exact?: boolean; also?: string[] }) =>
    (c.exact ? pathname === c.href : pathname === c.href || pathname.startsWith(`${c.href}/`))
    || (c.also ?? []).some(a => pathname === a || pathname.startsWith(`${a}/`));
  const isFichaSection = pathname === '/admin/proyecto' || pathname.startsWith('/admin/proyecto/');

  // "Unidades": la estructura (edificios/pisos/plantas) y el inventario.
  //  - loteo (1 etapa): "Lotes" → directo al editor de lotes (singleBuildingHref)
  //  - casa (1 building = 1 unidad): "Casa" → directo a sus datos
  //  - edificio/dúplex/único: "Unidades" → inventario, con la estructura adentro
  const structureItemLabel = singleBuildingHref
    ? (unitIsLand ? `${pluralize(unitLabel)}` : buildingLabel)
    : hasFloorStep ? 'Edificios y plantas' : `${pluralize(buildingLabel)}`;
  const unidadesHref = hasUnitStep ? '/admin/inventory' : (singleBuildingHref ?? '/admin/edificios');
  const unidadesLabel = hasUnitStep ? pluralize(unitLabel) : buildingLabel;
  const unidadesSubItems = hasUnitStep
    ? [
        { label: hasFloorStep ? 'Inventario' : `Precios y estados`, href: '/admin/inventory' },
        { label: structureItemLabel, href: singleBuildingHref ?? '/admin/edificios' },
      ]
    : [];
  const isUnidadesSection = pathname.startsWith('/admin/inventory') || pathname.startsWith('/admin/edificios');

  // "Sitio web": orden y diseño de las secciones + estilo.
  const sitioSubItems = [
    { label: 'Secciones', href: '/admin/sitio' },
    { label: 'Estilo', href: '/admin/estilo' },
  ];
  const isSitioSection = pathname === '/admin/sitio' || pathname.startsWith('/admin/sitio/') || pathname.startsWith('/admin/estilo');

  const navItems = [
    { label: 'Configuración', href: '/admin/settings' },
  ];

  // Estilo del menú: el del diseño de la carga de proyectos (fondo claro,
  // ícono de trazo + label, activo en gris cálido). Mismos ítems y rutas
  // que antes — solo cambia la presentación.
  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 min-h-[40px] px-2.5 rounded-lg text-sm transition-colors ${
      active ? 'bg-[#EAE7E0] text-gray-900 font-semibold' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
    }`;
  const subClass = (active: boolean) =>
    `flex items-center min-h-[34px] px-2.5 rounded-lg text-[13px] transition-colors ${
      active ? 'bg-white text-gray-900 font-semibold shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'
    }`;

  return (
    <ProjectTypeProvider projectType={project.project_type} saleMode={project.sale_mode}>
    <div className="atrium-ui min-h-screen bg-[#F5F3EE] flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="carga-guiada w-full md:w-64 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 flex-shrink-0 md:min-h-screen flex flex-col">
        <div className="px-5 pt-6 pb-4 flex items-start justify-between gap-3 md:block">
          <div className="min-w-0">
            <Link href="/admin/proyectos" className="text-xs text-gray-600 hover:text-gray-900 transition-colors inline-flex items-center gap-1.5 min-h-[36px]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
              Todos los proyectos
            </Link>
            <p className="font-display text-lg font-semibold tracking-[-0.02em] text-gray-900 mt-1.5 truncate" title={project.name}>{project.name}</p>
            {userEmail && <p className="text-gray-500 text-xs mt-0.5 truncate">{userEmail}</p>}
            <SitePublishStatus shareUrl={shareUrl} shareText={`Mirá el proyecto ${project.name}`} />
          </div>
          <button
            onClick={() => setMobileNavOpen(open => !open)}
            className="md:hidden w-11 h-11 -mr-2 -mt-1 flex items-center justify-center text-gray-700 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
            aria-label={mobileNavOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileNavOpen}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              {mobileNavOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        <nav className={`${mobileNavOpen ? 'flex' : 'hidden'} md:flex flex-1 px-3 pb-5 flex-col gap-1`}>
          <p className="px-2.5 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">Proyecto</p>

          <div>
            <Link href="/admin/proyecto" className={itemClass(isFichaSection)}>
              <NavIcon d="M4 4h16v16H4zM4 9h16M9 9v11" />
              <span className="flex-1">Ficha</span>
            </Link>
            {isFichaSection && (
              <div className="mt-1 mb-1.5 ml-[18px] pl-3 border-l border-gray-200 flex flex-col gap-0.5">
                {fichaChapters.map(c => (
                  <Link key={c.href} href={c.href} className={subClass(chapterActive(c))}>{c.label}</Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <Link href={unidadesHref} className={itemClass(isUnidadesSection)}>
              <NavIcon d="M5 3h14v18H5zM9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
              <span className="flex-1">{unidadesLabel}</span>
              {hasUnitStep && unitsCount > 0 && <span className="text-xs text-gray-500 font-normal">{unitsCount}</span>}
            </Link>
            {isUnidadesSection && unidadesSubItems.length > 0 && (
              <div className="mt-1 mb-1.5 ml-[18px] pl-3 border-l border-gray-200 flex flex-col gap-0.5">
                {unidadesSubItems.map(sub => {
                  const isSubActive = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
                  return <Link key={sub.href} href={sub.href} className={subClass(isSubActive)}>{sub.label}</Link>;
                })}
              </div>
            )}
          </div>

          <div>
            <Link href="/admin/sitio" className={itemClass(isSitioSection)}>
              <NavIcon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
              <span className="flex-1">Sitio web</span>
              {!isSitioSection && <span className="text-[11px] text-gray-500 font-normal">Secciones · Estilo</span>}
            </Link>
            {isSitioSection && (
              <div className="mt-1 mb-1.5 ml-[18px] pl-3 border-l border-gray-200 flex flex-col gap-0.5">
                {sitioSubItems.map(sub => {
                  const isSubActive = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
                  return <Link key={sub.href} href={sub.href} className={subClass(isSubActive)}>{sub.label}</Link>;
                })}
              </div>
            )}
          </div>

          {/* Operación: Leads primero (lo que hay que atender), después el
              Dashboard — que no aplica cuando el proyecto ES una sola cosa. */}
          {(showLeads || (hasUnitStep && !typeConfig.singleBuilding)) && (
            <p className="px-2.5 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">Operación</p>
          )}
          {showLeads && (
            <Link href="/admin/leads" className={itemClass(pathname === '/admin/leads' || pathname.startsWith('/admin/leads/'))}>
              <NavIcon d="M3 12h5l2 3h4l2-3h5M5 5h14l2 7v7H3v-7z" />
              <span className="flex-1">Leads</span>
              {newLeadsCount > 0 && (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand-700 text-white text-[11px] font-semibold flex items-center justify-center">
                  {newLeadsCount}
                </span>
              )}
            </Link>
          )}
          {hasUnitStep && !typeConfig.singleBuilding && (
            <Link href="/admin" className={itemClass(pathname === '/admin')}>
              <NavIcon d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
              <span className="flex-1">Dashboard</span>
            </Link>
          )}

          <div className="mt-auto pt-6 flex flex-col gap-2">
            <PublishReadinessCard />
            {navItems.map(item => (
              <Link key={item.href} href={item.href} className={itemClass(pathname === item.href)}>
                <NavIcon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                <span className="flex-1">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          {typeConfig.isFallback && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm font-semibold text-red-800">
                Este proyecto tiene un tipo que no se reconoce
                {badType && <> (forma: <code className="font-mono">{badType}</code>)</>}
                {badSaleMode && <> (propósito: <code className="font-mono">{badSaleMode}</code>)</>}
                {' '}— mientras tanto se muestra como <strong>{getProjectTypeConfig('edificio', 'venta').label}</strong>.
              </p>
              <p className="text-sm text-red-700 mt-1">
                {badSaleMode
                  ? <>El propósito se corrige en <Link href="/admin/settings" className="font-medium underline underline-offset-2 hover:text-red-900">Configuración</Link>.</>
                  : 'La forma se define al crear el proyecto — para corregir un valor viejo hay que ajustarlo en la base de datos.'}
              </p>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
    </ProjectTypeProvider>
  );
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={d} />
    </svg>
  );
}
