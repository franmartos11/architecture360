'use client';

import { usePathname } from 'next/navigation';
import { TransitionLink } from '@/components/ui/TransitionUtils';
import { m as motion } from 'framer-motion';
import { useProjectBasePath } from '@/lib/project-base-path-context';

interface BreadcrumbsProps {
  projectName: string;
  /** Override para tipos sin concepto de "torre" (ej. casa) — default 'Torre'. */
  buildingLabel?: string;
  /** Override para tipos sin concepto de "unidad" propiamente dicha — default 'Unidad'. */
  unitLabel?: string;
}

export default function Breadcrumbs({ projectName, buildingLabel = 'Torre', unitLabel = 'Unidad' }: BreadcrumbsProps) {
  const pathname = usePathname();
  // Antes esto derivaba el slug parseando el pathname ("/proyecto/slug/...")
  // — se rompía en el subdominio propio de un proyecto, donde el browser ve
  // "/edificio/..." sin ese prefijo (el rewrite que sí lo agrega es
  // invisible para usePathname()). basePath ya resuelve esto solo.
  const basePath = useProjectBasePath();
  const projectHref = basePath || '/';

  // Split and clean path segments — sirve igual con o sin el prefijo
  // /proyecto/slug: solo se busca dónde aparecen "edificio"/"unidad", no
  // en qué posición exacta.
  const segments = pathname.split('/').filter(Boolean);

  if (pathname === '/' || pathname === projectHref) return null;

  // Custom logic to parse /proyecto/[slug]/edificio/[id]/unidad/[unitId]
  const paths: { label: string; href: string }[] = [];

  // Home/Project
  paths.push({ label: projectName, href: projectHref });

  // Find building
  const buildingIndex = segments.indexOf('edificio');
  if (buildingIndex !== -1 && segments.length > buildingIndex + 1) {
    paths.push({
      label: buildingLabel + ' ' + segments[buildingIndex + 1].toUpperCase(),
      href: `${basePath}/edificio/${segments[buildingIndex + 1]}`
    });
  }

  // Find unit
  const unitIndex = segments.indexOf('unidad');
  if (unitIndex !== -1 && segments.length > unitIndex + 1) {
    paths.push({
      label: unitLabel + ' ' + segments[unitIndex + 1].toUpperCase(),
      href: pathname
    });
  }

  if (paths.length <= 1) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-200/50 max-w-[calc(100vw-2.5rem)] overflow-x-auto"
    >
      {paths.map((path, index) => (
        <div key={path.href} className="flex items-center">
          {index > 0 && (
            <svg className="w-4 h-4 mx-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
          {index === paths.length - 1 ? (
            <span className="text-sm font-semibold text-gray-900 tracking-wide">
              {path.label}
            </span>
          ) : (
            <TransitionLink 
              href={path.href}
              className="text-sm font-medium text-gray-500 hover:text-brand-500 transition-colors tracking-wide"
            >
              {path.label}
            </TransitionLink>
          )}
        </div>
      ))}
    </motion.div>
  );
}
