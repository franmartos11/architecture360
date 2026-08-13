import type { Project, Unit, Building, Floor, Room, TourData } from '@/types';

// ─── Gallery images shared across all units ───────────────────────
const GALLERY = [
  '/units/gallery-1.png', '/units/gallery-2.png', '/units/gallery-3.png', '/units/gallery-4.png',
  '/units/gallery-1.png', '/units/gallery-2.png', '/units/gallery-3.png', '/units/gallery-4.png',
  '/units/gallery-1.png', '/units/gallery-2.png', '/units/gallery-3.png', '/units/gallery-4.png'
];

// ─── Polígonos de deptos sobre el render isométrico original ───────
// (% sobre /floorplans/floor-1-render.png — zonas aproximadas alrededor
// de cada punto/píldora, trazadas a ojo sobre las alas del edificio)
const torreA01Polygons: Record<string, { x: number; y: number }[]> = {
  'A01-01': [{ x: 5, y: 24 }, { x: 26, y: 24 }, { x: 26, y: 46 }, { x: 5, y: 46 }],
  'A01-02': [{ x: 27, y: 6 }, { x: 50, y: 6 }, { x: 50, y: 26 }, { x: 27, y: 26 }],
  'A01-03': [{ x: 50, y: 6 }, { x: 73, y: 6 }, { x: 73, y: 26 }, { x: 50, y: 26 }],
  'A01-04': [{ x: 74, y: 24 }, { x: 95, y: 24 }, { x: 95, y: 46 }, { x: 74, y: 46 }],
  'A01-08': [{ x: 5, y: 48 }, { x: 28, y: 48 }, { x: 28, y: 68 }, { x: 5, y: 68 }],
  'A01-07': [{ x: 29, y: 58 }, { x: 50, y: 58 }, { x: 50, y: 78 }, { x: 29, y: 78 }],
  'A01-05': [{ x: 40, y: 46 }, { x: 63, y: 46 }, { x: 63, y: 66 }, { x: 40, y: 66 }],
  'A01-06': [{ x: 55, y: 58 }, { x: 78, y: 58 }, { x: 78, y: 80 }, { x: 55, y: 80 }],
};

// ─── Ambientes delimitados de la unidad demo A01-01 (SUITE GARDEN) ─
// (% sobre /floorplans/demo-unit-a0101-rooms.svg)
const a0101Rooms: Room[] = [
  { id: 'entrada', name: 'Hall de Entrada', tourNodeId: 'entrada', polygon: [{ x: 0, y: 35 }, { x: 18, y: 35 }, { x: 18, y: 65 }, { x: 0, y: 65 }] },
  { id: 'living', name: 'Living Comedor', tourNodeId: 'living', polygon: [{ x: 18, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 100 }, { x: 18, y: 100 }] },
  { id: 'cocina', name: 'Cocina', tourNodeId: 'cocina', polygon: [{ x: 60, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 38 }, { x: 60, y: 38 }] },
  { id: 'dormitorio', name: 'Dormitorio', tourNodeId: 'dormitorio', polygon: [{ x: 60, y: 38 }, { x: 84, y: 38 }, { x: 84, y: 100 }, { x: 60, y: 100 }] },
  { id: 'bano', name: 'Baño', tourNodeId: 'bano', polygon: [{ x: 84, y: 38 }, { x: 100, y: 38 }, { x: 100, y: 72 }, { x: 84, y: 72 }] },
  { id: 'balcon', name: 'Balcón', tourNodeId: 'balcon', polygon: [{ x: 84, y: 72 }, { x: 100, y: 72 }, { x: 100, y: 100 }, { x: 84, y: 100 }] },
];

