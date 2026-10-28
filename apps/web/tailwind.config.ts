import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui-web/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rw: {
          bg: "var(--rw-bg)",
          ink: "var(--rw-ink)",
          accent: "var(--rw-accent)",
          gold: "var(--rw-gold)",
          beige: "var(--rw-beige)",
          navy: "var(--rw-navy)",
          slate: "var(--rw-slate)",
        },
        "reworth-navy": "#172A3A",
        "reworth-orange": "#D96A32",
        "reworth-beige": "#F2E7D5",
        "reworth-slate": "#59636D",
        "reworth-white": "#FCFAF6",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        display: [
          "var(--font-jakarta)",
          "Plus Jakarta Sans",
          "var(--font-geist-sans)",
          "system-ui",
          "sans-serif",
        ],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
