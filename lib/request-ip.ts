// x-forwarded-for trae "cliente, proxy1, proxy2..." cuando hay varios
// hops; el primero es el que puso el proxy de más confianza (Vercel).
// Usado tanto para rate-limit por IP en rutas anónimas como para lo que
// ya hacía app/api/leads/route.ts antes de esta pieza compartida.
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}
