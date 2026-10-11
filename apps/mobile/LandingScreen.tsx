/**
 * Guest entry. Paper on top, ink panel below.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "./components/BoundScroll";
import { colors, radius, space, tap, type as typeScale } from "./theme/tokens";

const WAYS = [
  { title: "Buy", body: "Find something you want." },
  { title: "Sell", body: "List what you no longer need." },
  { title: "Swap", body: "Trade with someone else." },
  { title: "Give away", body: "Pass it on for free." },
] as const;

type Props = {
  onLogin: () => void;
  onRegister: () => void;
};

export function LandingScreen({ onLogin, onRegister }: Props) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.root}
      bounces={false}
    >
      <View style={styles.brandRow}>
        <View style={styles.dot} />
        <Text style={styles.wordmark}>ReWorth</Text>
      </View>

      <View style={styles.stage}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Buy, sell, swap, or give away</Text>
          <Text style={styles.title} accessibilityRole="header">
            Your unused things are worth something.
          </Text>
          <Text style={styles.copy}>
            A marketplace for the things you no longer need.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.btnPressed,
            ]}
            onPress={onLogin}
            accessibilityRole="button"
            accessibilityLabel="Log in"
          >
            <Text style={styles.primaryBtnText}>Log in</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && styles.btnPressed,
            ]}
            onPress={onRegister}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            <Text style={styles.secondaryBtnText}>Create account</Text>
          </Pressable>
        </View>

        <View style={styles.ink} accessibilityRole="list">
          {WAYS.map((way, index) => (
            <View key={way.title}>
              <View style={styles.way}>
                <Text style={styles.index}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <Text style={styles.wayTitle}>{way.title}</Text>
                <Text style={styles.wayBody}>{way.body}</Text>
              </View>
              {index < WAYS.length - 1 ? <View style={styles.rule} /> : null}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  root: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emerald,
  },
  wordmark: {
    fontSize: typeScale.body,
    fontWeight: "600",
    color: colors.ink,
  },
  stage: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  hero: {
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.lg,
  },
  kicker: {
    fontSize: typeScale.meta,
    fontWeight: "600",
    color: colors.emerald,
  },
  title: {
    marginTop: space.md,
    fontSize: typeScale.display,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  copy: {
    marginTop: space.md,
    fontSize: typeScale.bodySm,
    lineHeight: 22,
    color: colors.muted,
  },
  primaryBtn: {
    marginTop: space.lg,
    minHeight: tap.min,
    borderRadius: radius.md,
    backgroundColor: colors.emerald,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: typeScale.body,
    fontWeight: "600",
  },
  secondaryBtn: {
    marginTop: space.sm,
    minHeight: tap.min,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.canvas,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  secondaryBtnText: {
    color: colors.ink,
    fontSize: typeScale.body,
    fontWeight: "600",
  },
  btnPressed: {
    opacity: 0.88,
  },
  ink: {
    backgroundColor: colors.ink,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  way: {
    paddingVertical: space.md,
  },
  rule: {
    height: 1,
    backgroundColor: colors.canvas,
    opacity: 0.16,
  },
  index: {
    fontSize: typeScale.meta,
    fontWeight: "600",
    color: colors.emerald,
  },
  wayTitle: {
    marginTop: 2,
    fontSize: typeScale.titleSm,
    fontWeight: "600",
    color: colors.canvas,
  },
  wayBody: {
    marginTop: 2,
    fontSize: typeScale.meta,
    lineHeight: 18,
    color: colors.canvas,
    opacity: 0.72,
  },
});
