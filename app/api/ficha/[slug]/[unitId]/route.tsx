import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getSiteProject } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import { projectCanonical } from '@/lib/project-canonical';
import { isUuid } from '@/lib/analytics/project-unit';
import { createClient } from '@/lib/supabase/server';
import { readFinancingPlans } from '@/lib/financing-server';
import { buildFichaContent, fichaFileName } from '@/lib/ficha/content';
import { loadPdfImage } from '@/lib/ficha/images';
import { qrPng } from '@/lib/ficha/qr';
import { FichaDocument } from '@/lib/ficha/FichaDocument';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request-ip';

// GET /api/ficha/<slug>/<uuid de la unidad>?ref= — ficha PDF de una unidad,
// armada en el momento con los datos de ahora (como el CV del portfolio).
// Pública para proyectos publicados; un borrador solo para sus miembros
// (mismo loader que el sitio). El link usa el uuid y no el código: el código
// solo es único por piso y puede cambiar.
// Spec: docs/superpowers/specs/2026-11-24-ficha-pdf-unidad-design.md

export const runtime = 'nodejs';

// Origen de la app para las imágenes con ruta relativa (archivos de public/).
// La URL configurada antes que el Host del pedido, que podría venir armado.
function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    if (configured) return new URL(configured).origin;
  } catch { /* URL mal configurada: se usa la del pedido */ }
  return new URL(request.url).origin;
}

const notFound = () => NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; unitId: string }> }) {
  const { slug, unitId } = await params;
  if (!isUuid(unitId)) return notFound();

  // Armar una ficha cuesta CPU (sharp + react-pdf) y tráfico de Storage.
  const ip = clientIp(request);
  if (ip) {
    const limited = await rateLimitOrRespond(
      { key: `ficha:ip:${ip}`, windowSeconds: 600, max: 30 },
      'Descargaste muchas fichas seguidas. Esperá unos minutos e intentá de nuevo.'
    );
    if (limited) return limited;
  }

  const view = await getSiteProject(slug);
  const project = view?.project;
  const unit = project?.units.find(u => u.dbId === unitId);
  const building = unit && project?.buildings.find(b => b.id === unit.buildingId);
  if (!view || !project || !unit || !building) return notFound();

  try {
    const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
    const plans = await readFinancingPlans(await createClient(), project.id);
    const unitUrl = await projectCanonical(slug, `/edificio/${building.id}/unidad/${encodeURIComponent(unit.id)}`);
    const content = buildFichaContent({
      project, unit, buildingName: building.name, building, typeConfig, plans, unitUrl,
      ref: new URL(request.url).searchParams.get('ref'),
      isDraft: view.isDraftPreview,
      now: new Date(),
    });

    const origin = appOrigin(request);
    const [hero, plan, qr, galleryBufs, extraPlanBufs] = await Promise.all([
      loadPdfImage(content.imageUrls.hero, fetch, origin),
      loadPdfImage(content.imageUrls.plan, fetch, origin),
      qrPng(content.qrUrl),
      Promise.all(content.imageUrls.gallery.map(g => loadPdfImage(g.url, fetch, origin))),
      Promise.all(content.imageUrls.extraPlans.map(p => loadPdfImage(p.url, fetch, origin))),
    ]);
    const gallery = content.imageUrls.gallery
      .map((g, i) => (galleryBufs[i] ? { data: galleryBufs[i]!, caption: g.caption } : null))
      .filter((g): g is { data: Buffer; caption: string | null } => g !== null);
    const extraPlans = content.imageUrls.extraPlans
      .map((p, i) => (extraPlanBufs[i] ? { data: extraPlanBufs[i]!, label: p.label } : null))
      .filter((p): p is { data: Buffer; label: string } => p !== null);

    const pdf = await renderToBuffer(<FichaDocument content={content} images={{ hero, plan, gallery, extraPlans }} qr={qr} />);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fichaFileName(project.name, unit.name)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[ficha] no se pudo generar la ficha', { slug, unitId }, err);
    return NextResponse.json({ error: 'No se pudo generar la ficha' }, { status: 500 });
  }
}
