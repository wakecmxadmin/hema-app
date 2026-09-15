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
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";

import { OrdersService } from "@/services/orders";
import { Toast } from "@/util/toast";
import { optimizedImage } from "@/util/image-url";
import { useCart } from "@/context/CartContext";

function ItemThumbnail({ uri }: { uri?: string | null }) {
  if (uri) {
    return (
      <Image
        source={{ uri: optimizedImage(uri, { width: 128, resize: "cover" }) ?? undefined }}
        style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: "#F5EFE4" }}
        contentFit="cover"
        transition={150}
        cachePolicy="disk"
        recyclingKey={uri}
      />
    );
  }
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 10,
        backgroundColor: "#F5EFE4",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <MaterialCommunityIcons name="package-variant" size={26} color="#C2B79E" />
    </View>
  );
}

export default function OrderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refreshCart } = useCart();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [proceedingToPayment, setProceedingToPayment] = useState(false);

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

  const handleReorder = async () => {
    setReordering(true);
    const response = await OrdersService.reorder(id);
    setReordering(false);

    if (!response.success && !response.data) {
      Toast.show({
        type: "error",
        text1: "Não foi possível repetir o pedido",
        text2: response.message,
      });
      return;
    }

    // Cart cresceu: sincroniza o badge / contexto.
    await refreshCart();

    const skipped = response.data?.skipped ?? [];
    const addedCount = response.data?.added_count ?? 0;

    if (addedCount === 0) {
      Alert.alert(
        "Nenhum item disponível",
        "Os produtos desse pedido não estão disponíveis no momento.",
      );
      return;
    }

    if (skipped.length === 0) {
      Alert.alert(
        "Itens adicionados!",
        `${addedCount} ${addedCount === 1 ? "item foi adicionado" : "itens foram adicionados"} ao carrinho.`,
        [
          { text: "Continuar", style: "cancel" },
          {
            text: "Ver carrinho",
            onPress: () => router.push("/(tabs)/cart" as any),
          },
        ],
      );
    } else {
      const list = skipped
        .slice(0, 5)
        .map((s) => `• ${s.product_name}`)
        .join("\n");
      const extra =
        skipped.length > 5 ? `\n+ ${skipped.length - 5} outros` : "";

      Alert.alert(
        `${addedCount} ${addedCount === 1 ? "item adicionado" : "itens adicionados"}`,
        `Alguns produtos não estão disponíveis e foram pulados:\n\n${list}${extra}`,
        [
          { text: "Continuar", style: "cancel" },
          {
            text: "Ver carrinho",
            onPress: () => router.push("/(tabs)/cart" as any),
          },
        ],
      );
    }
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

  const handleProceedToPayment = async () => {
    setProceedingToPayment(true);
    const response = await OrdersService.proceedToPayment(id);
    setProceedingToPayment(false);

    if (!response.success || !response.data) {
      Toast.show({
        type: "error",
        text1: "Erro ao gerar pagamento",
        text2: response.message,
      });
      return;
    }

    if (response.data.init_point) {
      await WebBrowser.openBrowserAsync(response.data.init_point);
      fetchOrderDetails(false);
    } else {
      // Dinheiro — já foi confirmado pelo backend.
      Toast.show({
        type: "success",
        text1: "Pedido confirmado",
        text2: "Pague na entrega.",
      });
      fetchOrderDetails(false);
    }
  };

  const formatPrice = (price: number) => {
    return Number(price).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "awaiting_store_confirmation":
        return {
          label: "Aguardando confirmação da loja",
          color: "#D91A21",
          bg: "#FEF2F2",
        };
      case "awaiting_customer_payment":
        return {
          label: "Aguardando seu pagamento",
          color: "#F59E0B",
          bg: "#FFFBEB",
        };
      case "pending":
        return { label: "Pendente", color: "#F59E0B", bg: "#FFFBEB" };
      case "waiting_payment":
        return {
          label: "Aguardando pagamento",
          color: "#F59E0B",
          bg: "#FFFBEB",
        };
      case "confirmed":
        return { label: "Confirmado", color: "#3B82F6", bg: "#EFF6FF" };
      case "preparing":
        return { label: "Preparando", color: "#F59E0B", bg: "#FFFBEB" };
      case "awaiting_dispatch":
        return {
          label: "Aguard. saída p/ entrega",
          color: "#8B5CF6",
          bg: "#F5F3FF",
        };
      case "shipped":
      case "in_delivery":
        return { label: "Em rota", color: "#3B82F6", bg: "#EFF6FF" };
      case "delivered":
        return { label: "Entregue", color: "#10B981", bg: "#ECFDF5" };
      case "completed":
        return { label: "Finalizado", color: "#10B981", bg: "#ECFDF5" };
      case "cancelled":
        return { label: "Cancelado", color: "#D91A21", bg: "#FEF2F2" };
      default:
        return { label: status, color: "#666666", bg: "#F5F5F5" };
    }
  };

  if (loading || !order) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FAF6F0", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#D91A21" />
      </View>
    );
  }

  const badge = getStatusBadge(order.status);
  const isPickup = !order.addresses;
  const isAwaitingStoreConfirmation =
    order.status === "awaiting_store_confirmation";
  const isAwaitingPayment = order.status === "awaiting_customer_payment";
  const isCancelled = order.status === "cancelled";
  const isCash = order.payment_method === "cash";
  const wasEdited = !!order.was_edited;
  const canCancel =
    order.status === "pending" ||
    order.status === "awaiting_store_confirmation" ||
    order.status === "awaiting_customer_payment";

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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAF6F0" }} edges={["top", "bottom"]}>
      {/* HEADER */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 15, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#EAE3D7" }}>
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

        {/* BANNER: Aguardando loja confirmar */}
        {isAwaitingStoreConfirmation && (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            style={[sectionShadow, { borderLeftWidth: 4, borderLeftColor: "#D91A21" }]}
          >
            <View className="flex-row items-center mb-2">
              <MaterialCommunityIcons name="store-clock-outline" size={22} color="#D91A21" />
              <Text className="text-[16px] font-bold text-text-primary ml-2">
                Aguardando a loja confirmar
              </Text>
            </View>
            <Text className="text-[13px] text-text-secondary" style={{ lineHeight: 18 }}>
              A loja vai conferir o estoque físico e te avisar em instantes. Você
              receberá uma notificação quando estiver pronto pra pagar.
            </Text>
          </View>
        )}

        {/* BANNER: Aguardando pagamento (cliente) */}
        {isAwaitingPayment && (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            style={[sectionShadow, { borderLeftWidth: 4, borderLeftColor: "#F59E0B" }]}
          >
            <View className="flex-row items-center mb-2">
              <MaterialCommunityIcons name="cash-clock" size={22} color="#F59E0B" />
              <Text className="text-[16px] font-bold text-text-primary ml-2">
                {wasEdited ? "Loja editou seu pedido" : "Loja confirmou seu pedido"}
              </Text>
            </View>
            {wasEdited && order.original_total_price && (
              <View
                style={{
                  backgroundColor: "#FFFBEB",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 10,
                }}
              >
                <Text className="text-[12.5px] text-text-secondary" style={{ lineHeight: 17 }}>
                  Faltou algum item. Total original era{" "}
                  <Text className="font-bold">
                    {formatPrice(Number(order.original_total_price))}
                  </Text>
                  , novo total é{" "}
                  <Text className="font-bold">
                    {formatPrice(Number(order.total_price))}
                  </Text>
                  . Revise os itens abaixo antes de pagar.
                </Text>
              </View>
            )}
            <Text className="text-[13px] text-text-secondary mb-3" style={{ lineHeight: 18 }}>
              {isCash
                ? "Toque para confirmar — você paga na entrega."
                : `Pague em até 1h pra garantir seu pedido${
                    order.payment_window_expires_at
                      ? ` (expira ${new Date(
                          order.payment_window_expires_at,
                        ).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })})`
                      : ""
                  }.`}
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={proceedingToPayment}
              onPress={handleProceedToPayment}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: "#10B981",
                opacity: proceedingToPayment ? 0.6 : 1,
              }}
            >
              {proceedingToPayment ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name={isCash ? "check-bold" : "cash-multiple"}
                    size={18}
                    color="#FFFFFF"
                  />
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>
                    {isCash ? "Confirmar pedido" : "Pagar agora"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* BANNER: Rejeitado pela loja */}
        {isCancelled && order.rejection_reason && (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            style={[sectionShadow, { borderLeftWidth: 4, borderLeftColor: "#D91A21" }]}
          >
            <View className="flex-row items-center mb-2">
              <MaterialCommunityIcons name="close-circle-outline" size={22} color="#D91A21" />
              <Text className="text-[16px] font-bold text-text-primary ml-2">
                Pedido cancelado
              </Text>
            </View>
            <Text className="text-[13px] text-text-secondary" style={{ lineHeight: 18 }}>
              Motivo: {order.rejection_reason}
            </Text>
          </View>
        )}

        {/* LISTA DE ITENS */}
        <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-text-primary mb-4">
            Itens
          </Text>
          {order.order_items?.map((item: any) => (
            <View
              key={item.id}
              className="flex-row items-center border-b border-neutral-200 pb-3 mb-3"
            >
              <ItemThumbnail uri={item.products?.image_url} />
              <View className="flex-1 px-3">
                <Text className="text-[14px] text-text-primary font-medium mb-1" numberOfLines={2}>
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
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FAF6F0", padding: 12, borderRadius: 12 }}>
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
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FAF6F0", padding: 12, borderRadius: 12 }}>
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
                order.subtotal != null
                  ? Number(order.subtotal)
                  : Number(order.total_price) - Number(order.delivery_fee),
              )}
            </Text>
          </View>
          {Number(order.discount_amount) > 0 && (
            <View className="flex-row justify-between mb-2">
              <Text className="text-[14px] text-text-secondary">
                Desconto{order.coupon_code ? ` (${order.coupon_code})` : ""}
              </Text>
              <Text className="text-[14px] text-brand">
                -{formatPrice(Number(order.discount_amount))}
              </Text>
            </View>
          )}
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
              {order.payment_status === "paid" ? "Total Pago" : "Total"}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#1A1613" }}>
              {formatPrice(order.total_price)}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View
        className="bg-surface border-t border-neutral-200"
        style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, flexDirection: "row", gap: 10 }}
      >
        {canCancel && (
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#D91A21",
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={handleCancelOrder}
            disabled={canceling || reordering}
          >
            {canceling ? (
              <ActivityIndicator color="#D91A21" />
            ) : (
              <Text className="text-brand text-[15px] font-bold">Cancelar</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: "#1A1613",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 6,
          }}
          onPress={handleReorder}
          disabled={canceling || reordering}
        >
          {reordering ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="cart-plus" size={18} color="#FFFFFF" />
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>
                Repetir pedido
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
