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
    <View className="flex-row items-end justify-between px-4 mt-6 mb-3">
      <View>
        {label && (
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: "700",
              color: "#C97B1F",
              textTransform: "uppercase",
              letterSpacing: 1.8,
              marginBottom: 4,
            }}
          >
            {label}
          </Text>
        )}
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: "#1A1613",
            letterSpacing: -0.7,
            lineHeight: 26,
          }}
        >
          {title}
        </Text>
      </View>

      {onSeeAll ? (
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", paddingBottom: 3 }}
          onPress={onSeeAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#1A1613" }}>
            Ver todos
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color="#1A1613" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
