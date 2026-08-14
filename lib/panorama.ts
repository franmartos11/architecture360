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
