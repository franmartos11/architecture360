import type { Viewport } from 'next';

/**
 * Layout específico para la vista de plano de piso.
 *
 * Desactiva el zoom del navegador (user-scalable=no) para evitar que el
 * usuario rompa el layout haciendo pinch/ctrl+scroll sobre la página.
 * El zoom funciona correctamente dentro del plano gracias a
 * react-zoom-pan-pinch (TransformWrapper), que maneja su propio zoom
 * de forma independiente al zoom del navegador.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function BuildingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
