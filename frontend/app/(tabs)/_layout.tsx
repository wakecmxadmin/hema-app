import React from "react";
import { Tabs } from "expo-router";
import { View, Text, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useCart } from "@/context/CartContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = {
  active: "#D91A21",
  inactive: "#C2C2C2",
  bg: "#FFFFFF",
  border: "#E0E0E0",
};

function CartIcon({ color }: { color: string }) {
  const { cartCount } = useCart();

  return (
    <View style={{ width: 24, height: 24, justifyContent: "center", alignItems: "center" }}>
      <Feather name="shopping-cart" size={22} color={color} />

      {cartCount > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: -10,
            top: -6,
            backgroundColor: BRAND.active,
            borderRadius: 10,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 2,
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1.5,
            borderColor: BRAND.bg,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "bold", textAlign: "center" }}>
            {cartCount > 99 ? "99+" : cartCount}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND.active,
        tabBarInactiveTintColor: BRAND.inactive,
        tabBarStyle: {
          backgroundColor: BRAND.bg,
          borderTopWidth: 1,
          borderTopColor: BRAND.border,
          height: Platform.OS === "android" ? 60 + insets.bottom : 85,
          paddingTop: 10,
          paddingBottom:
            Platform.OS === "android"
              ? insets.bottom > 0 ? insets.bottom : 10
              : insets.bottom,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
          marginBottom: Platform.OS === "android" ? 8 : 0,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />

      <Tabs.Screen
        name="cart"
        options={{
          title: "Carrinho",
          tabBarIcon: ({ color }) => <CartIcon color={color} />,
        }}
      />

      <Tabs.Screen
        name="orders"
        options={{
          title: "Pedidos",
          tabBarIcon: ({ color }) => <Feather name="file-text" size={22} color={color} />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
