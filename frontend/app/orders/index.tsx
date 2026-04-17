import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  StatusBar,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { OrdersService } from "@/services/orders";

export default function OrdersListScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = async (isInitial = false) => {
    if (isInitial) setLoading(true);

    const response = await OrdersService.getUserOrders();

    if (response.success && response.data) {
      setOrders(response.data);
    } else {
      console.log("Falha ao carregar lista de pedidos:", response.message);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchOrders(true);
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders(false);
  };

  const formatPrice = (price: number) => {
    return Number(price).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return {
          label: "Pendente",
          color: "#FFA000",
          bg: "#FFF8E1",
          icon: "clock-outline",
        };
      case "cancelled":
        return {
          label: "Cancelado",
          color: "#D91A21",
          bg: "#FDEDED",
          icon: "cancel",
        };
      default:
        return {
          label: status,
          color: "#666",
          bg: "#F5F5F5",
          icon: "information-outline",
        };
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#F5F5F5] justify-center items-center">
        <ActivityIndicator size="large" color="#D91A21" />
      </View>
    );
  }

  // Sombra padronizada para os cards
  const cardShadow = Platform.select({
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
    <SafeAreaView className="flex-1 bg-[#F5F5F5]" edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      {/* HEADER */}
      <View className="flex-row items-center justify-between px-5 py-[15px] bg-white border-b border-[#EAEAEA]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 justify-center"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text className="text-[18px] font-bold text-[#1A1A1A]">
          Meus Pedidos
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView
        contentContainerClassName={
          orders.length === 0 ? "flex-1" : "p-4 flex-grow"
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#D91A21"]}
          />
        }
      >
        {orders.length === 0 ? (
          <View className="flex-1 justify-center items-center mt-[100px] px-4">
            <MaterialCommunityIcons name="receipt" size={64} color="#CCC" />
            <Text className="text-[16px] text-[#666] mt-4 mb-6 text-center">
              Você ainda não fez nenhum pedido.
            </Text>
            <TouchableOpacity
              className="bg-[#D91A21] px-6 py-3 rounded-lg"
              onPress={() => router.push("/(tabs)/home")}
            >
              <Text className="text-white font-bold text-[16px]">
                Ir para a loja
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          orders.map((order) => {
            const badge = getStatusBadge(order.status);
            const itemsCount = order.order_items?.length || 0;
            const firstItemName =
              order.order_items?.[0]?.product_name || "Itens do pedido";

            return (
              <TouchableOpacity
                key={order.id}
                className="bg-white rounded-xl p-4 mb-3"
                style={cardShadow}
                onPress={() => router.push(`/orders/${order.id}` as any)}
              >
                <View className="flex-row justify-between mb-3">
                  <Text className="text-[14px] font-bold text-[#1A1A1A]">
                    Pedido #{order.id.substring(0, 8).toUpperCase()}
                  </Text>
                  <Text className="text-[12px] text-[#666]">
                    {formatDate(order.created_at)}
                  </Text>
                </View>

                <View className="flex-row justify-between items-center mb-4">
                  <Text
                    className="flex-1 text-[14px] text-[#444] mr-4"
                    numberOfLines={1}
                  >
                    {itemsCount > 1
                      ? `${firstItemName} e mais ${itemsCount - 1} item(ns)`
                      : firstItemName}
                  </Text>
                  <Text className="text-[16px] font-bold text-[#1A1A1A]">
                    {formatPrice(order.total_price)}
                  </Text>
                </View>

                <View className="flex-row justify-between items-center border-t border-[#F0F0F0] pt-3">
                  <View
                    className="flex-row items-center px-3 py-1 rounded-2xl gap-1"
                    style={{ backgroundColor: badge.bg }}
                  >
                    <MaterialCommunityIcons
                      name={badge.icon as any}
                      size={14}
                      color={badge.color}
                    />
                    <Text
                      className="text-[13px] font-bold"
                      style={{ color: badge.color }}
                    >
                      {badge.label}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color="#999"
                  />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
