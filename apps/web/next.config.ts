import path from "path";
import type { NextConfig } from "next";



const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // https: covers production object storage. Local media is http on :9000 (s3mock) or :3001 (API disk).
      "img-src 'self' data: blob: https: http://localhost:9000 http://127.0.0.1:9000 http://localhost:3001 http://127.0.0.1:3001",
      "connect-src 'self' http://localhost:3001 ws://localhost:3001 ws://127.0.0.1:3001 https: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@reworth/ui-web", "@reworth/shared"],
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /**
   * Public storefront lives at `/u/[handle]` (API: GET /storefronts/:handle).
   * Production vanity `/@handle` can rewrite here via reverse proxy or:
   * `{ source: '/@:handle', destination: '/u/:handle' }` when the host supports it.
   * Next.js App Router cannot use `app/@[handle]` (reserved for parallel routes).
   */
  async rewrites() {
    return [];
  },
};

export default nextConfig;
