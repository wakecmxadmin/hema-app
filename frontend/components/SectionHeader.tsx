import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface SectionHeaderProps {
  title: string;
  label?: string;
  onSeeAll?: () => void;
}

export function SectionHeader({ title, label, onSeeAll }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-4 mt-8 mb-3">
      {label ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 3,
              height: 20,
              borderRadius: 2,
              backgroundColor: "#D91A21",
            }}
          />
          <View>
            <Text className="text-[11px] font-[700] text-brand uppercase tracking-widest mb-[2px]">
              {label}
            </Text>
            <Text className="text-[18px] font-[800] text-text-primary">
              {title}
            </Text>
          </View>
        </View>
      ) : (
        <Text className="text-[18px] font-[800] text-text-primary">{title}</Text>
      )}

      {onSeeAll ? (
        <TouchableOpacity
          className="flex-row items-center self-center"
          onPress={onSeeAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Text className="text-[13px] font-[600] text-brand">Ver todos</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color="#D91A21" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
