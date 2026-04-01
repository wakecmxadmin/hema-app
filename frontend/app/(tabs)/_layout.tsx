import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import { View, Text, Platform } from "react-native";
import { useCart } from "@/context/CartContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND_COLORS = {
  primary: "#E31837",
  inactive: "#8E8E8E",
  background: "#FFFFFF",
  border: "#F0F0F0",
};

function CartIconWithBadge({ color }: { color: string }) {
  const { cartCount } = useCart();

  return (
    <View
      style={{
        width: 24,
        height: 24,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <FontAwesome name="shopping-cart" size={22} color={color} />

      {cartCount > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: -10,
            top: -6,
            backgroundColor: BRAND_COLORS.primary,
            borderRadius: 10,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 2,
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1.5,
            borderColor: BRAND_COLORS.background,
          }}
        >
          <Text
            style={{
              color: "white",
              fontSize: 9,
              fontWeight: "bold",
              textAlign: "center",
            }}
          >
            {cartCount > 99 ? "99+" : cartCount}
          </Text>
        </View>
      )}
    </View>
  );
}

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND_COLORS.primary,
        tabBarInactiveTintColor: BRAND_COLORS.inactive,
        tabBarStyle: {
          backgroundColor: BRAND_COLORS.background,
          borderTopWidth: 1,
          borderTopColor: BRAND_COLORS.border,

          // --- AJUSTE DINÂMICO PARA ANDROID E IOS ---
          // A altura deve ser uma base fixa + o tamanho da barra do sistema (insets.bottom)
          height:
            Platform.OS === "android"
              ? 60 + insets.bottom // No Android, se houver botões, insets.bottom será ~48
              : 85, // No iOS o Safe Area já costuma ser bem tratado

          paddingTop: 10,

          // O preenchimento inferior agora é exatamente o espaço da barra do sistema + um respiro
          paddingBottom:
            Platform.OS === "android"
              ? insets.bottom > 0
                ? insets.bottom
                : 10
              : insets.bottom,

          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
          // Ajuste fino para o texto não sumir
          marginBottom: Platform.OS === "android" ? 8 : 0,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
        }}
      />

      <Tabs.Screen
        name="cart"
        options={{
          title: "Carrinho",
          tabBarIcon: ({ color }) => <CartIconWithBadge color={color} />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
