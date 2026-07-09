import type { NextConfig } from "next";

const APP_HOST = (process.env.NEXT_PUBLIC_APP_URL || "")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Server Actions atrás do proxy reverso (LiteSpeed/Hostinger): confia na
  // origem do domínio público para não bloquear login/logout/mutações por
  // divergência de Origin × Host.
  experimental: {
    serverActions: {
      allowedOrigins: [
        "programa.timeholdingbrasil.com.br",
        ...(APP_HOST ? [APP_HOST] : []),
      ],
    },
  },

  // Redireciona rotas antigas (renomeadas) para evitar 404 em links/bookmarks.
  async redirects() {
    return [
      { source: "/etapa-1", destination: "/etapa/1", permanent: true },
      {
        source: "/admin/aluno/:id/etapa-1",
        destination: "/admin/aluno/:id/etapa/1",
        permanent: true,
      },
    ];
  },

  // Evita que um CDN/proxy sirva HTML antigo apontando para chunks já
  // substituídos após deploy (lição herdada do sip na Hostinger). Os assets
  // versionados em /_next/static continuam com cache longo e imutável.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
