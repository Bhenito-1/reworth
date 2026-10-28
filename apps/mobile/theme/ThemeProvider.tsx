/**
 * Theme context — light/dark from tokens (docs/DESIGN.md).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import {
  colors as light,
  colorsDark as dark,
  motion,
  radius,
  space,
  tap,
  type,
} from "./tokens";

export type ColorTokens = {
  canvas: string;
  surface: string;
  surfaceWarm: string;
  ink: string;
  muted: string;
  border: string;
  navy: string;
  navyDark: string;
  orange: string;
  orangePressed: string;
  orangeWash: string;
  beige: string;
  emerald: string;
  emeraldPressed: string;
  emeraldWash: string;
  gold: string;
  goldWash: string;
  disabled: string;
  success: string;
  warning: string;
  error: string;
  onAccent: string;
};

type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: "light" | "dark";
  colors: ColorTokens;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  type: typeof type;
  space: typeof space;
  radius: typeof radius;
  motion: typeof motion;
  tap: typeof tap;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");

  const resolved: "light" | "dark" =
    mode === "system" ? (system === "dark" ? "dark" : "light") : mode;

  const toggle = useCallback(() => {
    setMode((m) => {
      const current =
        m === "system" ? (system === "dark" ? "dark" : "light") : m;
      return current === "dark" ? "light" : "dark";
    });
  }, [system]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolved,
      colors: resolved === "dark" ? dark : light,
      setMode,
      toggle,
      type,
      space,
      radius,
      motion,
      tap,
    }),
    [mode, resolved, toggle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

/** Safe fallback when outside provider (tests / early boot). */
export function useColors(): ColorTokens {
  const ctx = useContext(ThemeContext);
  return ctx?.colors ?? light;
}
