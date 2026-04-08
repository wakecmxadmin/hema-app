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
    <View className="flex-row items-flex-end justify-between px-4 mt-6 mb-3">
      <View>
        {label ? (
          <Text className="text-[10px] font-[800] text-brand uppercase tracking-widest mb-[2px]">
            {label}
          </Text>
        ) : null}
        <Text className="text-[18px] font-[800] text-text-primary">{title}</Text>
      </View>

      {onSeeAll ? (
        <TouchableOpacity
          className="flex-row items-center self-center"
          onPress={onSeeAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Text className="text-[13px] font-[600] text-brand">
            Ver todos
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color="#8C0000" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
