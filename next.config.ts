import type { NextConfig } from "next";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

const nextConfig: NextConfig = {
  // Sin esto, next dev bloquea los recursos internos (_next/webpack-hmr,
  // chunks) para cualquier host que no sea localhost — protección contra
  // DNS rebinding, pero también rompe en desarrollo el probar un
  // subdominio de proyecto real (ver lib/project-subdomain.ts) apenas se
  // configura NEXT_PUBLIC_ROOT_DOMAIN: la página cargaba en blanco porque
  // el bundle del cliente nunca llegaba a buscarse. No hace falta en
  // producción (ahí no hay HMR ni este chequeo), por eso condicionado a
  // que exista la env var.
  ...(ROOT_DOMAIN ? { allowedDevOrigins: [`*.${ROOT_DOMAIN}`] } : {}),
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['framer-motion', '@react-three/fiber', '@react-three/drei', 'lucide-react', 'swiper'],
  },
};

export default nextConfig;
