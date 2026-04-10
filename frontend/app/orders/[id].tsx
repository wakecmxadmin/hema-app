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
            Toast.show({ type: "success", text1: "Pedido cancelado!" });
            setCanceling(true);
            const response = await OrdersService.cancelOrder(id);
            setCanceling(false);

            if (response.success) {
              fetchOrderDetails(false);
            } else {
              Toast.show({
                type: "error",
                text1: "Erro ao cancelar",
                text2: response.message,
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
        return { label: "Pendente", color: "#F59E0B", bg: "#FFFBEB" };
      case "cancelled":
        return { label: "Cancelado", color: "#D91A21", bg: "#FEF2F2" };
      default:
        return { label: status, color: "#666666", bg: "#F5F5F5" };
    }
  };

  if (loading || !order) {
    return (
      <View className="flex-1 bg-neutral-100 justify-center items-center">
        <ActivityIndicator size="large" color="#D91A21" />
      </View>
    );
  }

  const badge = getStatusBadge(order.status);
  const isPickup = !order.addresses;

  const sectionShadow = Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
    },
    android: {
      elevation: 2,
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "bottom"]}>
      {/* HEADER */}
      <View className="flex-row items-center justify-between px-5 py-[15px] bg-surface border-b border-neutral-200">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 justify-center"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#121212" />
        </TouchableOpacity>
        <Text className="text-[18px] font-bold text-text-primary">
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
            colors={["#D91A21"]}
            tintColor="#D91A21"
          />
        }
      >
        {/* RESUMO DO STATUS */}
        <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
          <Text className="text-[18px] font-bold text-text-primary">
            Pedido #{order.id.substring(0, 8).toUpperCase()}
          </Text>
          <View
            className="flex-row items-center px-3 py-1 rounded-full gap-1 self-start mt-2"
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
        <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-text-primary mb-4">
            Itens
          </Text>
          {order.order_items?.map((item: any) => (
            <View
              key={item.id}
              className="flex-row justify-between items-center border-b border-neutral-200 pb-3 mb-3"
            >
              <View className="flex-1 pr-4">
                <Text className="text-[14px] text-text-primary font-medium mb-1">
                  {item.product_name}
                </Text>
                <Text className="text-[12px] text-text-secondary">
                  {item.quantity
                    ? `${item.quantity}x unitário`
                    : `${item.weight}g`}{" "}
                  • {formatPrice(item.product_price)}
                </Text>
              </View>
              <Text className="text-[14px] font-bold text-text-primary">
                {formatPrice(item.subtotal)}
              </Text>
            </View>
          ))}
        </View>

        {/* ENDEREÇO / RETIRADA */}
        <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-text-primary mb-4">
            Entrega
          </Text>
          {isPickup ? (
            <View className="flex-row items-center bg-neutral-100 p-3 rounded-btn">
              <MaterialCommunityIcons
                name="storefront"
                size={24}
                color="#D91A21"
              />
              <View className="ml-3 flex-1">
                <Text className="text-[14px] font-bold text-text-primary mb-0.5">
                  Retirada na Loja
                </Text>
                <Text className="text-[12px] text-text-secondary">
                  R. São José dos Pinhais, 187
                </Text>
              </View>
            </View>
          ) : (
            <View className="flex-row items-center bg-neutral-100 p-3 rounded-btn">
              <MaterialCommunityIcons
                name="map-marker-outline"
                size={24}
                color="#D91A21"
              />
              <View className="ml-3 flex-1">
                <Text className="text-[14px] font-bold text-text-primary mb-0.5">
                  {order.addresses.street}, {order.addresses.number}
                </Text>
                <Text className="text-[12px] text-text-secondary">
                  {order.addresses.neighborhood} - {order.addresses.city}/
                  {order.addresses.state}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* TOTAIS */}
        <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-text-primary mb-4">
            Resumo
          </Text>
          <View className="flex-row justify-between mb-2">
            <Text className="text-[14px] text-text-secondary">Subtotal</Text>
            <Text className="text-[14px] text-text-primary">
              {formatPrice(
                Number(order.total_price) - Number(order.delivery_fee),
              )}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-[14px] text-text-secondary">Taxa de Entrega</Text>
            <Text className="text-[14px] text-text-primary">
              {order.delivery_fee > 0
                ? formatPrice(order.delivery_fee)
                : "Grátis"}
            </Text>
          </View>
          <View className="flex-row justify-between border-t border-neutral-200 pt-3 mt-1">
            <Text className="text-[16px] font-bold text-text-primary">
              Total Pago
            </Text>
            <Text className="text-[18px] font-bold text-brand">
              {formatPrice(order.total_price)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {order.status === "pending" && (
        <View className="p-4 bg-surface border-t border-neutral-200">
          <TouchableOpacity
            className="py-4 rounded-btn border border-brand items-center"
            onPress={handleCancelOrder}
            disabled={canceling}
          >
            {canceling ? (
              <ActivityIndicator color="#D91A21" />
            ) : (
              <Text className="text-brand text-[16px] font-bold">
                Cancelar Pedido
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
