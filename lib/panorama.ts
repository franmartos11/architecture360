// Algunos motores de render (Corona, V-Ray, Lumion, Twinmotion) exportan
// panorámicas "top-bottom" estéreo: dos copias equirectangulares apiladas
// (una por ojo), pensadas para visores VR — el archivo queda ~cuadrado en
// vez de 2:1. Marzipano espera una sola equirectangular 2:1; si le pasamos
// el par estéreo completo se ve deformada/duplicada en el sitio. Si
// detectamos esa proporción, recortamos la mitad de arriba antes de subir.
const STEREO_ASPECT_MIN = 0.85;
const STEREO_ASPECT_MAX = 1.3;

export async function fixStereoPanorama(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const ratio = bitmap.width / bitmap.height;
  if (ratio < STEREO_ASPECT_MIN || ratio > STEREO_ASPECT_MAX) {
    bitmap.close();
    return file;
  }

  const halfHeight = Math.floor(bitmap.height / 2);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = halfHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, bitmap.width, halfHeight, 0, 0, bitmap.width, halfHeight);
  bitmap.close();

  const outputType = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, outputType, 0.92));
  if (!blob) return file;

  return new File([blob], file.name, { type: outputType });
}

export type PanoramaAspect = 'equirect' | 'stereo' | 'other';

const EQUIRECT_ASPECT_MIN = 1.9;
const EQUIRECT_ASPECT_MAX = 2.1;

// Clasifica por proporción: 'equirect' (2:1, lo que espera Marzipano),
// 'stereo' (par apilado, se recorta solo) u 'other' (parcial / foto común).
export function classifyPanoramaAspect(width: number, height: number): PanoramaAspect {
  const ratio = width / height;
  if (ratio >= STEREO_ASPECT_MIN && ratio <= STEREO_ASPECT_MAX) return 'stereo';
  if (ratio >= EQUIRECT_ASPECT_MIN && ratio <= EQUIRECT_ASPECT_MAX) return 'equirect';
  return 'other';
}

// Más ancho que esto no aporta nada en el visor y hace que el archivo se
// pase del límite de 15 MB del servidor.
export const MAX_PANORAMA_WIDTH = 8192;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function panoramaTargetSize(width: number, height: number): { width: number; height: number } | null {
  if (width <= MAX_PANORAMA_WIDTH) return null;
  return { width: MAX_PANORAMA_WIDTH, height: Math.round((height * MAX_PANORAMA_WIDTH) / width) };
}

const NOT_360_WARNING =
  'Esta imagen no parece una panorámica 360° (debería ser el doble de ancha que de alta). Se subió igual, pero puede verse deformada.';

// Prepara una panorámica para subir: recorta el estéreo, achica/re-encodea si
// es muy ancha o pesada, y avisa (sin bloquear) si el resultado no es 2:1 —
// hay fotos 360 parciales que se usan a propósito.
export async function preparePanorama(file: File): Promise<{ file: File; warning: string | null }> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return { file, warning: null };

  // 1) Estéreo primero: así el aspecto final ya es 2:1 y no avisamos de más.
  let current = await fixStereoPanorama(file);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(current);
  } catch {
    // Conservar el recorte estéreo ya hecho (current), no el original.
    return { file: current, warning: null };
  }

  let finalWidth = bitmap.width;
  let finalHeight = bitmap.height;
  const target = panoramaTargetSize(bitmap.width, bitmap.height);

  // 2) Achicar / re-encodear a JPEG si es muy ancha o supera el límite.
  if (target || current.size > MAX_UPLOAD_BYTES) {
    const size = target ?? { width: bitmap.width, height: bitmap.height };
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob) {
        const name = current.name.replace(/\.[^.]+$/, '') + '.jpg';
        current = new File([blob], name, { type: 'image/jpeg' });
        finalWidth = size.width;
        finalHeight = size.height;
      }
    }
  }
  bitmap.close();

  // 3) Aspecto final.
  const warning = classifyPanoramaAspect(finalWidth, finalHeight) === 'other' ? NOT_360_WARNING : null;
  return { file: current, warning };
}
