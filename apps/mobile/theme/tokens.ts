/**
 * ReWorth design tokens — mobile (brand palette).
 * Sync with packages/ui-web/src/tokens.css and docs/DESIGN.md.
 */

export const colors = {
  canvas: "#FCFAF6",
  surface: "#FFFFFF",
  surfaceWarm: "#F2E7D5",
  ink: "#172A3A",
  muted: "#59636D",
  border: "#E4DDD4",
  navy: "#172A3A",
  navyDark: "#10202D",
  orange: "#D96A32",
  orangePressed: "#C65E2B",
  orangeWash: "#F8E6DC",
  beige: "#F2E7D5",
  /** @deprecated use `orange` — kept so existing screens compile */
  emerald: "#D96A32",
  emeraldPressed: "#C65E2B",
  emeraldWash: "#F2E7D5",
  gold: "#C9A227",
  goldWash: "#F5EDD0",
  disabled: "#B6B4B0",
  success: "#2F7D5B",
  warning: "#D99632",
  error: "#C94A3A",
  /** Text / icons on orange or navy filled CTAs — always white for contrast */
  onAccent: "#FFFFFF",
} as const;

export const colorsDark = {
  canvas: "#172A3A",
  surface: "#203747",
  surfaceWarm: "#2A3D4D",
  ink: "#FCFAF6",
  muted: "#CFD4D7",
  border: "#2F4556",
  navy: "#FCFAF6",
  navyDark: "#E4DDD4",
  orange: "#D96A32",
  orangePressed: "#E07A45",
  orangeWash: "#3D2A22",
  beige: "#2A3D4D",
  emerald: "#D96A32",
  emeraldPressed: "#E07A45",
  emeraldWash: "#2A3D4D",
  gold: "#E0B84A",
  goldWash: "#3D3418",
  disabled: "#6B7280",
  success: "#3D9B72",
  warning: "#E0A84A",
  error: "#E07060",
  onAccent: "#FFFFFF",
} as const;

export const type = {
  display: 28,
  title: 24,
  titleSm: 20,
  body: 17,
  bodySm: 15,
  meta: 13,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

export const motion = {
  microMs: 150,
  standardMs: 250,
} as const;

export const tap = {
  min: 44,
} as const;
