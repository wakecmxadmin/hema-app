import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  FlatList,
  RefreshControl,
  StatusBar,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import {
  AdminOrdersService,
  AdminOrderListItem,
  AdminOrderStatus,
} from "@/services/admin-orders";
import { useCart } from "@/context/CartContext";
import { EmptyState } from "@/components/EmptyState";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

// ─── Filter definition ─────────────────────────────────────────────────────────
type FilterKey =
  | "all"
  | "new"
  | "waiting_payment"
  | "in_progress"
  | "done"
  | "cancelled"
  | "alerts";

interface FilterDef {
  key: FilterKey;
  label: string;
  // Either match by status, or a custom predicate
  statuses?: AdminOrderStatus[];
  predicate?: (o: AdminOrderListItem) => boolean;
}

const FILTERS: FilterDef[] = [
  { key: "all", label: "Todos" },
  { key: "new", label: "Novos", statuses: ["pending"] },
  { key: "waiting_payment", label: "Pagamento", statuses: ["waiting_payment"] },
  {
    key: "in_progress",
    label: "Em preparo",
    statuses: ["confirmed", "preparing", "shipped", "in_delivery"],
  },
  { key: "done", label: "Entregues", statuses: ["delivered", "completed"] },
  { key: "cancelled", label: "Cancelados", statuses: ["cancelled"] },
  {
    key: "alerts",
    label: "Atenção",
    predicate: (o) => !!o.shipping_last_error,
  },
];

function getFilterCount(key: FilterKey, counts: {
  new: number;
  waiting_payment: number;
  in_progress: number;
  done: number;
  cancelled: number;
  alerts: number;
  total: number;
}) {
  switch (key) {
    case "all":
      return counts.total;
    case "new":
      return counts.new;
    case "waiting_payment":
      return counts.waiting_payment;
    case "in_progress":
      return counts.in_progress;
    case "done":
      return counts.done;
    case "cancelled":
      return counts.cancelled;
    case "alerts":
      return counts.alerts;
    default:
      return 0;
  }
}

function matchesFilter(o: AdminOrderListItem, filter: FilterDef): boolean {
  if (filter.predicate) return filter.predicate(o);
  if (filter.statuses) return filter.statuses.includes(o.status);
  return true;
}

