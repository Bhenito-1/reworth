import { AccessibilityInfo } from "react-native";

async function reduceMotion(): Promise<boolean> {
  try {
    return await AccessibilityInfo.isReduceMotionEnabled();
  } catch {
    return false;
  }
}

type HapticsMod = {
  impactAsync: (style: unknown) => Promise<void>;
  notificationAsync: (type: unknown) => Promise<void>;
  ImpactFeedbackStyle: { Light: unknown; Medium: unknown };
  NotificationFeedbackType: { Success: unknown; Error: unknown };
};

function getHaptics(): HapticsMod | null {
  try {
    // Optional until install completes
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-haptics") as HapticsMod;
  } catch {
    return null;
  }
}

export async function hapticLight(): Promise<void> {
  if (await reduceMotion()) return;
  const H = getHaptics();
  if (!H) return;
  try {
    await H.impactAsync(H.ImpactFeedbackStyle.Light);
  } catch {
    /* web / simulator */
  }
}

export async function hapticMedium(): Promise<void> {
  if (await reduceMotion()) return;
  const H = getHaptics();
  if (!H) return;
  try {
    await H.impactAsync(H.ImpactFeedbackStyle.Medium);
  } catch {
    /* noop */
  }
}

export async function hapticSuccess(): Promise<void> {
  if (await reduceMotion()) return;
  const H = getHaptics();
  if (!H) return;
  try {
    await H.notificationAsync(H.NotificationFeedbackType.Success);
  } catch {
    /* noop */
  }
}

export async function hapticError(): Promise<void> {
  if (await reduceMotion()) return;
  const H = getHaptics();
  if (!H) return;
  try {
    await H.notificationAsync(H.NotificationFeedbackType.Error);
  } catch {
    /* noop */
  }
}
