import type { Project, ThemeConfig, Unit } from '@/types';
import type { ProjectTypeConfig } from './project-types';

const SAMPLE_IMAGES = [
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80',
];

const SAMPLE_UNITS: Unit[] = [
  {
    id: '1A',
    dbId: 'sample-u1',
    floorId: 'sample-f1',
    buildingId: 'sample-b1',
    floor: 1,
    name: '1A',
    type: '2 dormitorios',
    modelName: 'Tipología A · 2 Ambientes',
    bedrooms: 1,
    bathrooms: 1,
    hasServiceRoom: false,
    floorsCount: 1,
    livingRooms: 1,
    garageSpaces: 0,
    totalArea: 58,
    innerArea: 50,
    balconyArea: 8,
    externalArea: 0,
    price: 145000,
    currency: 'USD',
    status: 'available',
    interiorImageUrl: SAMPLE_IMAGES[0],
  },
  {
    id: '2B',
    dbId: 'sample-u2',
    floorId: 'sample-f1',
    buildingId: 'sample-b1',
    floor: 2,
    name: '2B',
    type: '2 dormitorios',
    modelName: 'Tipología B · 3 Ambientes',
    bedrooms: 2,
    bathrooms: 2,
    hasServiceRoom: false,
    floorsCount: 1,
    livingRooms: 1,
    garageSpaces: 1,
    totalArea: 86,
    innerArea: 74,
    balconyArea: 12,
    externalArea: 0,
    price: 215000,
    currency: 'USD',
    status: 'available',
    interiorImageUrl: SAMPLE_IMAGES[1],
  },
  {
    id: 'PH',
    dbId: 'sample-u3',
    floorId: 'sample-f2',
    buildingId: 'sample-b1',
    floor: 10,
    name: 'PH',
    type: 'penthouse',
    modelName: 'Penthouse · Terraza propia',
    bedrooms: 3,
    bathrooms: 3,
    hasServiceRoom: true,
    floorsCount: 1,
    livingRooms: 1,
    garageSpaces: 2,
    totalArea: 138,
    innerArea: 108,
    balconyArea: 0,
    externalArea: 30,
    price: 345000,
    currency: 'USD',
    status: 'reserved',
    interiorImageUrl: SAMPLE_IMAGES[2],
  },
];

/**
 * Completa SOLO los campos vacíos de una copia del proyecto para la vista
 * previa comparativa de webs en /admin/sitio. Así, si el usuario todavía no
 * cargó FAQ, calidades, amenities o unidades —e incluso si mira secciones
 * ocultas— ve cómo luce cada componente sin esperar a cargar todo.
 */
