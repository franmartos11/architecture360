// Catálogo de aptitudes seleccionables en el editor de perfil — agrupado
// por categoría para el acordeón de "Aptitudes". Reordenado para calcar
// las categorías del mockup Editor de perfil.dc.html (BIM Management,
// Licitaciones y Normativa Urbana pasaron de "Otros" a "Gestión" para
// coincidir), sin sacar ningún ítem que ya existiera — solo se movieron.
export const SKILLS_CATALOG: Record<string, string[]> = {
  'Software BIM / CAD': ['AutoCAD', 'Revit', 'ArchiCAD', 'BricsCAD', 'Civil 3D', 'Vectorworks'],
  '3D y Visualización': ['SketchUp', 'Rhino', '3ds Max', 'Blender', 'Lumion', 'V-Ray', 'Enscape', 'Twinmotion', 'Corona Renderer'],
  'Diseño y Edición': ['Photoshop', 'Illustrator', 'InDesign', 'Premiere', 'After Effects', 'Figma', 'Canva'],
  'Habilidades de obra': ['Dirección de Obra', 'Presupuestos', 'Cómputos Métricos', 'Relevamiento', 'Certificaciones de Obra'],
  'Diseño': ['Diseño Arquitectónico', 'Diseño Urbano', 'Paisajismo', 'Diseño Interior', 'Diseño Sustentable', 'Diseño Paramétrico'],
  'Gestión': ['MS Project', 'Trello', 'Notion', 'Excel / Planillas', 'BIM Management', 'Licitaciones', 'Normativa Urbana', 'Gestión de Proyectos'],
  'Otros': ['Fotografía', 'Maquetería'],
};

export const SPECIALTIES_CATALOG = [
  'Vivienda unifamiliar', 'Vivienda colectiva', 'Comercial', 'Corporativo', 'Salud',
  'Educación', 'Urbanismo', 'Refuncionalización', 'Patrimonio', 'Interiorismo',
];

export const LANGUAGES_CATALOG = ['Español', 'Inglés', 'Portugués', 'Italiano', 'Alemán'];
