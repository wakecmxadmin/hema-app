import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface QuickActionsProps {
  onCategoriesPress: () => void;
  onOffersPress: () => void;
  onOrdersPress: () => void;
  onNewPress: () => void;
}

export function QuickActions({
  onCategoriesPress,
  onOffersPress,
  onOrdersPress,
  onNewPress,
}: QuickActionsProps) {
  const actions = [
    { icon: "view-grid-outline" as const, label: "Categorias", onPress: onCategoriesPress },
    { icon: "tag-outline" as const, label: "Ofertas", onPress: onOffersPress },
    { icon: "clipboard-list-outline" as const, label: "Meus Pedidos", onPress: onOrdersPress },
    { icon: "star-outline" as const, label: "Novidades", onPress: onNewPress },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-around",
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 20,
      }}
    >
      {actions.map((action) => (
        <TouchableOpacity
          key={action.label}
          onPress={action.onPress}
          activeOpacity={0.72}
          style={{ alignItems: "center" }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: "#FEECED",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
            }}
          >
            <MaterialCommunityIcons name={action.icon} size={24} color="#D91A21" />
          </View>
          <Text
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: "#121212",
              textAlign: "center",
            }}
          >
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