export function withPreviewSampleData(project: Project, typeConfig: ProjectTypeConfig): {
  project: Project;
  usedSample: boolean;
} {
  let usedSample = false;
  const pick = <T,>(hasReal: boolean, realVal: T, sampleVal: T): T => {
    if (hasReal) return realVal;
    usedSample = true;
    return sampleVal;
  };

  const tc: ThemeConfig = project.themeConfig ?? {};
  const hasFaq = (tc.faqItems?.some(f => f.question.trim() && f.answer.trim())) ?? false;
  const hasQualities = (tc.qualitiesItems?.some(q => q.category.trim() && q.detail.trim())) ?? false;
  const hasHighlights = (tc.highlightsItems?.some(h => h.kicker.trim() && h.title.trim())) ?? false;
  const hasPaymentPlan = (tc.paymentPlanItems?.some(p => p.label.trim() && p.value.trim())) ?? false;
  const hasVideo = Boolean(tc.videoBlock?.url?.trim());

  const mergedThemeConfig: ThemeConfig = {
    ...tc,
    faqItems: pick(hasFaq, tc.faqItems, [
      { question: '¿Cuál es la forma de pago y financiación?', answer: 'Podés reservar con un anticipo y financiar el saldo durante el avance de obra en cuotas.' },
      { question: '¿Cuándo es la fecha estimada de entrega?', answer: 'La entrega de unidades está prevista para el último trimestre de 2027.' },
      { question: '¿Incluye cocheras o bauleras?', answer: 'Disponibles como opcionales en subsuelo con acceso automatizado.' },
    ]),
    qualitiesItems: pick(hasQualities, tc.qualitiesItems, [
      { category: 'Aberturas', detail: 'Carpintería de PVC con doble vidrio hermético (DVH) en todos los ambientes.' },
      { category: 'Climatización', detail: 'Preinstalación de aire acondicionado multisplit y calefacción por piso radiante.' },
      { category: 'Cocina y baños', detail: 'Mesadas de cuarzo, griferías monocomando y amoblamientos completos.' },
      { category: 'Pisos', detail: 'Porcelanato de gran formato en estar y madera ingeniería en dormitorios.' },
    ]),
    highlightsItems: pick(hasHighlights, tc.highlightsItems, [
      { kicker: 'Ubicación', title: 'Entorno consolidado', detail: 'A pasos de parques, transporte y polo gastronómico.' },
      { kicker: 'Eficiencia', title: 'Aislación térmica DVH', detail: 'Menor consumo energético y máximo confort acústico.' },
      { kicker: 'Inversión', title: 'Alta demanda de alquiler', detail: 'Unidades versátiles pensadas para renta o vivienda.' },
      { kicker: 'Financiación', title: 'Cuotas durante la obra', detail: 'Esquema flexible adaptado al avance del proyecto.' },
    ]),
    paymentPlanItems: pick(hasPaymentPlan, tc.paymentPlanItems, [
      { label: 'Reserva', value: 'USD 3.000', note: 'Bloquea unidad y valor' },
      { label: 'Boleto', value: '30%', note: 'A la firma' },
      { label: 'Cuotas', value: '24 cuotas', note: 'Durante la construcción' },
      { label: 'Posesión', value: 'Saldo', note: 'Contra entrega de llaves' },
    ]),
    paymentPlanNote: tc.paymentPlanNote || 'Ejemplo ilustrativo de financiación editable desde el panel.',
    videoBlock: pick(hasVideo, tc.videoBlock, {
      title: 'Recorrido audiovisual de muestra',
      url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
      caption: 'Ejemplo de video integrado (YouTube, Vimeo o MP4).',
    }),
  };

  const sampleAmenities = [
    { id: 'sa-1', name: 'Rooftop & Solárium', description: 'Terraza panorámica con piscina, deck y sector de livings al aire libre.', images: [SAMPLE_IMAGES[0]], category: 'Aire libre', specs: [], location: 'Azotea' },
    { id: 'sa-2', name: 'Gimnasio equipado', description: 'Espacio vidriado con máquinas de cardio y musculación.', images: [SAMPLE_IMAGES[1]], category: 'Bienestar', specs: [], location: 'Piso 2' },
    { id: 'sa-3', name: 'SUM Gourmet', description: 'Salón de usos múltiples con parrilla equipada para eventos privados.', images: [SAMPLE_IMAGES[2]], category: 'Social', specs: [], location: 'Planta Baja' },
  ];

  const samplePois = [
    { id: 'sp-1', name: 'Parque Central', category: 'entretenimiento' as const, distanceLabel: '4 min caminando', walkMinutes: 4, image: SAMPLE_IMAGES[0] },
    { id: 'sp-2', name: 'Estación de Transporte', category: 'transporte' as const, distanceLabel: '6 min caminando', walkMinutes: 6, image: SAMPLE_IMAGES[3] },
    { id: 'sp-3', name: 'Paseo Comercial', category: 'comercio' as const, distanceLabel: '3 min caminando', walkMinutes: 3, image: SAMPLE_IMAGES[2] },
  ];

  const sampleAerials = [
    { id: 'sl-1', imageUrl: project.masterplanImage || SAMPLE_IMAGES[3], label: 'Vista principal', hotspots: [] },
    { id: 'sl-2', imageUrl: SAMPLE_IMAGES[0], label: 'Frente', hotspots: [] },
    { id: 'sl-3', imageUrl: SAMPLE_IMAGES[1], label: 'Interior', hotspots: [] },
    { id: 'sl-4', imageUrl: SAMPLE_IMAGES[2], label: 'Terraza', hotspots: [] },
  ];

  const filled: Project = {
    ...project,
    tagline: pick(Boolean(project.tagline?.trim()), project.tagline, 'Arquitectura pensada para vivir y disfrutar'),
    location: pick(Boolean(project.location?.trim()), project.location, 'Palermo, Buenos Aires'),
    description: pick(
      Boolean(project.description?.trim()),
      project.description,
      'Un proyecto que equilibra diseño contemporáneo, amplitud espacial y luz natural en cada ambiente.\n\nPensado con materiales nobles, bajas expensas y áreas comunes diseñadas para extender tu hogar todos los días.'
    ),
    masterplanImage: pick(Boolean(project.masterplanImage?.trim()), project.masterplanImage, SAMPLE_IMAGES[3]),
    aerialSlides: pick(project.aerialSlides.length >= 3, project.aerialSlides, sampleAerials),
    units: pick(project.units.length > 0, project.units, typeConfig.saleMode === 'showcase' ? SAMPLE_UNITS.slice(0, 2) : SAMPLE_UNITS),
    amenities: pick(project.amenities.some(a => a.images.length > 0), project.amenities, sampleAmenities),
    pointsOfInterest: pick(project.pointsOfInterest.some(p => p.image), project.pointsOfInterest, samplePois),
    collaborators: pick(project.collaborators.length > 0, project.collaborators, [
      { handle: 'estudio', displayName: 'Estudio Arquitectura', contribution: 'Proyecto y dirección' },
      { handle: 'estructura', displayName: 'Ing. Estructural', contribution: 'Cálculo y hormigón' },
    ]),
    beforeAfter: pick(project.beforeAfter.length > 0, project.beforeAfter, [
      { label: 'Fachada', beforeImage: SAMPLE_IMAGES[3], afterImage: SAMPLE_IMAGES[0] },
    ]),
    processGallery: pick(project.processGallery.length > 0, project.processGallery, SAMPLE_IMAGES),
    constructionProgress: pick(
      Boolean(project.constructionProgress),
      project.constructionProgress,
      {
        stages: [
          { id: 's1', label: 'Estructura', from: '2026-01-01', to: '2026-06-30' },
          { id: 's2', label: 'Albañilería', from: '2026-07-01', to: '2027-02-28' },
          { id: 's3', label: 'Terminaciones', from: '2027-03-01', to: '2027-11-30' },
        ],
        currentStageId: 's2',
        percent: 58,
        deliveryEstimate: 'Diciembre 2027',
        updates: [],
      }
    ),
    commonAreasTour: project.commonAreasTour ?? {
      initialNodeId: 'sample-hall',
      nodes: [{ id: 'sample-hall', name: 'Hall principal', imageUrl: SAMPLE_IMAGES[3] }],
    },
    themeConfig: mergedThemeConfig,
  };

  return { project: filled, usedSample };
}
