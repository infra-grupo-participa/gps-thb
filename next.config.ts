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
      // Clickjacking: hoje NENHUMA rota tem X-Frame-Options/CSP, então
      // qualquer site pode embedar até o /login. Política dividida por
      // negative lookahead (mesmo padrão do bloco de cache acima) — os dois
      // headers de frame NUNCA coexistem com valor conflitante na mesma rota.
      //
      // /p/* — Plantão de Dúvidas: PRECISA ser embedável na área de membros
      // da Hotmart (domínio próprio do Club incluso).
      {
        source: "/p/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors https://hm.nivelouro.com.br https://*.hotmart.com https://hotmart.com",
          },
        ],
      },
      // Todo o resto — nunca deve ser embedado (login, área do aluno, admin).
      {
        source: "/((?!p/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
