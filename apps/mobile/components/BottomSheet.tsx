import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ReactNode } from "react";
import { useColors } from "../theme/ThemeProvider";
import { radius, space, type } from "../theme/tokens";

type Props = {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Bottom sheet pattern — filters, offers, checkout summary.
 * Backdrop dismiss + grabber affordance (full pan gesture later).
 */
export function BottomSheet({ visible, title, onClose, children }: Props) {
  const c = useColors();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Dismiss sheet"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          {title ? (
            <Text style={[styles.title, { color: c.ink }]}>{title}</Text>
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollPad}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(16,20,24,0.4)",
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    maxHeight: "85%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: space.md,
  },
  title: {
    fontSize: type.titleSm,
    fontWeight: "600",
    marginBottom: space.md,
  },
  scrollPad: {
    paddingBottom: space.lg,
    gap: space.sm,
  },
});
