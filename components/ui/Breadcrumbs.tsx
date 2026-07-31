'use client';

import { usePathname } from 'next/navigation';
import { TransitionLink } from '@/components/ui/TransitionUtils';
import { m as motion } from 'framer-motion';

export default function Breadcrumbs({ projectName = "Residencias del Mar" }) {
  const pathname = usePathname();
  
  if (pathname === '/' || pathname === '/proyecto/demo') return null;

  // Split and clean path segments
  const segments = pathname.split('/').filter(Boolean);
  
  // Custom logic to parse /proyecto/[slug]/edificio/[id]/unidad/[unitId]
  const paths: { label: string; href: string }[] = [];
  
  // Home/Project
  paths.push({ label: projectName, href: '/proyecto/demo' });
  
  // Find building
  const buildingIndex = segments.indexOf('edificio');
  if (buildingIndex !== -1 && segments.length > buildingIndex + 1) {
    paths.push({ 
      label: 'Torre ' + segments[buildingIndex + 1].toUpperCase(), 
      href: `/proyecto/demo/edificio/${segments[buildingIndex + 1]}` 
    });
  }
  
  // Find unit
  const unitIndex = segments.indexOf('unidad');
  if (unitIndex !== -1 && segments.length > unitIndex + 1) {
    paths.push({ 
      label: 'Unidad ' + segments[unitIndex + 1].toUpperCase(), 
      href: pathname 
    });
  }

  if (paths.length <= 1) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <nav className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl shadow-lg border border-white/10" aria-label="Breadcrumb">
        {paths.map((path, index) => (
          <div key={path.href} className="flex items-center">
            {index > 0 && (
              <svg className="w-4 h-4 text-slate-500 mx-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            {index === paths.length - 1 ? (
              <span className="text-sm font-bold text-white truncate max-w-[150px] sm:max-w-none" aria-current="page">
                {path.label}
              </span>
            ) : (
              <TransitionLink 
                href={path.href}
                className="text-sm font-medium text-slate-300 hover:text-white hover:underline transition-colors max-w-[120px] sm:max-w-none truncate"
              >
                {path.label}
              </TransitionLink>
            )}
          </div>
        ))}
      </nav>
    </motion.div>
  );
}
