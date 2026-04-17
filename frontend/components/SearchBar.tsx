import React, { useRef, useState } from "react";
import { View, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

// Standalone pilled search bar — manages its own state.
// Used in category screens (default) and HomeHeader (variant="header").
interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  /** Pill height in px. Default: 44 */
  height?: number;
  /** Border radius in px. Default: 22 */
  borderRadius?: number;
  /** Android elevation + iOS shadow. Default: 0 (flat). */
  elevation?: number;
  /** Background color for the pill. Default: #F5F5F5 */
  backgroundColor?: string;
  /** Icon and placeholder color. Default: #C2C2C2 */
  iconColor?: string;
  /** Input text size. Default: 14 */
  fontSize?: number;
  /** Input text color. Default: #121212 */
  textColor?: string;
  /** Whether to show the bottom border + wrapper padding. Default: true */
  showWrapper?: boolean;
}

export function SearchBar({
  onSearch,
  placeholder = "Buscar produtos...",
  height = 44,
  borderRadius = 22,
  elevation = 0,
  backgroundColor = "#F5F5F5",
  iconColor = "#C2C2C2",
  fontSize = 14,
  textColor = "#121212",
  showWrapper = true,
}: SearchBarProps) {
  const [value, setValue] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (text: string) => {
    setValue(text);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onSearch(text), 500);
  };

  const handleClear = () => {
    setValue("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onSearch("");
  };

  const handleSubmit = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onSearch(value);
  };

  const pill = (
    <View
      style={[
        styles.pill,
        {
          height,
          borderRadius,
          backgroundColor,
          elevation,
          shadowColor: elevation > 0 ? "#000" : undefined,
          shadowOffset: elevation > 0 ? { width: 0, height: 4 } : undefined,
          shadowOpacity: elevation > 0 ? 0.18 : undefined,
          shadowRadius: elevation > 0 ? 10 : undefined,
        },
      ]}
    >
      <MaterialCommunityIcons name="magnify" size={height >= 48 ? 22 : 20} color={iconColor} />

      <TextInput
        style={[styles.input, { fontSize, color: textColor }]}
        placeholder={placeholder}
        placeholderTextColor={iconColor}
        value={value}
        onChangeText={handleChange}
        returnKeyType="search"
        onSubmitEditing={handleSubmit}
        autoCorrect={false}
        autoCapitalize="none"
      />

      {value.length > 0 && (
        <TouchableOpacity
          onPress={handleClear}
          hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
        >
          <MaterialCommunityIcons name="close-circle" size={18} color={iconColor} />
        </TouchableOpacity>
      )}
    </View>
  );

  if (!showWrapper) return pill;

  return (
    <View style={styles.wrapper}>
      {pill}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    includeFontPadding: false,
  } as any,
});
