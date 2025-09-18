// next.config.js
import type { NextConfig } from "next";

/**
 * Configuration Next.js pour export statique compatible Tauri
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  
  // Configuration pour le support des images distantes (Firebase, Picsum...)
  images: {
    unoptimized: true,
  
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'fastly.picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },

  // Autoriser l’exportation statique
  output: 'export', // ⚠️ Obligatoire pour Tauri et next export dans Next 13+

  // Ajoute un slash à la fin des URL (important pour export)
  trailingSlash: true,

  // Ignore les erreurs ESLint pendant le build (utile pour Tauri)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Ignore les erreurs TypeScript pendant le build (optionnel pour éviter des blocages)
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;