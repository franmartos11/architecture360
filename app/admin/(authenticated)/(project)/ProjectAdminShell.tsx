'use client';

import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useEffect, useState } from 'react';
import { useNewLeadsCount } from '@/hooks/useNewLeadsCount';
import SitePublishStatus from '@/components/admin/SitePublishStatus';
import { getProjectDisplayUrl } from '@/lib/project-url';
import { ProjectTypeProvider } from '@/lib/project-type-context';
import { getProjectTypeConfig } from '@/lib/project-types';

import { pluralize } from '@/lib/units';
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
  children,
}: {
  project: ActiveProject;
  userEmail: string | null;
  /** Casa / loteo: link directo al editor de datos, resuelto en el server. */
  singleBuildingHref?: string | null;
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
  const shareUrl = typeof window !== 'undefined' ? getProjectDisplayUrl(project.slug, window.location.origin) : '';

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

  // "Proyecto" agrupa varias sub-pantallas que antes solo se llegaba a
  // ellas por links sueltos dentro de /admin/proyecto (Amenidades,
  // Ubicación, Recorrido 360°) — nunca aparecían en este menú, así que
  // era fácil ni enterarse de que existían. Se expande solo mientras se
  // está navegando algo bajo /admin/proyecto — Edificios vive ahí adentro
  // también, aunque su URL sea propia (/admin/edificios).
  // Ítem que entra a la estructura del proyecto:
  //  - loteo (1 etapa): "Lotes" → directo al editor de lotes (singleBuildingHref)
  //  - casa (1 building = 1 unidad): "Casa" → directo a sus datos
  //  - edificio/dúplex/único (varios): "Edificios" / "Dúplexs" / … → la lista
  const structureItemLabel = singleBuildingHref
    ? (unitIsLand ? `${pluralize(unitLabel)}` : buildingLabel)
    : hasFloorStep ? 'Edificios' : hasUnitStep ? `${pluralize(buildingLabel)}` : buildingLabel;
  const projectSubItems = [
    { label: structureItemLabel, href: singleBuildingHref ?? '/admin/edificios' },
    { label: 'Amenidades', href: '/admin/proyecto/amenities' },
    { label: 'Ubicación', href: '/admin/proyecto/ubicacion' },
    { label: 'Avance de obra', href: '/admin/proyecto/avance' },
    { label: 'Recorrido 360°', href: '/admin/proyecto/recorrido' },
    { label: 'Modelo BIM', href: '/admin/proyecto/bim' },
  ];
  const isProjectSection = pathname === '/admin/proyecto' || pathname.startsWith('/admin/proyecto/') || pathname.startsWith('/admin/edificios');

  // "Sitio web" agrupa edición de contenido y presentación — "Secciones"
  // es la lista + panel de edición de cada bloque de la landing (orden,
  // mostrar/ocultar y contenido, todo en una sola pantalla — ver
  // lib/project-sections.ts) y "Estilo" la paleta/tipografía. Mismo
  // mecanismo de expandirse que "Proyecto".
  const sitioSubItems = [
    { label: 'Secciones', href: '/admin/sitio' },
    { label: 'Estilo', href: '/admin/estilo' },
  ];
  const isSitioSection = pathname === '/admin/sitio' || pathname.startsWith('/admin/sitio/') || pathname.startsWith('/admin/estilo');

  // "Operación" agrupa lo operativo del día a día (Inventario, Leads). A
  // diferencia de Proyecto y Sitio web no tiene pantalla propia, así que
  // no es un link que expande — es un encabezado de sección con sus
  // hijos siempre visibles, para no esconderlos detrás de un click a una
  // página que no existe.
  //
  // La pantalla de inventario (precio/estado en lote) solo tiene sentido
  // con varias unidades — una casa es UNA sola, su precio y estado se
  // editan en su propia ficha (paso "Datos"), así que acá no aparece.
  const operacionItems = [
    ...(hasUnitStep ? [{ label: hasFloorStep ? 'Inventario' : `${pluralize(unitLabel)}`, href: '/admin/inventory' }] : []),
    ...(showLeads ? [{ label: 'Leads', href: '/admin/leads' }] : []),
  ];

  const navItems = [
    { label: 'Configuración', href: '/admin/settings' },
  ];

  return (
    <ProjectTypeProvider projectType={project.project_type} saleMode={project.sale_mode}>
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-gray-900 text-white flex-shrink-0 md:min-h-screen flex flex-col">
        <div className="p-6 flex items-start justify-between gap-3 md:block border-b border-gray-800">
          <div className="min-w-0">
            <Link href="/admin/proyectos" className="text-xs text-gray-400 hover:text-white transition-colors inline-flex items-center gap-1">
              ← Cambiar de proyecto
            </Link>
            <h1 className="text-lg font-bold tracking-wide mt-1.5 truncate" title={project.name}>{project.name}</h1>
            {userEmail && <p className="text-gray-500 text-xs mt-0.5 truncate">{userEmail}</p>}
            <SitePublishStatus shareUrl={shareUrl} shareText={`Mirá el proyecto ${project.name}`} />
          </div>
          <button
            onClick={() => setMobileNavOpen(open => !open)}
            className="md:hidden p-2 -mr-2 -mt-1 text-gray-300 hover:text-white rounded-lg hover:bg-gray-800 transition-colors shrink-0"
            aria-label={mobileNavOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileNavOpen}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileNavOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        <nav className={`${mobileNavOpen ? 'flex' : 'hidden'} md:flex flex-1 px-4 py-4 flex-col gap-2`}>
          {/* El dashboard (métricas del proyecto) no aplica cuando el
              proyecto ES una sola cosa: una casa, o un loteo de una etapa. */}
          {hasUnitStep && !typeConfig.singleBuilding && (
            <Link
              href="/admin"
              className={`flex items-center justify-between px-4 py-2 rounded-lg transition-colors ${
                pathname === '/admin' ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              Dashboard
            </Link>
          )}

          <div>
            <Link
              href="/admin/sitio"
              className={`flex items-center justify-between px-4 py-2 rounded-lg transition-colors ${
                isSitioSection ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              Sitio web
            </Link>
            {isSitioSection && (
              <div className="mt-1 ml-4 pl-3 border-l border-gray-800 flex flex-col gap-1">
                {sitioSubItems.map(sub => {
                  const isSubActive = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        isSubActive ? 'text-white font-medium' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Link
              href="/admin/proyecto"
              className={`flex items-center justify-between px-4 py-2 rounded-lg transition-colors ${
                isProjectSection ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              Proyecto
            </Link>
            {isProjectSection && (
              <div className="mt-1 ml-4 pl-3 border-l border-gray-800 flex flex-col gap-1">
                {projectSubItems.map(sub => {
                  const isSubActive = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        isSubActive ? 'text-white font-medium' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {operacionItems.length > 0 && (
          <div className="pt-2">
            <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Operación</p>
            <div className="mt-1 flex flex-col gap-1">
              {operacionItems.map(item => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const showBadge = item.href === '/admin/leads' && newLeadsCount > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-4 py-2 rounded-lg transition-colors ${
                      isActive ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {item.label}
                    {showBadge && (
                      <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                        {newLeadsCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
          )}

          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-4 py-2 rounded-lg transition-colors ${
                  isActive ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
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
