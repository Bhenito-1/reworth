import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@reworth/ui-web/tokens.css";
import "./globals.css";
import { SessionGate } from "../components/SessionGate";

export const metadata: Metadata = {
  title: "ReWorth",
  description:
    "Lagos, your unused things are worth something. Sell locally with trust.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-NG" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <SessionGate>{children}</SessionGate>
      </body>
    </html>
  );
}