// ─── Tour 360° room-a-room de la unidad demo A01-01 ────────────────
const a0101TourData: TourData = {
  initialNodeId: 'entrada',
  nodes: [
    {
      id: 'entrada', name: 'Hall de Entrada', imageUrl: '/tours/demo/entrada.svg',
      initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
      linkHotspots: [{ yaw: 0, pitch: -0.1, targetNodeId: 'living', targetYaw: 3.14, targetPitch: 0, label: 'Ir al Living' }],
    },
    {
      id: 'living', name: 'Living Comedor', imageUrl: '/tours/demo/living.svg',
      initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
      linkHotspots: [
        { yaw: 3.14, pitch: -0.1, targetNodeId: 'entrada', targetYaw: 0, targetPitch: 0, label: 'Volver al Hall' },
        { yaw: 1.2, pitch: -0.1, targetNodeId: 'cocina', targetYaw: 3.14, targetPitch: 0, label: 'Ir a la Cocina' },
        { yaw: -1.2, pitch: -0.1, targetNodeId: 'dormitorio', targetYaw: 0, targetPitch: 0, label: 'Ir al Dormitorio' },
        { yaw: 2.4, pitch: -0.05, targetNodeId: 'balcon', targetYaw: 3.14, targetPitch: 0, label: 'Ir al Balcón' },
      ],
      infoHotspots: [{ yaw: -0.5, pitch: -0.2, title: 'Terminaciones', description: 'Pisos de porcelanato símil madera, carpintería de aluminio negro' }],
    },
    {
      id: 'cocina', name: 'Cocina', imageUrl: '/tours/demo/cocina.svg',
      initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
      linkHotspots: [{ yaw: 3.14, pitch: -0.1, targetNodeId: 'living', targetYaw: 1.2, targetPitch: 0, label: 'Volver al Living' }],
      infoHotspots: [{ yaw: 0.3, pitch: -0.15, title: 'Cocina', description: 'Bajo mesada en cuarzo, muebles a medida' }],
    },
    {
      id: 'dormitorio', name: 'Dormitorio', imageUrl: '/tours/demo/dormitorio.svg',
      initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
      linkHotspots: [
        { yaw: 3.14, pitch: -0.1, targetNodeId: 'living', targetYaw: -1.2, targetPitch: 0, label: 'Volver al Living' },
        { yaw: 1.0, pitch: -0.1, targetNodeId: 'bano', targetYaw: 3.14, targetPitch: 0, label: 'Ir al Baño' },
      ],
      infoHotspots: [{ yaw: -0.6, pitch: -0.15, title: 'Dormitorio', description: 'Placard empotrado a medida, ventana con doble vidriado' }],
    },
    {
      id: 'bano', name: 'Baño', imageUrl: '/tours/demo/bano.svg',
      initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
      linkHotspots: [{ yaw: 3.14, pitch: -0.1, targetNodeId: 'dormitorio', targetYaw: 1.0, targetPitch: 0, label: 'Volver al Dormitorio' }],
      infoHotspots: [{ yaw: 0.4, pitch: -0.15, title: 'Baño', description: 'Grifería monocomando, revestimiento porcelánico' }],
    },
    {
      id: 'balcon', name: 'Balcón', imageUrl: '/tours/demo/balcon.svg',
      initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
      linkHotspots: [{ yaw: 3.14, pitch: -0.1, targetNodeId: 'living', targetYaw: 2.4, targetPitch: 0, label: 'Volver al Living' }],
      infoHotspots: [{ yaw: 0, pitch: -0.1, title: 'Balcón terraza', description: '10 m² con baranda de vidrio' }],
    },
  ],
};

