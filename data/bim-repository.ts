import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { BimModel } from '@/types';
import type { BimModelRow } from '@/types/database';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Los nulos de texto se normalizan a '' porque los inputs del admin son
// controlados y React se queja si el value pasa de undefined a string.
// Los nulos de las columnas de archivo se CONSERVAN: canPublishBimModel
// necesita distinguir "todavía no hay modelo" de "hay un modelo".
export function mapBimModelRow(row: BimModelRow): BimModel {
  return {
    id: row.id,
    projectId: row.project_id,
    floorIds: row.bim_model_floors?.map(f => f.floor_id) ?? [],
    unitIds: row.bim_model_units?.map(u => u.unit_id) ?? [],
    title: row.title,
    description: row.description ?? '',
    sourceFormat: row.source_format,
    sourceUrl: row.source_url,
    geometryUrl: row.geometry_url,
    propertiesUrl: row.properties_url,
    galleryImages: row.gallery_images ?? [],
    coverImage: row.cover_image,
    stats: row.stats,
    status: row.status,
    errorMessage: row.error_message,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Todas las piezas del proyecto — incluidas privadas, en processing y
// fallidas. La política RLS "project owner read bim_models" es la que
// permite verlas; con el cliente anónimo este query devuelve vacío.
export const getBimModelsByProject = cache(async (projectId: string): Promise<BimModel[]> => {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('bim_models')
    .select('*, bim_model_floors(floor_id), bim_model_units(unit_id)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  return ((data ?? []) as BimModelRow[]).map(mapBimModelRow);
});

// Para la landing pública: el filtro va explícito además de RLS, mismo
// criterio que ya usa amenities/pointsOfInterest en project-repository.ts.
export const getPublicBimModelsByProject = cache(async (projectId: string): Promise<BimModel[]> => {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('bim_models')
    .select('*, bim_model_floors(floor_id), bim_model_units(unit_id)')
    .eq('project_id', projectId)
    .eq('is_public', true)
    .eq('status', 'ready')
    .order('created_at', { ascending: false });
  return ((data ?? []) as BimModelRow[]).map(mapBimModelRow);
});

// Sin filtro de visibilidad: RLS decide. El dueño del proyecto entra a
// una pieza en processing o de un proyecto sin publicar desde el admin;
// un visitante recibe undefined → notFound().
export const getBimModelById = cache(async (id: string): Promise<BimModel | undefined> => {
  if (!SUPABASE_CONFIGURED) return undefined;
  const supabase = await createClient();
  const { data } = await supabase.from('bim_models').select('*, bim_model_floors(floor_id), bim_model_units(unit_id)').eq('id', id).maybeSingle();
  return data ? mapBimModelRow(data as BimModelRow) : undefined;
});
