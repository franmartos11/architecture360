// Placeholder "shimmer" genérico en base64 para usar como blurDataURL en
// <Image placeholder="blur">. No depende de la imagen real (no hay forma
// barata de generar un blur real para URLs remotas/dinámicas de Supabase
// sin un paso extra de build), pero evita el flash en blanco mientras carga.
const shimmer = (w: number, h: number) => `
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g">
      <stop stop-color="#e5e7eb" offset="20%" />
      <stop stop-color="#f3f4f6" offset="50%" />
      <stop stop-color="#e5e7eb" offset="70%" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#e5e7eb" />
  <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
</svg>`;

const toBase64 = (str: string) =>
  typeof window === 'undefined' ? Buffer.from(str).toString('base64') : window.btoa(str);

export const shimmerDataUrl = (w = 700, h = 475) => `data:image/svg+xml;base64,${toBase64(shimmer(w, h))}`;