// ─── Units ────────────────────────────────────────────────────────
const units: Unit[] = [
  // Building A — Floor 1
  { id: 'A01-01', name: 'A01-01', modelName: 'SUITE GARDEN', buildingId: 'torre-a', floor: 1, type: '1 dormitorio', totalArea: 68, innerArea: 58, balconyArea: 10, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg',
    polygon: torreA01Polygons['A01-01'],
    roomPlanImage: '/floorplans/demo-unit-a0101-rooms.svg',
    rooms: a0101Rooms,
    tourImageUrl: '/tours/demo/living.svg',
    tourData: a0101TourData,
    floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/demo-unit-a0101-rooms.svg', galleryImages: GALLERY, orientation: 'N' },
  { id: 'A01-02', name: 'A01-02', modelName: 'DUET GARDEN', buildingId: 'torre-a', floor: 1, type: '2 dormitorios', totalArea: 96, innerArea: 82, balconyArea: 14, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'reserved', interiorImageUrl: '/units/interior-1.jpg', polygon: torreA01Polygons['A01-02'], tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'S' },
  { id: 'A01-03', name: 'A01-03', modelName: 'TRIO PLUS', buildingId: 'torre-a', floor: 1, type: '3 dormitorios', totalArea: 132, innerArea: 115, balconyArea: 17, externalArea: 0, bedrooms: 3, bathrooms: 2.5, hasServiceRoom: true, status: 'sold', interiorImageUrl: '/units/interior-1.jpg', polygon: torreA01Polygons['A01-03'], tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'E' },
  { id: 'A01-04', name: 'A01-04', modelName: 'SUITE CORNER', buildingId: 'torre-a', floor: 1, type: '1 dormitorio', totalArea: 72, innerArea: 62, balconyArea: 10, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', polygon: torreA01Polygons['A01-04'], tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'O' },
  { id: 'A01-05', name: 'A01-05', modelName: 'DUET JARDIN', buildingId: 'torre-a', floor: 1, type: '2 dormitorios', totalArea: 106, innerArea: 89, balconyArea: 7.45, externalArea: 18.99, bedrooms: 2, bathrooms: 2.5, hasServiceRoom: true, status: 'available', interiorImageUrl: '/units/interior-1.jpg', polygon: torreA01Polygons['A01-05'], tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'NE' },
  { id: 'A01-06', name: 'A01-06', modelName: 'DUET VISTA', buildingId: 'torre-a', floor: 1, type: '2 dormitorios', totalArea: 98, innerArea: 84, balconyArea: 14, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'reserved', interiorImageUrl: '/units/interior-1.jpg', polygon: torreA01Polygons['A01-06'], tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'NO' },
  { id: 'A01-07', name: 'A01-07', modelName: 'MONO STUDIO', buildingId: 'torre-a', floor: 1, type: 'monoambiente', totalArea: 45, innerArea: 38, balconyArea: 7, externalArea: 0, bedrooms: 0, bathrooms: 1, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', polygon: torreA01Polygons['A01-07'], tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'SE' },
  { id: 'A01-08', name: 'A01-08', modelName: 'DUET POOL', buildingId: 'torre-a', floor: 1, type: '2 dormitorios', totalArea: 102, innerArea: 88, balconyArea: 14, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'sold', interiorImageUrl: '/units/interior-1.jpg', polygon: torreA01Polygons['A01-08'], tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'SO' },

  // Building A — Floor 2
  { id: 'A02-01', name: 'A02-01', modelName: 'SUITE GARDEN', buildingId: 'torre-a', floor: 2, type: '1 dormitorio', totalArea: 68, innerArea: 58, balconyArea: 10, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'N' },
  { id: 'A02-02', name: 'A02-02', modelName: 'DUET GARDEN', buildingId: 'torre-a', floor: 2, type: '2 dormitorios', totalArea: 96, innerArea: 82, balconyArea: 14, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'sold', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'S' },
  { id: 'A02-03', name: 'A02-03', modelName: 'TRIO PLUS', buildingId: 'torre-a', floor: 2, type: '3 dormitorios', totalArea: 132, innerArea: 115, balconyArea: 17, externalArea: 0, bedrooms: 3, bathrooms: 2.5, hasServiceRoom: true, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'E' },

  // Building B — Floor 1
  { id: 'B01-01', name: 'B01-01', modelName: 'SUITE PREMIUM', buildingId: 'torre-b', floor: 1, type: '1 dormitorio', totalArea: 70, innerArea: 60, balconyArea: 10, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'O' },
  { id: 'B01-02', name: 'B01-02', modelName: 'DUET SKY', buildingId: 'torre-b', floor: 1, type: '2 dormitorios', totalArea: 110, innerArea: 94, balconyArea: 16, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: true, status: 'reserved', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'NE' },
  { id: 'B01-03', name: 'B01-03', modelName: 'PENTHOUSE VISTA', buildingId: 'torre-b', floor: 1, type: 'penthouse', totalArea: 220, innerArea: 180, balconyArea: 40, externalArea: 0, bedrooms: 3, bathrooms: 3.5, hasServiceRoom: true, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'NO' },

  // Building C — Floor 1
  { id: 'C01-01', name: 'C01-01', modelName: 'STUDIO GARDEN', buildingId: 'torre-c', floor: 1, type: 'monoambiente', totalArea: 42, innerArea: 36, balconyArea: 6, externalArea: 0, bedrooms: 0, bathrooms: 1, hasServiceRoom: false, status: 'sold', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'SE' },
  { id: 'C01-02', name: 'C01-02', modelName: 'DUET PARK', buildingId: 'torre-c', floor: 1, type: '2 dormitorios', totalArea: 92, innerArea: 78, balconyArea: 14, externalArea: 0, bedrooms: 2, bathrooms: 2, hasServiceRoom: false, status: 'available', interiorImageUrl: '/units/interior-1.jpg', tourImageUrl: '/tours/sample-pano.png', floorPlan3dUrl: '/floorplans/floor-1-render.png', plan3dUrl: '/floorplans/floor-1-3d.png', technicalPlanUrl: '/floorplans/floor-1-2d.png', galleryImages: GALLERY, orientation: 'SO' },
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
    amenitiesTour: {
      initialNodeId: 'cancha-tenis',
      nodes: [
        {
          id: 'cancha-tenis', name: 'Cancha de Tenis', imageUrl: '/tours/demo/jardines.svg',
          initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
          infoHotspots: [{ yaw: 0, pitch: -0.15, title: 'Cancha de tenis', description: 'Exclusiva de Torre A, superficie sintética' }],
        },
      ],
    },
    floors: [
      { number: 0, label: 'L', planImage: '/floorplans/floor-1-render.png', unitDots: [] },
      { number: 1, label: 'Planta 1', planImage: '/floorplans/floor-1-render.png', unitDots: floorADots },
      { number: 2, label: 'Planta 2', planImage: '/floorplans/floor-1-render.png', unitDots: floorA2Dots },
      { number: 3, label: 'Planta 3', planImage: '/floorplans/floor-1-render.png', unitDots: floorADots.map(d => ({ ...d, unitId: d.unitId.replace('01', '03') })) },
      ...Array.from({ length: 11 }, (_, i) => ({
        number: i + 4,
        label: `Planta ${i + 4}`,
        planImage: '/floorplans/floor-1-render.png',
        unitDots: floorADots.map(d => ({ ...d, unitId: d.unitId.replace('01', String(i + 4).padStart(2, '0')) })),
      })),
    ],
  },
  {
    id: 'torre-b',
    name: 'Torre B',
    totalFloors: 12,
    floors: [
      { number: 1, label: 'Planta 1', planImage: '/floorplans/floor-1-render.png', unitDots: [
        { unitId: 'B01-01', x: 25, y: 40 },
        { unitId: 'B01-02', x: 55, y: 30 },
        { unitId: 'B01-03', x: 72, y: 55 },
      ]},
      ...Array.from({ length: 11 }, (_, i) => ({
        number: i + 2,
        label: `Planta ${i + 2}`,
        planImage: '/floorplans/floor-1-render.png',
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
      { number: 1, label: 'Planta 1', planImage: '/floorplans/floor-1-render.png', unitDots: [
        { unitId: 'C01-01', x: 35, y: 45 },
        { unitId: 'C01-02', x: 62, y: 38 },
      ]},
      ...Array.from({ length: 9 }, (_, i) => ({
        number: i + 2,
        label: `Planta ${i + 2}`,
        planImage: '/floorplans/floor-1-render.png',
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
  latitude: -34.9497,
  longitude: -54.9522,
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
  amenities: [
    {
      id: 'amenity-pileta',
      name: 'Piscina infinita',
      description: 'Deck con reposeras y solárium, vista panorámica.',
      images: ['/aerial/view-1.png', '/aerial/view-2.png'],
      tourNodeId: 'pileta',
    },
    {
      id: 'amenity-gimnasio',
      name: 'Gimnasio equipado',
      description: 'Equipamiento cardio y de musculación.',
      images: ['/aerial/view-3.png'],
      tourNodeId: 'gimnasio',
    },
    {
      id: 'amenity-parrilla',
      name: 'Área de parrillas',
      description: 'Quincho techado con mesa para 8 personas.',
      images: ['/aerial/view-4.png'],
      tourNodeId: 'parrilla',
    },
    {
      id: 'amenity-jardines',
      name: 'Jardines',
      description: 'Espacios verdes de uso común entre las tres torres.',
      images: ['/aerial/view-1.png'],
      tourNodeId: 'jardines',
    },
    {
      id: 'amenity-sum',
      name: 'SUM',
      description: 'Salón de usos múltiples para eventos.',
      images: [],
    },
    {
      id: 'amenity-seguridad',
      name: 'Seguridad 24hs',
      description: 'Vigilancia y control de acceso permanente.',
      images: [],
    },
    {
      id: 'amenity-cocheras',
      name: 'Cocheras cubiertas',
      images: [],
    },
    {
      id: 'amenity-tenis',
      name: 'Cancha de tenis',
      description: 'Exclusiva de Torre A, superficie sintética.',
      images: ['/aerial/view-2.png'],
      buildingId: 'torre-a',
      tourNodeId: 'cancha-tenis',
    },
  ],
  pointsOfInterest: [
    {
      id: 'poi-colegio',
      name: 'Colegio Jules Verne',
      category: 'colegio',
      description: 'Bilingüe, a pasos del proyecto.',
      distanceLabel: '5 min caminando',
      image: '/aerial/view-1.png',
      latitude: -34.9469,
      longitude: -54.9511,
      walkMinutes: 5,
      driveMinutes: 2,
      bikeMinutes: 3,
    },
    {
      id: 'poi-salud',
      name: 'Clínica Punta del Este',
      category: 'salud',
      description: 'Emergencias y consultas 24hs.',
      distanceLabel: '8 min en auto',
      image: '/aerial/view-2.png',
      latitude: -34.9605,
      longitude: -54.9331,
      walkMinutes: 28,
      driveMinutes: 8,
      bikeMinutes: 14,
    },
    {
      id: 'poi-comercio',
      name: 'Punta Shopping',
      category: 'comercio',
      description: 'Centro comercial con supermercado y locales.',
      distanceLabel: '10 min en auto',
      image: '/aerial/view-3.png',
      latitude: -34.9058,
      longitude: -54.9295,
      walkMinutes: 45,
      driveMinutes: 10,
      bikeMinutes: 22,
    },
    {
      id: 'poi-club',
      name: 'Cantegril Country Club',
      category: 'entretenimiento',
      description: 'Golf, tenis y actividades sociales.',
      distanceLabel: '12 min en auto',
      image: '/aerial/view-4.png',
      latitude: -34.9276,
      longitude: -54.9425,
      walkMinutes: 38,
      driveMinutes: 12,
      bikeMinutes: 18,
    },
    {
      id: 'poi-playa',
      name: 'Playa Mansa',
      category: 'entretenimiento',
      description: 'Costanera, restoranes y paradores.',
      distanceLabel: '3 min caminando',
      latitude: -34.9557,
      longitude: -54.9482,
      walkMinutes: 3,
      driveMinutes: 1,
      bikeMinutes: 2,
    },
    {
      id: 'poi-transporte',
      name: 'Terminal de Ómnibus',
      category: 'transporte',
      description: 'Conexiones a Montevideo y balnearios cercanos.',
      distanceLabel: '15 min en auto',
      latitude: -34.9127,
      longitude: -54.9243,
      walkMinutes: 55,
      driveMinutes: 15,
      bikeMinutes: 28,
    },
  ],
  commonAreasTour: {
    initialNodeId: 'hall-ingreso',
    nodes: [
      {
        id: 'hall-ingreso', name: 'Hall de Ingreso', imageUrl: '/tours/demo/hall-ingreso.svg',
        initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
        linkHotspots: [{ yaw: 0, pitch: -0.1, targetNodeId: 'pasillo', targetYaw: 3.14, targetPitch: 0, label: 'Ir al Pasillo' }],
        infoHotspots: [{ yaw: -1.2, pitch: -0.15, title: 'Hall de Ingreso', description: 'Recepción con conserje 24hs' }],
      },
      {
        id: 'pasillo', name: 'Pasillo Planta 1', imageUrl: '/tours/demo/pasillo.svg',
        initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
        linkHotspots: [
          { yaw: 3.14, pitch: -0.1, targetNodeId: 'hall-ingreso', targetYaw: 0, targetPitch: 0, label: 'Volver al Hall' },
          { yaw: 1.2, pitch: -0.1, targetNodeId: 'pileta', targetYaw: 3.14, targetPitch: 0, label: 'Ir a la Pileta' },
          { yaw: -1.2, pitch: -0.1, targetNodeId: 'parrilla', targetYaw: 3.14, targetPitch: 0, label: 'Ir a la Parrilla' },
          { yaw: 2.4, pitch: -0.05, targetNodeId: 'gimnasio', targetYaw: 3.14, targetPitch: 0, label: 'Ir al Gimnasio' },
        ],
      },
      {
        id: 'pileta', name: 'Pileta', imageUrl: '/tours/demo/pileta.svg',
        initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
        linkHotspots: [
          { yaw: 3.14, pitch: -0.1, targetNodeId: 'pasillo', targetYaw: 1.2, targetPitch: 0, label: 'Volver al Pasillo' },
          { yaw: 1.0, pitch: -0.1, targetNodeId: 'jardines', targetYaw: 3.14, targetPitch: 0, label: 'Ir a los Jardines' },
        ],
        infoHotspots: [{ yaw: 0, pitch: -0.2, title: 'Piscina infinita', description: 'Deck con reposeras y solárium' }],
      },
      {
        id: 'parrilla', name: 'Parrilla / Quincho', imageUrl: '/tours/demo/parrilla.svg',
        initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
        linkHotspots: [{ yaw: 3.14, pitch: -0.1, targetNodeId: 'pasillo', targetYaw: -1.2, targetPitch: 0, label: 'Volver al Pasillo' }],
        infoHotspots: [{ yaw: 0.2, pitch: -0.15, title: 'Área de parrillas', description: 'Quincho techado con mesa para 8 personas' }],
      },
      {
        id: 'gimnasio', name: 'Gimnasio', imageUrl: '/tours/demo/gimnasio.svg',
        initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
        linkHotspots: [{ yaw: 3.14, pitch: -0.1, targetNodeId: 'pasillo', targetYaw: 2.4, targetPitch: 0, label: 'Volver al Pasillo' }],
        infoHotspots: [{ yaw: -0.3, pitch: -0.15, title: 'Gimnasio equipado', description: 'Equipamiento cardio y de musculación' }],
      },
      {
        id: 'jardines', name: 'Jardines', imageUrl: '/tours/demo/jardines.svg',
        initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
        linkHotspots: [{ yaw: 3.14, pitch: -0.1, targetNodeId: 'pileta', targetYaw: 1.0, targetPitch: 0, label: 'Volver a la Pileta' }],
      },
    ],
  },
};

