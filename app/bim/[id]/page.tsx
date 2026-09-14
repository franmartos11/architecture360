import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getBimModelById } from '@/data/bim-repository';
import BimGallery from '@/components/bim/BimGallery';

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

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium text-gray-900 tracking-tight">{model.title}</h1>
        {model.description && (
          <p className="text-gray-600 whitespace-pre-line max-w-2xl">{model.description}</p>
        )}
      </header>

      {/* El visor 3D lo monta la Fase 3 acá arriba, cuando geometryUrl deje de ser null. */}

      <BimGallery images={model.galleryImages} title={model.title} />
    </main>
  );
}
