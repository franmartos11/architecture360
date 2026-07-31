import type { Project, Unit, Building, Floor } from '@/types';

// ─── Gallery images shared across all units ───────────────────────
const GALLERY = [
  '/units/gallery-1.png', '/units/gallery-2.png', '/units/gallery-3.png', '/units/gallery-4.png',
  '/units/gallery-1.png', '/units/gallery-2.png', '/units/gallery-3.png', '/units/gallery-4.png',
  '/units/gallery-1.png', '/units/gallery-2.png', '/units/gallery-3.png', '/units/gallery-4.png'
];

// ─── Units ────────────────────────────────────────────────────────
const units: Unit[] = [
  // Building A — Floor 1
  { id: 'A01-01', name: 'A01-01', modelName: 'SUITE GARDEN', buildingId: 'torre-a', floor: 1, type: '1 dormitorio', totalArea: 68, innerArea: 58, balconyArea: 10, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'N' },
  { id: 'A01-02', name: 'A01-02', modelName: 'DUET GARDEN', buildingId: 'torre-a', floor: 1, type: '2 dormitorios', totalArea: 96, innerArea: 82, balconyArea: 14, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'reserved', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'S' },
  { id: 'A01-03', name: 'A01-03', modelName: 'TRIO PLUS', buildingId: 'torre-a', floor: 1, type: '3 dormitorios', totalArea: 132, innerArea: 115, balconyArea: 17, externalArea: 0, bedrooms: 3, bathrooms: 2.5, hasServiceRoom: true, status: 'sold', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'E' },
  { id: 'A01-04', name: 'A01-04', modelName: 'SUITE CORNER', buildingId: 'torre-a', floor: 1, type: '1 dormitorio', totalArea: 72, innerArea: 62, balconyArea: 10, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'O' },
  { id: 'A01-05', name: 'A01-05', modelName: 'DUET JARDIN', buildingId: 'torre-a', floor: 1, type: '2 dormitorios', totalArea: 106, innerArea: 89, balconyArea: 7.45, externalArea: 18.99, bedrooms: 2, bathrooms: 2.5, hasServiceRoom: true, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'NE' },
  { id: 'A01-06', name: 'A01-06', modelName: 'DUET VISTA', buildingId: 'torre-a', floor: 1, type: '2 dormitorios', totalArea: 98, innerArea: 84, balconyArea: 14, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'reserved', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'NO' },
  { id: 'A01-07', name: 'A01-07', modelName: 'MONO STUDIO', buildingId: 'torre-a', floor: 1, type: 'monoambiente', totalArea: 45, innerArea: 38, balconyArea: 7, externalArea: 0, bedrooms: 0, bathrooms: 1, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'SE' },
  { id: 'A01-08', name: 'A01-08', modelName: 'DUET POOL', buildingId: 'torre-a', floor: 1, type: '2 dormitorios', totalArea: 102, innerArea: 88, balconyArea: 14, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'sold', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'SO' },

  // Building A — Floor 2
  { id: 'A02-01', name: 'A02-01', modelName: 'SUITE GARDEN', buildingId: 'torre-a', floor: 2, type: '1 dormitorio', totalArea: 68, innerArea: 58, balconyArea: 10, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'N' },
  { id: 'A02-02', name: 'A02-02', modelName: 'DUET GARDEN', buildingId: 'torre-a', floor: 2, type: '2 dormitorios', totalArea: 96, innerArea: 82, balconyArea: 14, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'sold', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'S' },
  { id: 'A02-03', name: 'A02-03', modelName: 'TRIO PLUS', buildingId: 'torre-a', floor: 2, type: '3 dormitorios', totalArea: 132, innerArea: 115, balconyArea: 17, externalArea: 0, bedrooms: 3, bathrooms: 2.5, hasServiceRoom: true, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'E' },

  // Building B — Floor 1
  { id: 'B01-01', name: 'B01-01', modelName: 'SUITE PREMIUM', buildingId: 'torre-b', floor: 1, type: '1 dormitorio', totalArea: 70, innerArea: 60, balconyArea: 10, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'O' },
  { id: 'B01-02', name: 'B01-02', modelName: 'DUET SKY', buildingId: 'torre-b', floor: 1, type: '2 dormitorios', totalArea: 110, innerArea: 94, balconyArea: 16, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: true, status: 'reserved', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'NE' },
  { id: 'B01-03', name: 'B01-03', modelName: 'PENTHOUSE VISTA', buildingId: 'torre-b', floor: 1, type: 'penthouse', totalArea: 220, innerArea: 180, balconyArea: 40, externalArea: 0, bedrooms: 3, bathrooms: 3.5, hasServiceRoom: true, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'NO' },

  // Building C — Floor 1
  { id: 'C01-01', name: 'C01-01', modelName: 'STUDIO GARDEN', buildingId: 'torre-c', floor: 1, type: 'monoambiente', totalArea: 42, innerArea: 36, balconyArea: 6, externalArea: 0, bedrooms: 0, bathrooms: 1, hasServiceRoom: false, status: 'sold', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'SE' },
  { id: 'C01-02', name: 'C01-02', modelName: 'DUET PARK', buildingId: 'torre-c', floor: 1, type: '2 dormitorios', totalArea: 92, innerArea: 78, balconyArea: 14, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1.png', galleryImages: GALLERY, orientation: 'SO' },
];

// ─── Floor plan unit dot positions (% on floor-1.png) ────────────
// These are approximate positions matching the X-shaped floor plan
const floorADots = [
  { unitId: 'A01-01', x: 15, y: 35 },
  { unitId: 'A01-02', x: 30, y: 22 },
  { unitId: 'A01-03', x: 70, y: 22 },
  { unitId: 'A01-04', x: 83, y: 35 },
  { unitId: 'A01-05', x: 50, y: 55 },
  { unitId: 'A01-06', x: 65, y: 68 },
  { unitId: 'A01-07', x: 35, y: 68 },
  { unitId: 'A01-08', x: 22, y: 60 },
];

const floorA2Dots = [
  { unitId: 'A02-01', x: 15, y: 35 },
  { unitId: 'A02-02', x: 30, y: 22 },
  { unitId: 'A02-03', x: 70, y: 22 },
];

// ─── Buildings ────────────────────────────────────────────────────
const buildings: Building[] = [
  {
    id: 'torre-a',
    name: 'Torre A',
    totalFloors: 15,
    floors: [
      { number: 0, label: 'L', planImage: '/floorplans/floor-1.png', unitDots: [] },
      { number: 1, label: 'Planta 1', planImage: '/floorplans/floor-1.png', unitDots: floorADots },
      { number: 2, label: 'Planta 2', planImage: '/floorplans/floor-1.png', unitDots: floorA2Dots },
      { number: 3, label: 'Planta 3', planImage: '/floorplans/floor-1.png', unitDots: floorADots.map(d => ({ ...d, unitId: d.unitId.replace('01', '03') })) },
      ...Array.from({ length: 11 }, (_, i) => ({
        number: i + 4,
        label: `Planta ${i + 4}`,
        planImage: '/floorplans/floor-1.png',
        unitDots: floorADots.map(d => ({ ...d, unitId: d.unitId.replace('01', String(i + 4).padStart(2, '0')) })),
      })),
    ],
  },
  {
    id: 'torre-b',
    name: 'Torre B',
    totalFloors: 12,
    floors: [
      { number: 1, label: 'Planta 1', planImage: '/floorplans/floor-1.png', unitDots: [
        { unitId: 'B01-01', x: 25, y: 40 },
        { unitId: 'B01-02', x: 55, y: 30 },
        { unitId: 'B01-03', x: 72, y: 55 },
      ]},
      ...Array.from({ length: 11 }, (_, i) => ({
        number: i + 2,
        label: `Planta ${i + 2}`,
        planImage: '/floorplans/floor-1.png',
        unitDots: [
          { unitId: `B0${i+2}-01`, x: 25, y: 40 },
          { unitId: `B0${i+2}-02`, x: 55, y: 30 },
        ],
      })),
    ],
  },
  {
    id: 'torre-c',
    name: 'Torre C',
    totalFloors: 10,
    floors: [
      { number: 1, label: 'Planta 1', planImage: '/floorplans/floor-1.png', unitDots: [
        { unitId: 'C01-01', x: 35, y: 45 },
        { unitId: 'C01-02', x: 62, y: 38 },
      ]},
      ...Array.from({ length: 9 }, (_, i) => ({
        number: i + 2,
        label: `Planta ${i + 2}`,
        planImage: '/floorplans/floor-1.png',
        unitDots: [
          { unitId: `C0${i+2}-01`, x: 35, y: 45 },
        ],
      })),
    ],
  },
];

// ─── Project ──────────────────────────────────────────────────────
export const demoProject: Project = {
  id: 'trevo-1',
  slug: 'demo',
  name: 'TREVO Desarrollo',
  description: 'Un concepto innovador de residencias con vistas panorámicas y amenities de primer nivel.',
  location: 'Punta del Este, Uruguay',
  masterplanImage: '/masterplan/render-exterior.png',
  aerialSlides: [
    {
      id: 'slide-1',
      imageUrl: '/aerial/view-1.png',
      label: 'Vista Suroeste',
      hotspots: [
        { buildingId: 'torre-a', x: 28, y: 42 },
        { buildingId: 'torre-b', x: 48, y: 38 },
        { buildingId: 'torre-c', x: 65, y: 50 },
      ],
    },
    {
      id: 'slide-2',
      imageUrl: '/aerial/view-2.png',
      label: 'Vista Norte',
      hotspots: [
        { buildingId: 'torre-a', x: 32, y: 55 },
        { buildingId: 'torre-b', x: 50, y: 45 },
        { buildingId: 'torre-c', x: 68, y: 42 },
      ],
    },
    {
      id: 'slide-3',
      imageUrl: '/aerial/view-3.png',
      label: 'Vista Este',
      hotspots: [
        { buildingId: 'torre-a', x: 22, y: 48 },
        { buildingId: 'torre-b', x: 50, y: 40 },
        { buildingId: 'torre-c', x: 74, y: 46 },
      ],
    },
    {
      id: 'slide-4',
      imageUrl: '/aerial/view-4.png',
      label: 'Vista Aérea',
      hotspots: [
        { buildingId: 'torre-a', x: 26, y: 40 },
        { buildingId: 'torre-b', x: 52, y: 35 },
        { buildingId: 'torre-c', x: 70, y: 42 },
      ],
    },
  ],
  buildings,
  units,
  amenities: ['Piscina infinita', 'Gimnasio equipado', 'Cancha de tenis', 'SUM', 'Seguridad 24hs', 'Cocheras cubiertas', 'Jardines', 'Área de parrillas'],
};

// ─── Helpers (simulating API) ─────────────────────────────────────
export function getProjectBySlug(slug: string): Project | undefined {
  if (slug === 'demo') return demoProject;
  return undefined;
}

export function getBuildingById(slug: string, buildingId: string): Building | undefined {
  return getProjectBySlug(slug)?.buildings.find(b => b.id === buildingId);
}

export function getUnitById(unitId: string): Unit | undefined {
  return units.find(u => u.id === unitId);
}

export function getUnitsByBuildingAndFloor(buildingId: string, floor: number): Unit[] {
  return units.filter(u => u.buildingId === buildingId && u.floor === floor);
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
}

export function getStatusLabel(status: string): string {
  return { available: 'Disponible para vender', reserved: 'Reservado', sold: 'Vendido' }[status] || status;
}

export function getStatusColor(status: string): string {
  return { available: '#22c55e', reserved: '#eab308', sold: '#ef4444' }[status] || '#94a3b8';
}