// ─── Formatters ────────────────────────────────────────────────────────────────
function formatPrice(price: number) {
  return Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

// ─── Status / Payment metadata ─────────────────────────────────────────────────
interface StatusVisuals {
  label: string;
  color: string;
  bg: string;
  accent: string; // left border accent
  icon: MaterialIconName;
}

function getStatusVisuals(status: string): StatusVisuals {
  switch (status) {
    case "pending":
      return {
        label: "Pendente",
        color: "#D91A21",
        bg: "#FEF2F2",
        accent: "#D91A21",
        icon: "alert-circle",
      };
    case "waiting_payment":
      return {
        label: "Aguard. pagamento",
        color: "#F59E0B",
        bg: "#FFFBEB",
        accent: "#F59E0B",
        icon: "cash-clock",
      };
    case "confirmed":
      return {
        label: "Confirmado",
        color: "#3B82F6",
        bg: "#EFF6FF",
        accent: "#3B82F6",
        icon: "check-outline",
      };
    case "preparing":
      return {
        label: "Preparando",
        color: "#F59E0B",
        bg: "#FFFBEB",
        accent: "#3B82F6",
        icon: "food-outline",
      };
    case "shipped":
    case "in_delivery":
      return {
        label: "Saiu p/ entrega",
        color: "#3B82F6",
        bg: "#EFF6FF",
        accent: "#3B82F6",
        icon: "truck-delivery-outline",
      };
    case "delivered":
    case "completed":
      return {
        label: "Entregue",
        color: "#10B981",
        bg: "#ECFDF5",
        accent: "#10B981",
        icon: "check-circle-outline",
      };
    case "cancelled":
      return {
        label: "Cancelado",
        color: "#6B7280",
        bg: "#F3F4F6",
        accent: "#9CA3AF",
        icon: "close-circle-outline",
      };
    default:
      return {
        label: status,
        color: "#6B7280",
        bg: "#F3F4F6",
        accent: "#D1D5DB",
        icon: "information-outline",
      };
  }
}

const PAYMENT_METHOD_INFO: Record<
  string,
  { label: string; icon: MaterialIconName }
> = {
  pix: { label: "PIX", icon: "qrcode" },
  credit_card: { label: "Cartão", icon: "credit-card-outline" },
  cash: { label: "Dinheiro", icon: "cash" },
};

// ─── Order card ────────────────────────────────────────────────────────────────
interface OrderCardProps {
  order: AdminOrderListItem;
  onPress: () => void;
}

function OrderCard({ order, onPress }: OrderCardProps) {
  const visuals = getStatusVisuals(order.status);
  const customer = order.customer?.name?.trim() || "Cliente";
  const items = order.order_items || [];
  const hasAlert = !!order.shipping_last_error;
  const isPickup = !order.address_id;
  const deliveryCity = order.addresses?.city ?? null;
  const firstItem = items[0];
  const extraCount = Math.max(items.length - 1, 0);
  const paymentInfo = PAYMENT_METHOD_INFO[order.payment_method] ?? {
    label: order.payment_method || "Pagamento",
    icon: "wallet" as MaterialIconName,
  };
  const paymentLabel =
    order.payment_status === "paid"
      ? "Pago"
      : order.payment_status === "waiting_cash"
        ? "A receber"
        : order.payment_status === "failed" || order.payment_status === "rejected"
          ? "Recusado"
          : "Pendente";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      className="bg-surface rounded-btn mb-3"
      style={{
        borderWidth: 1,
        borderColor: "#EAE3D7",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
      }}
    >
      <View className="px-4 py-3">
        <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
          <View className="flex-row items-center" style={{ gap: 6, flex: 1, minWidth: 0 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: visuals.accent }} />
            <Text
              className="text-[12px] font-[700]"
              style={{ color: visuals.color, lineHeight: 16, flexShrink: 1 }}
              numberOfLines={1}
            >
              {visuals.label}
            </Text>
            {hasAlert && (
              <MaterialCommunityIcons name="alert-circle" size={14} color="#D91A21" />
            )}
          </View>
          <Text className="text-[11.5px] text-text-secondary flex-shrink-0" style={{ lineHeight: 16 }}>
            {relativeTime(order.created_at)}
          </Text>
        </View>

        <View className="flex-row items-start justify-between mt-2" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-[15px] font-[800] text-text-primary" numberOfLines={1} style={{ lineHeight: 20 }}>
              #{order.id.substring(0, 8).toUpperCase()}
            </Text>
            <Text className="text-[13px] text-text-secondary mt-0.5" numberOfLines={1} style={{ lineHeight: 18 }}>
              {customer}
              {order.customer?.phone ? ` • ${order.customer.phone}` : ""}
            </Text>
          </View>
          <Text className="text-[16px] font-[800] text-text-primary flex-shrink-0" style={{ lineHeight: 21 }}>
            {formatPrice(order.total_price)}
          </Text>
        </View>

        <View className="flex-row items-center mt-2" style={{ gap: 6 }}>
          <MaterialCommunityIcons
            name={isPickup ? "storefront-outline" : "truck-fast-outline"}
            size={14}
            color="#8A8079"
          />
          <Text className="text-[12.5px] text-text-secondary flex-1" numberOfLines={1} style={{ lineHeight: 17 }}>
            {isPickup ? "Retirada na loja" : deliveryCity ? `Entrega - ${deliveryCity}` : "Entrega"}
          </Text>
        </View>

        {firstItem && (
          <Text className="text-[12.5px] text-text-secondary mt-1.5" numberOfLines={1} style={{ lineHeight: 17 }}>
            {firstItem.product_name}
            {firstItem.quantity ? ` x ${firstItem.quantity}` : firstItem.weight ? ` - ${firstItem.weight}g` : ""}
            {extraCount > 0 ? ` +${extraCount}` : ""}
          </Text>
        )}

        <View className="flex-row items-center mt-2.5 pt-2.5" style={{ borderTopWidth: 1, borderTopColor: "#F2EBDF", gap: 12 }}>
          <View className="flex-row items-center" style={{ gap: 5, flex: 1, minWidth: 0 }}>
            <MaterialCommunityIcons name={paymentInfo.icon} size={13} color="#8A8079" />
            <Text className="text-[12px] text-text-secondary" numberOfLines={1} style={{ lineHeight: 16, flexShrink: 1 }}>
              {paymentInfo.label} • {paymentLabel}
            </Text>
          </View>
          {hasAlert && (
            <Text className="text-[12px] font-[700] flex-shrink-0" style={{ color: "#D91A21", lineHeight: 16 }}>
              Atenção
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────
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
    <View className="bg-surface rounded-card mb-3 overflow-hidden flex-row" style={{ elevation: 2 }}>
      <View style={{ width: 4, backgroundColor: "#EAE3D7" }} />
      <View className="flex-1 px-4 py-4 gap-2">
        <Animated.View style={[s, { width: 100, height: 18, borderRadius: 10 }]} />
        <Animated.View style={[s, { width: 140, height: 14, borderRadius: 4 }]} />
        <Animated.View style={[s, { width: "70%", height: 12, borderRadius: 4 }]} />
        <Animated.View style={[s, { width: "50%", height: 12, borderRadius: 4 }]} />
      </View>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function AdminOrdersScreen() {
  const router = useRouter();
  const { isStaff } = useCart();
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(Date.now());

  // Atualiza "now" a cada minuto para refrescar "há X min" sem precisar re-fetch.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Sempre busca tudo do servidor — filtros/contagens são client-side.
  const fetchOrders = useCallback(
    async (isInitial = false) => {
      if (isInitial) setLoading(true);
      const response = await AdminOrdersService.list({
        status: "all",
        search: search.trim() || undefined,
        limit: 100,
      });
      if (response.success && response.data) {
        setOrders(response.data);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [search],
  );

  useFocusEffect(
    useCallback(() => {
      if (isStaff) fetchOrders(true);
    }, [isStaff, fetchOrders]),
  );

  useEffect(() => {
    if (!isStaff) return;
    const t = setTimeout(() => fetchOrders(true), 300);
    return () => clearTimeout(t);
  }, [search, isStaff, fetchOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders(false);
  };

  // ─── Counts & filtering ─────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = {
      new: 0,
      waiting_payment: 0,
      in_progress: 0,
      done: 0,
      cancelled: 0,
      alerts: 0,
      total: orders.length,
    };
    for (const o of orders) {
      if (o.status === "pending") c.new++;
      else if (o.status === "waiting_payment") c.waiting_payment++;
      else if (
        o.status === "confirmed" ||
        o.status === "preparing" ||
        o.status === "shipped" ||
        o.status === "in_delivery"
      )
        c.in_progress++;
      else if (o.status === "delivered" || o.status === "completed") c.done++;
      else if (o.status === "cancelled") c.cancelled++;
      if (o.shipping_last_error) c.alerts++;
    }
    return c;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const filter = FILTERS.find((f) => f.key === activeFilter)!;
    return orders.filter((o) => matchesFilter(o, filter));
  }, [orders, activeFilter]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (!isStaff) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FAF6F0" }} edges={["top"]}>
        <View className="flex-1 items-center justify-center px-8">
          <MaterialCommunityIcons name="shield-lock-outline" size={56} color="#D91A21" />
          <Text className="text-[18px] font-[800] text-text-primary mt-4 text-center">
            Acesso restrito
          </Text>
          <Text className="text-[13px] text-text-secondary mt-1 text-center">
            Esta área é exclusiva para a equipe da Hema Cereais.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const listHeader = (
    <>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 }}>
        <Text className="text-[25px] font-[800] text-text-primary" numberOfLines={1} adjustsFontSizeToFit>
          Gestão de Pedidos
        </Text>
        <Text className="text-[13px] text-text-secondary mt-1" numberOfLines={1} style={{ lineHeight: 18 }}>
          {orders.length} pedido{orders.length === 1 ? "" : "s"} no total
        </Text>
      </View>

      {/* Search */}
      <View className="px-5 mb-3">
        <View
          className="flex-row items-center bg-surface rounded-btn px-3"
          style={{
            borderWidth: 1,
            borderColor: "#EAE3D7",
            height: 42,
          }}
        >
          <Feather name="search" size={16} color="#8A8079" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por cliente ou nº do pedido"
            placeholderTextColor="#A6A6A6"
            style={{ flex: 1, marginLeft: 8, fontSize: 13, color: "#1A1613", minWidth: 0 }}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x" size={16} color="#8A8079" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: 52, flexGrow: 0 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 12,
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        {FILTERS.map((f) => {
          if (f.key === "alerts" && counts.alerts === 0) return null;
          const isActive = activeFilter === f.key;
          const count = getFilterCount(f.key, counts);
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              style={{
                paddingHorizontal: 14,
                height: 36,
                borderRadius: 999,
                borderWidth: 1,
                backgroundColor: isActive ? "#1A1613" : "#FFFFFF",
                borderColor: isActive ? "#1A1613" : "#EAE3D7",
                justifyContent: "center",
                alignItems: "center",
                flexShrink: 0,
              }}
              activeOpacity={0.75}
            >
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: "600",
                  color: isActive ? "#FFFFFF" : "#5C544C",
                  lineHeight: 16,
                }}
                numberOfLines={1}
              >
                {f.label} {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAF6F0" }} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF6F0" />

      {/* List */}
      {loading ? (
        <FlatList
          data={[1, 2, 3]}
          keyExtractor={(item) => `skeleton-${item}`}
          renderItem={({ item }) => (
            <View key={item} style={{ paddingHorizontal: 16 }}>
              <OrderCardSkeleton />
            </View>
          )}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          // 'now' force a re-render every minute para atualizar "há X min".
          extraData={now}
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 16 }}>
              <OrderCard
                order={item}
                onPress={() => router.push(`/admin/orders/${item.id}` as any)}
              />
            </View>
          )}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
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
              icon="clipboard-text-outline"
              title={activeFilter === "all" ? "Nenhum pedido" : "Nada por aqui"}
              subtitle={
                search
                  ? "Tente outro termo de busca."
                  : activeFilter === "new"
                    ? "Nenhum pedido novo aguardando."
                    : activeFilter === "waiting_payment"
                      ? "Nenhum pedido aguardando pagamento."
                      : activeFilter === "alerts"
                        ? "Nenhum alerta no momento."
                        : "Nenhum pedido neste filtro."
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
