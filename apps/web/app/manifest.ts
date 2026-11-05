import type { MetadataRoute } from "next";

/**
 * Web App Manifest — installable PWA (Chrome/Edge/Samsung/Firefox Android;
 * iOS via Add to Home Screen). Keep icons under /brand/icons.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Bump when install state gets stuck after local uninstall / dismissals.
    id: "reworth-web-v3",
    name: "ReWorth — Lagos recommerce marketplace",
    short_name: "ReWorth",
    description:
      "Lagos, your unused things are worth something. Buy, sell, swap, and give away locally.",
    lang: "en-NG",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    prefer_related_applications: false,
    orientation: "any",
    background_color: "#FCFAF6",
    theme_color: "#172A3A",
    categories: ["shopping", "lifestyle"],
    icons: [
      {
        src: "/brand/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icons/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/brand/pwa/screenshot-narrow.jpg",
        sizes: "1080x1920",
        type: "image/jpeg",
        form_factor: "narrow",
        label: "Discover local deals on ReWorth",
      },
      {
        src: "/brand/pwa/screenshot-wide.jpg",
        sizes: "1920x1080",
        type: "image/jpeg",
        form_factor: "wide",
        label: "Browse Lagos recommerce on a big screen",
      },
    ],
  };
}
