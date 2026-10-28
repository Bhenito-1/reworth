import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useColors } from "../theme/ThemeProvider";
import { radius, tap, type } from "../theme/tokens";
import { hapticLight } from "../theme/haptics";

export type AppButtonVariant = "primary" | "secondary" | "ghost" | "soft";

type Props = {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
  children,
}: Props) {
  const c = useColors();
  const blocked = disabled || loading;

  const palette = {
    primary: {
      bg: c.orange,
      bgPressed: c.orangePressed,
      text: c.onAccent,
      border: c.orange,
    },
    secondary: {
      bg: c.navy,
      bgPressed: c.navyDark,
      text: c.onAccent,
      border: c.navy,
    },
    ghost: {
      bg: "transparent",
      bgPressed: c.surfaceWarm,
      text: c.ink,
      border: c.ink,
    },
    soft: {
      bg: c.surfaceWarm,
      bgPressed: c.beige,
      text: c.ink,
      border: c.surfaceWarm,
    },
  }[variant];

  return (
    <Pressable
      onPress={() => {
        if (blocked) return;
        void hapticLight();
        onPress();
      }}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed && !blocked ? palette.bgPressed : palette.bg,
          borderColor: palette.border,
          borderWidth: variant === "ghost" ? 1.5 : 0,
          opacity: blocked ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : children ? (
        children
      ) : (
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tap.min,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  label: {
    fontSize: type.body,
    fontWeight: "600",
  },
});
