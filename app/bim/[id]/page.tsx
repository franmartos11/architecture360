import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getBimModelById } from '@/data/bim-repository';
import BimUnifiedViewer from '@/components/bim/BimUnifiedViewer';

interface PageProps { params: Promise<{ id: string }>; }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const model = await getBimModelById(id);
  if (!model) return { title: 'Modelo no encontrado' };

  const description = model.description || `Modelo BIM publicado en Atrium.`;
  return {
    title: model.title,
    description,
    openGraph: {
      title: model.title,
      description,
      images: model.coverImage ? [model.coverImage] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: model.title,
      description,
      images: model.coverImage ? [model.coverImage] : undefined,
    },
  };
}

export default async function BimModelPage({ params }: PageProps) {
  const { id } = await params;
  const model = await getBimModelById(id);

  // RLS ya oculta las piezas privadas y las no publicadas a quien no sea
  // el autor; este chequeo cubre el caso del propio autor entrando a una
  // pieza suya que todavía no publicó.
  if (!model || model.status !== 'ready') notFound();

  const hasViewer = !!model.geometryUrl;
  const hasGallery = model.galleryImages.length > 0;
  const hasStats = !!model.stats;

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium text-gray-900 tracking-tight">{model.title}</h1>
        {model.description && (
          <p className="text-gray-600 whitespace-pre-line max-w-2xl">{model.description}</p>
        )}
      </header>

      {/* ── Stats del modelo ── */}
      {hasStats && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
          {model.stats!.elements > 0 && (
            <span>{model.stats!.elements.toLocaleString('es-AR')} elementos</span>
          )}
          {model.stats!.storeys > 0 && (
            <span>{model.stats!.storeys} {model.stats!.storeys === 1 ? 'planta' : 'plantas'}</span>
          )}
          {model.stats!.triangles > 0 && (
            <span>{(model.stats!.triangles / 1_000_000).toFixed(1)}M triángulos</span>
          )}
        </div>
      )}

      {/* ── Visor Unificado (3D / Galería) ── */}
      <BimUnifiedViewer 
        geometryUrl={model.geometryUrl}
        coverImage={model.coverImage}
        galleryImages={model.galleryImages}
        title={model.title}
      />
    </main>
  );
}
