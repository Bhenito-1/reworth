/**
 * Best-effort clipboard for Expo (optional expo-clipboard).
 */
import { Share } from "react-native";

export async function setString(value: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require("expo-clipboard") as {
      setStringAsync: (v: string) => Promise<void>;
    };
    await Clipboard.setStringAsync(value);
    return;
  } catch {
    /* fall through */
  }
  await Share.share({ message: value });
}
