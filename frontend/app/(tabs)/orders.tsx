import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { OrdersService } from "@/services/orders";
import { useCart } from "@/context/CartContext";
import { AuthRequiredModal } from "@/components/AuthRequiredModal";

type FilterKey = "all" | "active" | "done";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Em andamento" },
  { key: "done", label: "Concluídos" },
];

const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "shipped", "in_delivery"];
const DONE_STATUSES = ["delivered", "completed", "cancelled"];

function getStatusConfig(status: string) {
  switch (status) {
    case "pending":
      return { label: "Em preparo", color: "#F59E0B", bg: "#FFFBEB", icon: "clock-outline" as const };
    case "confirmed":
      return { label: "Confirmado", color: "#3B82F6", bg: "#EFF6FF", icon: "check-outline" as const };
    case "preparing":
      return { label: "Preparando", color: "#F59E0B", bg: "#FFFBEB", icon: "food-outline" as const };
    case "shipped":
    case "in_delivery":
      return { label: "Saiu para entrega", color: "#3B82F6", bg: "#EFF6FF", icon: "truck-delivery-outline" as const };
    case "delivered":
    case "completed":
      return { label: "Entregue", color: "#10B981", bg: "#ECFDF5", icon: "check-circle-outline" as const };
    case "cancelled":
      return { label: "Cancelado", color: "#D91A21", bg: "#FEF2F2", icon: "close-circle-outline" as const };
    default:
      return { label: status, color: "#666666", bg: "#F5F5F5", icon: "information-outline" as const };
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function formatPrice(price: number) {
  return Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function OrderCard({ order, onPress }: { order: any; onPress: () => void }) {
  const statusConfig = getStatusConfig(order.status);
  const { date, time } = formatDate(order.created_at);
  const items: any[] = order.order_items || [];
  const displayItems = items.slice(0, 2);
  const extraCount = items.length - 2;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      className="bg-surface rounded-card mb-3 overflow-hidden"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {/* Top row: status + date */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-200">
        <View
          className="flex-row items-center gap-1 px-3 py-1 rounded-full"
          style={{ backgroundColor: statusConfig.bg }}
        >
          <MaterialCommunityIcons
            name={statusConfig.icon}
            size={13}
            color={statusConfig.color}
          />
          <Text className="text-[12px] font-[700]" style={{ color: statusConfig.color }}>
            {statusConfig.label}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-[12px] font-[600] text-text-secondary">{date}</Text>
          <Text className="text-[11px] text-neutral-300">{time}</Text>
        </View>
      </View>

      {/* Middle: order ID + items */}
      <View className="px-4 py-3">
        <Text className="text-[13px] font-[800] text-text-primary mb-2">
          Pedido #{order.id.substring(0, 8).toUpperCase()}
        </Text>

        {displayItems.map((item: any) => (
          <View key={item.id} className="flex-row items-center mb-1">
            <View className="w-1 h-1 rounded-full bg-neutral-300 mr-2" />
            <Text className="text-[13px] text-text-secondary" numberOfLines={1}>
              {item.product_name}
              {item.quantity ? ` × ${item.quantity}` : item.weight ? ` — ${item.weight}g` : ""}
            </Text>
          </View>
        ))}

        {extraCount > 0 && (
          <Text className="text-[12px] text-neutral-300 mt-0.5 ml-4">
            + {extraCount} {extraCount === 1 ? "item" : "itens"}
          </Text>
        )}
      </View>

      {/* Bottom: total + CTA */}
      <View className="flex-row items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-100">
        <View>
          <Text className="text-[11px] text-neutral-300 font-[500]">Total</Text>
          <Text className="text-[16px] font-[800] text-text-primary">
            {formatPrice(order.total_price)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onPress}
          className="flex-row items-center gap-1 bg-brand p-2 rounded-full"
          activeOpacity={0.8}
        >
          <Text className="text-[12px] font-[700] text-brand-on">Ver detalhes</Text>
          <MaterialCommunityIcons name="arrow-right" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function OrdersTabScreen() {
  const router = useRouter();
  const { isAuthenticated } = useCart();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [showAuthModal, setShowAuthModal] = useState(false);

  const fetchOrders = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    const response = await OrdersService.getUserOrders();
    if (response.success && response.data) {
      setOrders(response.data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        fetchOrders(true);
      } else {
        setLoading(false);
        setShowAuthModal(true);
      }
    }, [isAuthenticated]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders(false);
  };

  const filteredOrders = orders.filter((o) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "active") return ACTIVE_STATUSES.includes(o.status);
    if (activeFilter === "done") return DONE_STATUSES.includes(o.status);
    return true;
  });

  return (
    <SafeAreaView className="flex-1 bg-surface-secondary" edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />

      {/* Header */}
      <View className="px-5 pt-4 pb-3 bg-surface-secondary">
        <Text className="text-[26px] font-[800] text-text-primary">Meus Pedidos</Text>
      </View>

      {/* Filter pills */}
      <View className="flex-row px-5 gap-2 mb-4">
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              className={`px-4 py-2 rounded-full border ${
                isActive
                  ? "bg-brand border-brand"
                  : "bg-surface border-neutral-200"
              }`}
              activeOpacity={0.75}
            >
              <Text
                className={`text-[13px] font-[600] ${isActive ? "text-brand-on" : "text-text-secondary"}`}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#D91A21" />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => router.push(`/orders/${item.id}` as any)}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 24,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#D91A21"]}
              tintColor="#D91A21"
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-16">
              <MaterialCommunityIcons name="receipt-text-outline" size={64} color="#C2C2C2" />
              <Text className="text-[16px] font-[600] text-neutral-300 mt-4 text-center">
                {activeFilter === "all"
                  ? "Você ainda não fez nenhum pedido."
                  : "Nenhum pedido nesta categoria."}
              </Text>
              {activeFilter === "all" && (
                <TouchableOpacity
                  className="mt-5 bg-brand px-6 py-3 rounded-full"
                  onPress={() => router.push("/(tabs)/home")}
                  activeOpacity={0.8}
                >
                  <Text className="text-brand-on font-[700] text-[14px]">Ir para a loja</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      <AuthRequiredModal
        visible={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          router.navigate("/(tabs)/home" as any);
        }}
        message="Você precisa estar logado para ver seus pedidos."
      />
    </SafeAreaView>
  );
}
