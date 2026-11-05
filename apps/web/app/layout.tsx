import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@reworth/ui-web/tokens.css";
import "./globals.css";
import { SessionGate } from "../components/SessionGate";
import { PwaManager } from "../components/PwaManager";
import { PwaInstallBootstrap } from "../components/PwaInstallBootstrap";

const pwaEarlyBootstrap = `(function(){try{if(!("serviceWorker"in navigator))return;window.__rwDeferredInstall=window.__rwDeferredInstall===undefined?null:window.__rwDeferredInstall;if(!window.__rwPwaListenersInstalled){window.__rwPwaListenersInstalled=true;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__rwDeferredInstall=e;});window.addEventListener("appinstalled",function(){window.__rwDeferredInstall=null;try{localStorage.setItem("rw-pwa-installed","1");}catch(err){}});}navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).catch(function(){});}catch(e){}})();`;

const siteOrigin = (
  process.env.NEXT_PUBLIC_WEB_URL?.trim() || "https://reworth.ng"
).replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: "ReWorth",
    template: "%s · ReWorth",
  },
  description:
    "Lagos, your unused things are worth something. Sell locally with trust.",
  applicationName: "ReWorth",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ReWorth",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/brand/icons/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/brand/icons/app-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "ReWorth",
    description: "Lagos, your unused things are worth something.",
    siteName: "ReWorth",
    images: [{ url: "/brand/landing-page.png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#172A3A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-NG" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <Script id="rw-pwa-early" strategy="beforeInteractive">
          {pwaEarlyBootstrap}
        </Script>
        <PwaInstallBootstrap />
        <SessionGate>{children}</SessionGate>
        <PwaManager />
      </body>
    </html>
  );
}
