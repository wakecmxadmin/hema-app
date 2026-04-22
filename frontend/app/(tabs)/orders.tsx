import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
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
import { EmptyState } from "@/components/EmptyState";

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

function OrderCardSkeleton() {
  const shimmer = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, [shimmer]);
  const s = { opacity: shimmer, backgroundColor: "#EAE3D7" };
  return (
    <View className="bg-surface rounded-card mb-3 overflow-hidden" style={{ elevation: 2 }}>
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-200">
        <Animated.View style={[s, { width: 100, height: 24, borderRadius: 12 }]} />
        <View className="items-end gap-1">
          <Animated.View style={[s, { width: 72, height: 12, borderRadius: 4 }]} />
          <Animated.View style={[s, { width: 48, height: 10, borderRadius: 4 }]} />
        </View>
      </View>
      <View className="px-4 py-3">
        <Animated.View style={[s, { width: 140, height: 14, borderRadius: 4, marginBottom: 10 }]} />
        <Animated.View style={[s, { width: "80%", height: 12, borderRadius: 4, marginBottom: 6 }]} />
        <Animated.View style={[s, { width: "60%", height: 12, borderRadius: 4 }]} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#EAE3D7", backgroundColor: "#FAF6F0" }}>
        <View className="gap-1">
          <Animated.View style={[s, { width: 36, height: 10, borderRadius: 4 }]} />
          <Animated.View style={[s, { width: 72, height: 18, borderRadius: 4 }]} />
        </View>
        <Animated.View style={[s, { width: 100, height: 32, borderRadius: 20 }]} />
      </View>
    </View>
  );
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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#EAE3D7", backgroundColor: "#FAF6F0" }}>
        <View>
          <Text className="text-[11px] text-neutral-300 font-[500]">Total</Text>
          <Text className="text-[16px] font-[800] text-text-primary">
            {formatPrice(order.total_price)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onPress}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1A1613", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFFFFF" }}>Ver detalhes</Text>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAF6F0" }} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF6F0" />

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
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
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                backgroundColor: isActive ? "#1A1613" : "#FFFFFF",
                borderColor: isActive ? "#1A1613" : "#EAE3D7",
              }}
              activeOpacity={0.75}
            >
              <Text
                style={{ fontSize: 13, fontWeight: "600", color: isActive ? "#FFFFFF" : "#5C544C" }}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View className="px-4 pt-2">
          {[1, 2, 3].map((i) => <OrderCardSkeleton key={i} />)}
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
            <EmptyState
              icon="receipt-text-outline"
              title={activeFilter === "all" ? "Nenhum pedido ainda" : "Nenhum pedido nesta categoria"}
              subtitle={activeFilter === "all" ? "Faça seu primeiro pedido e acompanhe tudo aqui." : undefined}
              ctaLabel={activeFilter === "all" ? "Ir para a loja" : undefined}
              onCta={activeFilter === "all" ? () => router.push("/(tabs)/home") : undefined}
            />
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
