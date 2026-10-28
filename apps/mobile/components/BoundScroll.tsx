import { ScrollView as RNScrollView, type ScrollViewProps } from "react-native";

/**
 * Vertical screens stay the width of the phone. A horizontal row (categories,
 * listing rails, photo strips) scrolls inside itself and does not widen the page.
 */
export function ScrollView({
  horizontal,
  style,
  contentContainerStyle,
  ...rest
}: ScrollViewProps) {
  if (horizontal) {
    return (
      <RNScrollView
        horizontal
        style={[style, hStyle]}
        contentContainerStyle={contentContainerStyle}
        {...rest}
      />
    );
  }
  return (
    <RNScrollView
      style={[style, vStyle]}
      contentContainerStyle={[contentContainerStyle, vContentStyle]}
      {...rest}
    />
  );
}

const hStyle = {
  width: "100%" as const,
  maxWidth: "100%" as const,
  minWidth: 0,
  flexGrow: 0,
  alignSelf: "stretch" as const,
};

export const screenBounds = {
  width: "100%" as const,
  maxWidth: "100%" as const,
  minWidth: 0,
  alignSelf: "stretch" as const,
};

const vStyle = {
  width: "100%" as const,
  maxWidth: "100%" as const,
  minWidth: 0,
  alignSelf: "stretch" as const,
};

const vContentStyle = {
  width: "100%" as const,
  maxWidth: "100%" as const,
  minWidth: 0,
};
