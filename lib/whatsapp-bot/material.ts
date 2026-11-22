// Material del proyecto que el bot puede mandar por WhatsApp, además de lo de
// cada unidad: renders, masterplan, portadas de edificios, fotos de amenities
// y fotos del avance de obra. También los links públicos (sitio, unidad, mapa).
// Sin imports de next/react: corre con tsx fuera de Next.
import type { ConstructionProgress } from '@/types';
import type { AmenityRow, BuildingRow, ProjectRow } from '@/types/database';

/** Un grupo de imágenes con nombre (un render, un amenity, una novedad de obra). */
export type GrupoImagenes = { nombre: string; urls: string[] };

export type MaterialProyecto = {
  renders: GrupoImagenes[];
  masterplan: string | null;
  /** PDF "brief" del proyecto para el cliente. */
  brief: string | null;
  edificios: GrupoImagenes[];
  amenities: GrupoImagenes[];
  /** Novedades de obra con fotos, de la más nueva a la más vieja. */
  avance: GrupoImagenes[];
};

export type TipoMaterial = 'renders' | 'masterplan' | 'brief' | 'edificio' | 'amenity' | 'avance_obra';

export type SlideAerea = { label: string; image_url: string };

const esUrl = (u: string | null | undefined): u is string => !!u && /^https?:\/\//i.test(u.trim());

export function armarMaterial(d: {
  proyecto: Pick<ProjectRow, 'masterplan_image'> & Partial<Pick<ProjectRow, 'brief_pdf_url'>>;
  edificios: Pick<BuildingRow, 'name' | 'cover_image'>[];
  amenities: Pick<AmenityRow, 'name' | 'images'>[];
  slides: SlideAerea[];
  avance: ConstructionProgress | null;
}): MaterialProyecto {
  const grupo = (nombre: string, urls: (string | null | undefined)[]): GrupoImagenes[] => {
    const ok = urls.filter(esUrl).map(u => u.trim());
    return ok.length ? [{ nombre: nombre.trim() || 'Sin nombre', urls: ok }] : [];
  };
  const avance = [...(d.avance?.updates ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap(u => grupo(u.title ? `${u.date} · ${u.title}` : u.date, u.images));
  return {
    renders: d.slides.flatMap(s => grupo(s.label, [s.image_url])),
    masterplan: esUrl(d.proyecto.masterplan_image) ? d.proyecto.masterplan_image.trim() : null,
    brief: esUrl(d.proyecto.brief_pdf_url) ? d.proyecto.brief_pdf_url.trim() : null,
    edificios: d.edificios.flatMap(e => grupo(e.name, [e.cover_image])),
    amenities: d.amenities.flatMap(a => grupo(a.name, a.images ?? [])),
    avance,
  };
}

/** Para la ficha: qué material hay, por nombre, así la IA sabe qué puede ofrecer. */
export function resumenMaterial(m: MaterialProyecto): string | null {
  const l: string[] = [];
  const nombres = (gs: GrupoImagenes[]) => gs.map(g => g.nombre).join(', ');
  if (m.renders.length) l.push(`- renders: ${nombres(m.renders)}`);
  if (m.masterplan) l.push('- masterplan: imagen general del proyecto');
  if (m.brief) l.push('- brief: PDF con los datos del proyecto');
  if (m.edificios.length) l.push(`- edificio (portada): ${nombres(m.edificios)}`);
  if (m.amenities.length) l.push(`- amenity (fotos): ${nombres(m.amenities)}`);
  if (m.avance.length) {
    const ultimas = m.avance.slice(0, 3).map(g => g.nombre).join('; ');
    l.push(`- avance_obra (fotos de obra): ${m.avance.length} novedades con fotos; las últimas: ${ultimas}`);
  }
  return l.length ? l.join('\n') : null;
}

const normal = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** El grupo cuyo nombre coincide (exacto primero, después parcial en cualquier sentido). */
export function buscarGrupo(gs: GrupoImagenes[], nombre: string): GrupoImagenes | null {
  const n = normal(nombre);
  if (!n) return null;
  return (
    gs.find(g => normal(g.nombre) === n) ??
    gs.find(g => normal(g.nombre).includes(n) || n.includes(normal(g.nombre))) ??
    null
  );
}

/** Imágenes a mandar para un pedido, o el motivo por el que no se puede (para la IA). */
export function elegirMaterial(
  m: MaterialProyecto,
  que: TipoMaterial,
  nombre: string | null,
  max: number,
): { urls: string[]; descripcion: string } | { error: string } {
  const opciones = (gs: GrupoImagenes[]) => gs.map(g => g.nombre).join(', ');
  const deGrupos = (gs: GrupoImagenes[], etiqueta: string, porDefecto: 'primero' | 'uno_por_grupo' | 'pedir') => {
    if (!gs.length) return { error: `No hay ${etiqueta} cargados en este proyecto.` };
    if (nombre && nombre.trim()) {
      const g = buscarGrupo(gs, nombre);
      if (!g) return { error: `No encontré "${nombre}" entre ${etiqueta}. Opciones: ${opciones(gs)}.` };
      return { urls: g.urls.slice(0, max), descripcion: `${etiqueta}: ${g.nombre}` };
    }
    if (gs.length === 1 || porDefecto === 'primero') {
      return { urls: gs[0].urls.slice(0, max), descripcion: `${etiqueta}: ${gs[0].nombre}` };
    }
    if (porDefecto === 'uno_por_grupo') {
      const elegidos = gs.slice(0, max);
      return { urls: elegidos.map(g => g.urls[0]), descripcion: `${etiqueta}: ${opciones(elegidos)}` };
    }
    return { error: `Hay varios ${etiqueta}: decime cuál. Opciones: ${opciones(gs)}.` };
  };

  switch (que) {
    case 'renders':
      return deGrupos(m.renders, 'renders', 'uno_por_grupo');
    case 'masterplan':
      return m.masterplan
        ? { urls: [m.masterplan], descripcion: 'el masterplan' }
        : { error: 'No hay masterplan cargado en este proyecto.' };
    case 'brief':
      return m.brief
        ? { urls: [m.brief], descripcion: 'el brief del proyecto (PDF)' }
        : { error: 'No hay brief cargado en este proyecto.' };
    case 'edificio':
      return deGrupos(m.edificios, 'portadas de edificios', 'pedir');
    case 'amenity':
      return deGrupos(m.amenities, 'amenities con fotos', 'pedir');
    case 'avance_obra':
      return deGrupos(m.avance, 'fotos de avance de obra', 'primero');
  }
}

/**
 * URL pública del sitio del proyecto: por subdominio si hay dominio raíz
 * configurado, si no /proyecto/[slug] sobre la base del admin.
 */
export function urlSitioProyecto(slug: string, base: string, rootDomain?: string | null): string {
  const dominio = rootDomain?.trim();
  if (dominio) return `https://${slug}.${dominio}`;
  return `${base.replace(/\/+$/, '')}/proyecto/${slug}`;
}

export function urlUnidad(sitio: string, edificioId: string, unidadId: string): string {
  return `${sitio}/edificio/${encodeURIComponent(edificioId)}/unidad/${encodeURIComponent(unidadId)}`;
}

export function urlMapa(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`;
}
