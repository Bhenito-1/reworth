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
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      ["img-src 'self' data: blob: https: http://localhost:9000 http://127.0.0.1:9000 http://localhost:3001 http://127.0.0.1:3001", ...API.http].join(" "),
      ["connect-src 'self' http://localhost:3001", ...API.http, "https:"].join(" "),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@reworth/ui-web"],
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
