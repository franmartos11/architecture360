'use client';

// Miniatura de una sección real de la landing, escalada para caber en una
// fila del panel — mismo truco que cualquier constructor de páginas:
// renderiza el componente a tamaño completo y lo achica con
// transform:scale en vez de tratar de reimplementar un layout aparte
// "en chico". pointer-events-none a propósito: algunas secciones tienen
// controles reales (el formulario de contacto, la calculadora) y esto es
// solo una vista previa, no debe poder tocarse desde acá.
export default function SectionPreviewFrame({ children, height = 260, scale = 0.4 }: { children: React.ReactNode; height?: number; scale?: number }) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white" style={{ height }}>
      <div
        className="pointer-events-none select-none absolute top-0 left-0 origin-top-left"
        style={{ transform: `scale(${scale})`, width: `${100 / scale}%` }}
      >
        {children}
      </div>
    </div>
  );
}
