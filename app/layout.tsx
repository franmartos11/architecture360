import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Residencias del Mar | Plataforma Inmobiliaria Interactiva",
  description:
    "Explora proyectos inmobiliarios con masterplan interactivo y recorridos virtuales 360°. Descubrí tu próximo hogar con tecnología de vanguardia.",
  keywords: ["inmobiliaria", "departamentos", "tour virtual", "360", "masterplan"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
