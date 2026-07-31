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
      className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-200/50"
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
