import path from "path";
import type { NextConfig } from "next";

/**
 * Origin of the API this build talks to (NEXT_PUBLIC_API_URL), so the CSP
 * allows it even when the API is not on localhost:3001 (another port, a LAN
 * host). https:/wss: already cover hosted environments.
 */
function apiOrigins(): { http: string[]; ws: string[] } {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_API_URL ?? "");
    if (url.protocol !== "http:") return { http: [], ws: [] };
    return { http: [url.origin], ws: [`ws://${url.host}`] };
  } catch {
    return { http: [], ws: [] };
  }
}
const API = apiOrigins();



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
      ["img-src 'self' data: blob: https: http://localhost:9000 http://127.0.0.1:9000 http://localhost:3001 http://127.0.0.1:3001", ...API.http].join(" "),
      ["connect-src 'self' http://localhost:3001 ws://localhost:3001 ws://127.0.0.1:3001", ...API.http, ...API.ws, "https: wss:"].join(" "),
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
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
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
