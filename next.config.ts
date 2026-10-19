import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad:
 *  - /embed/* se puede incrustar en iframes; su `frame-ancestors` se fija en
 *    `src/middleware.ts` en tiempo de ejecución (EMBED_ALLOWED_ORIGINS).
 *  - Todo lo demás (dashboard, login…) NO se puede incrustar (anti-clickjacking).
 */

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [...common, { key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        source: "/((?!embed/).*)",
        headers: [
          ...common,
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
