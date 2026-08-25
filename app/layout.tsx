import type { Metadata } from "next";
import { Inter, Archivo } from "next/font/google";
import "./globals.css";
import MotionProvider from '@/components/ui/MotionProvider';
import ToastProvider from '@/components/ui/ToastProvider';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Tipografía de marca de Atrium (landing, auth, red social) — se expone acá
// como variable CSS pero no se aplica global: el resto del sitio (admin,
// microsite de cada proyecto con su propio tema) sigue con Montserrat.
// Se usa vía la utility `font-display` (ver --font-display en globals.css).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const DEFAULT_TITLE = "Atrium | Portfolio y proyectos para arquitectos";
const DEFAULT_DESCRIPTION =
  "Cargá tus proyectos, armá tu portfolio profesional y conectá con otros arquitectos y estudios. Masterplan interactivo, plantas y recorridos virtuales 360°.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  keywords: ["arquitectos", "portfolio", "inmobiliaria", "tour virtual", "masterplan"],
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ['/masterplan/render-exterior.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ['/masterplan/render-exterior.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <MotionProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
