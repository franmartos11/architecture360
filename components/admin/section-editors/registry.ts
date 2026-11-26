import type { ComponentType } from 'react';
import type { SectionKey } from '@/lib/project-sections';
import AboutEditor from './AboutEditor';
import BeforeAfterEditor from './BeforeAfterEditor';
import ProcessEditor from './ProcessEditor';
import TeamEditor from './TeamEditor';
import AmenitiesEditor from './AmenitiesEditor';
import MasterplanEditor from './MasterplanEditor';
import LocationEditor from './LocationEditor';
import CalculatorEditor from './CalculatorEditor';
import ConstructionProgressEditor from './ConstructionProgressEditor';
import QualitiesEditor from './QualitiesEditor';
import VideoEditor from './VideoEditor';
import FaqEditor from './FaqEditor';
import PaymentPlanEditor from './PaymentPlanEditor';
import HighlightsEditor from './HighlightsEditor';

export interface SectionEditorProps {
  onSaved: () => void;
}

// Secciones que se pueden editar sin salir de /admin/sitio — 'typologies'
// (tabla de inventario completa, más el armador de plantas en proyectos
// con pisos) y 'contact' (sin copy propio) quedan afuera a propósito, ver
// lib/project-sections.ts:sectionEditHref.
export const SECTION_EDITORS: Partial<Record<SectionKey, ComponentType<SectionEditorProps>>> = {
  about: AboutEditor,
  before_after: BeforeAfterEditor,
  process: ProcessEditor,
  team: TeamEditor,
  amenities: AmenitiesEditor,
  masterplan: MasterplanEditor,
  location: LocationEditor,
  calculator: CalculatorEditor,
  progress: ConstructionProgressEditor,
  qualities: QualitiesEditor,
  video: VideoEditor,
  faq: FaqEditor,
  payment_plan: PaymentPlanEditor,
  highlights: HighlightsEditor,
};
