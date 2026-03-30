import React, { useState, useRef } from "react";
import { View, TextInput, Image, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export function HomeHeader({ onSearch }: { onSearch: (q: string) => void }) {
  const [value, setValue] = useState("");
  const timeoutRef = useRef<any>(null);

  const handleTextChange = (text: string) => {
    setValue(text);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      onSearch(text);
    }, 500);
  };

  const handleClear = () => {
    setValue("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onSearch(""); // Limpa a busca
  };

  const handleForceSearch = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onSearch(value); // Força a busca imediata ao clicar na lupa
  };

  return (
    <View className="flex-row items-center gap-[12px] bg-[#E31837] pb-[15px] pt-[5px] px-[16px]">
      <View className="items-center justify-center">
        <Image
          source={require("@/assets/images/logo.jpg")}
          className="h-[44px] w-[44px] rounded-[22px]"
          resizeMode="contain"
        />
      </View>

      <View className="flex-1 flex-row items-center h-[42px] content-center rounded-[12px] bg-[#F5F5F5] px-[12px]">
        <TouchableOpacity onPress={handleForceSearch} className="p-[4px]">
          <MaterialCommunityIcons name="magnify" size={24} color="#999" />
        </TouchableOpacity>

        <TextInput
          className="h-full flex-1 ml-[8px] text-[14px] text-[#333]"
          placeholder="Buscar produtos..."
          placeholderTextColor="#999"
          value={value}
          onChangeText={handleTextChange}
          returnKeyType="search"
          onSubmitEditing={handleForceSearch}
        />

        {value.length > 0 && (
          <TouchableOpacity onPress={handleClear} className="p-[4px]">
            <MaterialCommunityIcons
              name="close-circle"
              size={20}
              color="#999"
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
