import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface EmptyStateProps {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function EmptyState({ icon, title, subtitle, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 64, paddingHorizontal: 32 }}>
      <MaterialCommunityIcons name={icon} size={64} color="#C2C2C2" />
      <Text style={{ fontSize: 18, fontWeight: "700", color: "#121212", marginTop: 16, textAlign: "center" }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 14, color: "#666666", marginTop: 6, textAlign: "center", lineHeight: 20 }}>
          {subtitle}
        </Text>
      ) : null}
      {ctaLabel && onCta ? (
        <TouchableOpacity
          onPress={onCta}
          activeOpacity={0.8}
          style={{
            marginTop: 24,
            backgroundColor: "#D91A21",
            paddingHorizontal: 28,
            paddingVertical: 12,
            borderRadius: 25,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
