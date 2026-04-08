import React, { useRef, useState } from "react";
import { View, TextInput, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

// Standalone pilled search bar — manages its own state.
// Used when search is outside the HomeHeader (e.g. category screens).
interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchBar({
  onSearch,
  placeholder = "Buscar produtos...",
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

  return (
    <View className="px-4 py-3 bg-surface border-b border-neutral-200">
      <View
        className="flex-row items-center bg-neutral-100 h-[44px] px-4 gap-2"
        style={{ borderRadius: 22 }}
      >
        <MaterialCommunityIcons name="magnify" size={20} color="#C2C2C2" />

        <TextInput
          className="flex-1 text-[14px] text-text-primary"
          style={{ paddingVertical: 0, includeFontPadding: false }}
          placeholder={placeholder}
          placeholderTextColor="#C2C2C2"
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
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name="close-circle"
              size={18}
              color="#C2C2C2"
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
