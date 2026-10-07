import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { brandAssets } from "../lib/brandAssets";
import { useColors } from "../theme/ThemeProvider";
import { colors, radius, space, tap } from "../theme/tokens";
import { hapticLight } from "../theme/haptics";

export type BottomNavTab = "home" | "discover" | "sell" | "chats" | "profile";

type Props = {
  active: BottomNavTab;
  onChange: (tab: BottomNavTab) => void;
};

const TABS: {
  id: BottomNavTab;
  label: string;
  icon?: keyof typeof brandAssets;
}[] = [
  { id: "home", label: "Home", icon: "appIcon" },
  { id: "discover", label: "Discover", icon: "actionBuy" },
  { id: "sell", label: "SELL", icon: "actionSell" },
  { id: "chats", label: "Chats", icon: "actionChat" },
  { id: "profile", label: "Profile", icon: "profileAvatar" },
];

/** Home · Discover · SELL (elevated orange FAB) · Chats · Profile */
export function BottomNav({ active, onChange }: Props) {
  const c = useColors();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          shadowColor: c.ink,
        },
      ]}
      accessibilityRole="tablist"
    >
      {TABS.map((tab) => {
        const selected = active === tab.id;
        if (tab.id === "sell") {
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                void hapticLight();
                onChange("sell");
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel="Sell"
              testID="tab-sell"
              hitSlop={8}
              style={({ pressed }) => [
                styles.sellWrap,
                { opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <View
                style={[
                  styles.sellFab,
                  {
                    backgroundColor: c.orange,
                    shadowColor: c.orange,
                  },
                ]}
              >
                <Image
                  source={brandAssets.actionSell}
                  style={styles.sellIcon}
                  resizeMode="contain"
                />
                <Text style={styles.sellLabel}>SELL</Text>
              </View>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={tab.id}
            onPress={() => {
              void hapticLight();
              onChange(tab.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            testID={`tab-${tab.id}`}
            hitSlop={6}
            style={({ pressed }) => [
              styles.tab,
              { opacity: pressed ? 0.75 : 1 },
            ]}
          >
            {tab.icon ? (
              <Image
                source={brandAssets[tab.icon]}
                style={[
                  styles.tabIcon,
                  tab.id === "profile" && styles.profileTabIcon,
                  { opacity: selected ? 1 : 0.55 },
                ]}
                resizeMode={tab.id === "profile" ? "cover" : "contain"}
              />
            ) : null}
            <Text
              style={[
                styles.label,
                {
                  color: selected ? c.orange : c.muted,
                  fontWeight: selected ? "700" : "500",
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
    paddingBottom: space.md,
    minHeight: 72,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: tap.min,
    minWidth: tap.min,
    gap: 4,
  },
  tabIcon: {
    width: 28,
    height: 28,
  },
  profileTabIcon: {
    borderRadius: 14,
  },
  label: {
    fontSize: 11,
  },
  sellWrap: {
    flex: 1,
    alignItems: "center",
    marginTop: -28,
  },
  sellFab: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
    gap: 0,
    overflow: "hidden",
    paddingTop: 6,
  },
  sellIcon: {
    width: 40,
    height: 40,
  },
  sellLabel: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: 1,
  },
});
