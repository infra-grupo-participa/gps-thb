import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
