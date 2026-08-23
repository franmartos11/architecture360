import type { ComponentType } from 'react';
import type { SectionKey } from '@/lib/project-sections';
import type { SectionProps } from './types';
import AboutSection from './AboutSection';
import BeforeAfterSection from './BeforeAfterSection';
import ProcessSection from './ProcessSection';
import TeamSection from './TeamSection';
import AmenitiesSection from './AmenitiesSection';
import MasterplanCtaSection from './MasterplanCtaSection';
import TypologiesSection from './TypologiesSection';
import LocationSection from './LocationSection';
import CalculatorSection from './CalculatorSection';
import ContactSection from './ContactSection';

// Un solo lugar donde key → componente — lo usa tanto la landing pública
// (app/proyecto/[slug]/page.tsx) como la vista previa en vivo del admin
// (/admin/sitio), para que agregar una sección nueva al registro
// (lib/project-sections.ts) no obligue a actualizar el mapeo en dos
// lugares distintos.
export const SECTION_COMPONENTS: Record<SectionKey, ComponentType<SectionProps>> = {
  about: AboutSection,
  before_after: BeforeAfterSection,
  process: ProcessSection,
  team: TeamSection,
  amenities: AmenitiesSection,
  masterplan: MasterplanCtaSection,
  typologies: TypologiesSection,
  location: LocationSection,
  calculator: CalculatorSection,
  contact: ContactSection,
};
