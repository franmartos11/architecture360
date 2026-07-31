import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['framer-motion', '@react-three/fiber', '@react-three/drei', 'lucide-react'],
  },
};

export default nextConfig;
