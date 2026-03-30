import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  RefreshControl,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { OrdersService } from "@/services/orders";
import { Toast } from "@/util/toast";

export default function OrderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrderDetails = async (isInitial = true) => {
    if (isInitial) setLoading(true);

    const response = await OrdersService.getOrderDetails(id);

    if (response.success && response.data) {
      setOrder(response.data);
    } else {
      Toast.show({
        type: "error",
        text1: "Ops!",
        text2: response.message || "Não foi possível carregar o pedido.",
      });
      router.back();
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchOrderDetails(true);
  }, [id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrderDetails(false);
  };

  const handleCancelOrder = () => {
    Alert.alert(
      "Cancelar Pedido",
      "Tem certeza que deseja cancelar este pedido?",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim, cancelar",
          style: "destructive",
          onPress: async () => {
            setCanceling(true);

            // 🔴 NOVO PADRÃO: Chamada limpa
            const response = await OrdersService.cancelOrder(id);

            setCanceling(false);

            if (response.success) {
              Toast.show({
                type: "success",
                text1: "Pedido Cancelado",
                text2: response.message, // "Pedido cancelado com sucesso."
              });
              fetchOrderDetails(false); // Recarrega silenciosamente para atualizar a badge da tela
            } else {
              Toast.show({
                type: "error",
                text1: "Erro ao cancelar",
                text2: response.message, // Ex: "Este pedido já está em processamento."
              });
            }
          },
        },
      ],
    );
  };

  const formatPrice = (price: number) => {
    return Number(price).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return { label: "Pendente", color: "#FFA000", bg: "#FFF8E1" };
      case "cancelled":
        return { label: "Cancelado", color: "#E31837", bg: "#FDEDED" };
      default:
        return { label: status, color: "#666", bg: "#F5F5F5" };
    }
  };

  if (loading || !order) {
    return (
      <View className="flex-1 bg-[#F5F5F5] justify-center items-center">
        <ActivityIndicator size="large" color="#E31837" />
      </View>
    );
  }

  const badge = getStatusBadge(order.status);
  const isPickup = !order.addresses;

  // Sombra padronizada para as sections
  const sectionShadow = Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
    },
    android: {
      elevation: 2,
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F5]" edges={["top", "bottom"]}>
      {/* HEADER */}
      <View className="flex-row items-center justify-between px-5 py-[15px] bg-white border-b border-[#EAEAEA]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 justify-center"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text className="text-[18px] font-bold text-[#1A1A1A]">
          Detalhes do Pedido
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView
        contentContainerClassName="p-4 pb-10"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#E31837"]}
            tintColor="#E31837"
          />
        }
      >
        {/* RESUMO DO STATUS */}
        <View className="bg-white rounded-xl p-4 mb-4" style={sectionShadow}>
          <Text className="text-[18px] font-bold text-[#1A1A1A]">
            Pedido #{order.id.substring(0, 8).toUpperCase()}
          </Text>
          <View
            className="flex-row items-center px-2.5 py-1.5 rounded-2xl gap-1 self-start mt-2"
            style={{ backgroundColor: badge.bg }}
          >
            <Text
              className="text-[13px] font-bold"
              style={{ color: badge.color }}
            >
              {badge.label}
            </Text>
          </View>
        </View>

        {/* LISTA DE ITENS */}
        <View className="bg-white rounded-xl p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-[#1A1A1A] mb-4">
            Itens
          </Text>
          {order.order_items?.map((item: any) => (
            <View
              key={item.id}
              className="flex-row justify-between items-center border-b border-[#F0F0F0] pb-3 mb-3"
            >
              <View className="flex-1 pr-4">
                <Text className="text-[14px] text-[#1A1A1A] font-medium mb-1">
                  {item.product_name}
                </Text>
                <Text className="text-[12px] text-[#666]">
                  {item.quantity
                    ? `${item.quantity}x unitário`
                    : `${item.weight}g`}{" "}
                  • {formatPrice(item.product_price)}
                </Text>
              </View>
              <Text className="text-[14px] font-bold text-[#1A1A1A]">
                {formatPrice(item.subtotal)}
              </Text>
            </View>
          ))}
        </View>

        {/* ENDEREÇO / RETIRADA */}
        <View className="bg-white rounded-xl p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-[#1A1A1A] mb-4">
            Entrega
          </Text>
          {isPickup ? (
            <View className="flex-row items-center bg-[#F9F9F9] p-3 rounded-lg">
              <MaterialCommunityIcons
                name="storefront"
                size={24}
                color="#E31837"
              />
              <View className="ml-3 flex-1">
                <Text className="text-[14px] font-bold text-[#1A1A1A] mb-0.5">
                  Retirada na Loja
                </Text>
                <Text className="text-[12px] text-[#666]">
                  R. São José dos Pinhais, 187
                </Text>
              </View>
            </View>
          ) : (
            <View className="flex-row items-center bg-[#F9F9F9] p-3 rounded-lg">
              <MaterialCommunityIcons
                name="map-marker-outline"
                size={24}
                color="#E31837"
              />
              <View className="ml-3 flex-1">
                <Text className="text-[14px] font-bold text-[#1A1A1A] mb-0.5">
                  {order.addresses.street}, {order.addresses.number}
                </Text>
                <Text className="text-[12px] text-[#666]">
                  {order.addresses.neighborhood} - {order.addresses.city}/
                  {order.addresses.state}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* TOTAIS */}
        <View className="bg-white rounded-xl p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-[#1A1A1A] mb-4">
            Resumo
          </Text>
          <View className="flex-row justify-between mb-2">
            <Text className="text-[14px] text-[#666]">Subtotal</Text>
            <Text className="text-[14px] text-[#1A1A1A]">
              {formatPrice(
                Number(order.total_price) - Number(order.delivery_fee),
              )}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-[14px] text-[#666]">Taxa de Entrega</Text>
            <Text className="text-[14px] text-[#1A1A1A]">
              {order.delivery_fee > 0
                ? formatPrice(order.delivery_fee)
                : "Grátis"}
            </Text>
          </View>
          <View className="flex-row justify-between border-t border-[#EAEAEA] pt-3 mt-1">
            <Text className="text-[16px] font-bold text-[#1A1A1A]">
              Total Pago
            </Text>
            <Text className="text-[18px] font-bold text-[#E31837]">
              {formatPrice(order.total_price)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {order.status === "pending" && (
        <View className="p-4 bg-white border-t border-[#EAEAEA]">
          <TouchableOpacity
            className="py-3.5 rounded-lg border border-[#E31837] items-center"
            onPress={handleCancelOrder}
            disabled={canceling}
          >
            {canceling ? (
              <ActivityIndicator color="#E31837" />
            ) : (
              <Text className="text-[#E31837] text-[16px] font-bold">
                Cancelar Pedido
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
