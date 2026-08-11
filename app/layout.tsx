import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import MotionProvider from '@/components/ui/MotionProvider';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const DEFAULT_TITLE = "Plataforma Inmobiliaria Interactiva | Masterplan y Tours 360°";
const DEFAULT_DESCRIPTION =
  "Explora proyectos inmobiliarios con masterplan interactivo y recorridos virtuales 360°. Descubrí tu próximo hogar con tecnología de vanguardia.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  keywords: ["inmobiliaria", "departamentos", "tour virtual", "360", "masterplan"],
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
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <MotionProvider>
          {children}
        </MotionProvider>
      </body>
    </html>
  );
}
