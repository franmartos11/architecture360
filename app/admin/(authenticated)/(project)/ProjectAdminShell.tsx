'use client';

import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useEffect, useState } from 'react';
import { useNewLeadsCount } from '@/hooks/useNewLeadsCount';
import { useProjectCompleteness } from '@/hooks/useProjectCompleteness';
import { useShareLink } from '@/hooks/useShareLink';
import { getProjectHref, getProjectDisplayUrl } from '@/lib/project-url';
import { ProjectTypeProvider } from '@/lib/project-type-context';
import { getProjectTypeConfig } from '@/lib/project-types';

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
  children,
}: {
  project: ActiveProject;
  userEmail: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { count: newLeadsCount, markSeen: markLeadsSeen } = useNewLeadsCount();
  const typeConfig = getProjectTypeConfig(project.project_type, project.sale_mode);
  const { hasFloorStep, hasUnitStep, buildingLabel, unitLabel, showLeads } = typeConfig;
  const { missing: missingSections } = useProjectCompleteness(typeConfig);
  const shareLink = useShareLink();
  const publicHref = getProjectHref(project.slug);

  const handleShare = () => {
    shareLink(getProjectDisplayUrl(project.slug, window.location.origin), project.name, `Mirá el proyecto ${project.name}`);
  };

  useEffect(() => {
    if (pathname === '/admin/leads') markLeadsSeen();
  }, [pathname, markLeadsSeen]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // "Proyecto" agrupa varias sub-pantallas que antes solo se llegaba a
  // ellas por links sueltos dentro de /admin/proyecto (Amenidades,
  // Ubicación, Recorrido 360°) — nunca aparecían en este menú, así que
  // era fácil ni enterarse de que existían. Se expande solo mientras se
  // está navegando algo bajo /admin/proyecto — Edificios vive ahí adentro
  // también, aunque su URL sea propia (/admin/edificios).
  const projectSubItems = [
    { label: hasFloorStep ? 'Edificios' : `${buildingLabel}s`, href: '/admin/edificios' },
    { label: 'Amenidades', href: '/admin/proyecto/amenities' },
    { label: 'Ubicación', href: '/admin/proyecto/ubicacion' },
    { label: 'Recorrido 360°', href: '/admin/proyecto/recorrido' },
  ];
  const isProjectSection = pathname === '/admin/proyecto' || pathname.startsWith('/admin/proyecto/') || pathname.startsWith('/admin/edificios');

  // "Sitio web" agrupa edición de contenido y presentación — "Gestión" es
  // el hub de contenido/secciones (lo mismo que ya se ve al clickear
  // "Sitio web" arriba, solo que nombrado explícitamente como sub-ítem),
  // "Estilo" la paleta/tipografía, y "Secciones" el orden y prendido/
  // apagado de cada bloque de la landing — antes vivía bajo "Proyecto",
  // separado de Estilo, aunque las dos son la misma tarea de personalizar
  // el sitio. Mismo mecanismo de expandirse que "Proyecto".
  const sitioSubItems = [
    { label: 'Gestión', href: '/admin/sitio' },
    { label: 'Estilo', href: '/admin/estilo' },
    { label: 'Secciones', href: '/admin/sitio/secciones' },
  ];
  const isSitioSection = pathname === '/admin/sitio' || pathname.startsWith('/admin/sitio/') || pathname.startsWith('/admin/estilo');

  // "Operación" agrupa lo operativo del día a día (Inventario, Leads). A
  // diferencia de Proyecto y Sitio web no tiene pantalla propia, así que
  // no es un link que expande — es un encabezado de sección con sus
  // hijos siempre visibles, para no esconderlos detrás de un click a una
  // página que no existe.
  //
  // Cuando building y unidad son la misma cosa (hasUnitStep false, hoy
  // "casas"), unitLabel === buildingLabel — este ítem NO puede llamarse
  // "Casas" igual que el de arriba (línea ~59) o quedan dos entradas
  // idénticas en el menú sin forma de distinguirlas. Acá se edita precio y
  // estado en lote, así que ese es el nombre.
  const operacionItems = [
    { label: hasFloorStep ? 'Inventario' : hasUnitStep ? `${unitLabel}s` : 'Precios y estados', href: '/admin/inventory' },
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
            <div className="flex items-center gap-2 mt-3">
              <a
                href={publicHref}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-200 hover:text-white transition-colors truncate"
                title={`Ver el sitio público: ${publicHref}`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span className="truncate">Ver sitio público</span>
              </a>
              <button
                onClick={handleShare}
                className="shrink-0 p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-200 hover:text-white transition-colors"
                title="Copiar link del proyecto"
                aria-label="Copiar link del proyecto"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            {missingSections.length > 0 && (
              <Link
                href="/admin/sitio"
                title={`Antes de compartir, te falta cargar: ${missingSections.map(s => s.label).join(', ')}`}
                className="mt-2 flex items-start gap-1.5 px-2.5 py-1.5 bg-amber-950/40 hover:bg-amber-950/60 border border-amber-800/40 rounded-lg text-xs text-amber-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span className="min-w-0">
                  Te falta cargar {missingSections.length === 1 ? '1 sección' : `${missingSections.length} secciones`} antes de compartir
                </span>
              </Link>
            )}
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
          <Link
            href="/admin"
            className={`flex items-center justify-between px-4 py-2 rounded-lg transition-colors ${
              pathname === '/admin' ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            Dashboard
          </Link>

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
          {children}
        </div>
      </main>
    </div>
    </ProjectTypeProvider>
  );
}
