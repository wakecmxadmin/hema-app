import React, { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";
import { useCart } from "@/context/CartContext";

type PaymentStatus = "success" | "failure" | "pending";

const statusConfig: Record<
  PaymentStatus,
  {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
    title: string;
    message: string;
  }
> = {
  success: {
    icon: "check-decagram",
    color: "#28A745",
    title: "Pagamento Aprovado!",
    message:
      "Seu pagamento foi confirmado. Já vamos começar a preparar seu pedido.",
  },
  pending: {
    icon: "clock-outline",
    color: "#F5A623",
    title: "Pagamento Pendente",
    message:
      "Estamos aguardando a confirmação do seu pagamento. Você será notificado quando for aprovado.",
  },
  failure: {
    icon: "close-circle",
    color: "#D91A21",
    title: "Pagamento Recusado",
    message:
      "Não foi possível processar seu pagamento. Tente novamente ou escolha outra forma de pagamento.",
  },
};

export default function PaymentResultPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refreshCart } = useCart();

  const status = (id as PaymentStatus) || "pending";
  const config = statusConfig[status] || statusConfig.pending;

  useEffect(() => {
    if (status === "success") {
      refreshCart();
    }
  }, [status]);

  return (
    <SafeAreaView
      className="flex-1 bg-surface-secondary"
      edges={["top", "bottom"]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-1 justify-center items-center px-8">
        <MaterialCommunityIcons
          name={config.icon}
          size={100}
          color={config.color}
        />
        <Text className="text-2xl font-bold text-text-primary mt-6 text-center">
          {config.title}
        </Text>
        <Text className="text-base text-text-secondary text-center mt-3 leading-6">
          {config.message}
        </Text>

        <TouchableOpacity
          className="bg-brand py-4 px-8 rounded-btn mt-10 w-full items-center"
          onPress={() => {
            if (status === "failure") {
              router.replace("/checkout");
            } else {
              router.replace("/(tabs)/orders");
            }
          }}
        >
          <Text className="text-brand-on text-base font-bold">
            {status === "failure" ? "Tentar Novamente" : "Ver Meus Pedidos"}
          </Text>
        </TouchableOpacity>

        {status !== "success" && (
          <TouchableOpacity
            className="mt-4 py-2"
            onPress={() => router.replace("/(tabs)/home")}
          >
            <Text className="text-text-secondary text-sm font-medium">
              Voltar para a Home
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
