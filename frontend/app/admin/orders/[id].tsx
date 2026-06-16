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
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";

import {
  AdminOrdersService,
  AdminOrderStatus,
  OrderItemEdit,
} from "@/services/admin-orders";
import { Toast } from "@/util/toast";
import { optimizedImage } from "@/util/image-url";
import { EditItemsModal } from "@/components/admin/EditItemsModal";

function ItemThumbnail({ uri }: { uri?: string | null }) {
  if (uri) {
    return (
      <Image
        source={{ uri: optimizedImage(uri, { width: 128, resize: "cover" }) }}
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

const STATUS_FLOW: { key: AdminOrderStatus; label: string; icon: any; color: string }[] = [
  { key: "pending", label: "Pendente", icon: "clock-outline", color: "#F59E0B" },
  { key: "waiting_payment", label: "Aguard. pgto", icon: "cash-clock", color: "#F59E0B" },
  { key: "confirmed", label: "Confirmado", icon: "check-outline", color: "#3B82F6" },
  { key: "preparing", label: "Preparando", icon: "food-outline", color: "#F59E0B" },
  { key: "shipped", label: "Em rota", icon: "truck-delivery-outline", color: "#3B82F6" },
  { key: "delivered", label: "Entregue", icon: "check-circle-outline", color: "#10B981" },
  { key: "completed", label: "Finalizado", icon: "flag-checkered", color: "#10B981" },
];

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de crédito",
  cash: "Dinheiro",
};

function formatPrice(price: number) {
  return Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStatusBadge(status: string) {
  switch (status) {
    case "awaiting_store_confirmation":
      return {
        label: "Aguardando sua confirmação",
        color: "#D91A21",
        bg: "#FEF2F2",
      };
    case "awaiting_customer_payment":
      return {
        label: "Aguardando pagamento do cliente",
        color: "#F59E0B",
        bg: "#FFFBEB",
      };
    case "pending":
      return { label: "Pendente", color: "#F59E0B", bg: "#FFFBEB" };
    case "waiting_payment":
      return { label: "Aguardando pagamento", color: "#F59E0B", bg: "#FFFBEB" };
    case "confirmed":
      return { label: "Confirmado", color: "#3B82F6", bg: "#EFF6FF" };
    case "preparing":
      return { label: "Preparando", color: "#F59E0B", bg: "#FFFBEB" };
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
}

export default function AdminOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const fetchDetails = async (isInitial = true) => {
    if (isInitial) setLoading(true);
    const response = await AdminOrdersService.detail(id);

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
    fetchDetails(true);
  }, [id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDetails(false);
  };

  const handleChangeStatus = async (next: AdminOrderStatus) => {
    if (!order || order.status === next) return;
    setUpdating(next);
    const response = await AdminOrdersService.updateStatus(id, next);
    setUpdating(null);

    if (response.success) {
      Toast.show({ type: "success", text1: "Status atualizado!" });
      fetchDetails(false);
    } else {
      Toast.show({
        type: "error",
        text1: "Erro ao atualizar",
        text2: response.message,
      });
    }
  };

  const handleCancel = () => {
    Alert.alert(
      "Cancelar pedido",
      "Tem certeza que deseja cancelar este pedido? O estoque dos itens será devolvido.",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim, cancelar",
          style: "destructive",
          onPress: async () => {
            setCanceling(true);
            const response = await AdminOrdersService.cancel(id);
            setCanceling(false);

            if (response.success) {
              Toast.show({ type: "success", text1: "Pedido cancelado." });
              fetchDetails(false);
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

  const handleConfirmAsIs = () => {
    Alert.alert(
      "Confirmar pedido",
      order?.payment_method === "cash"
        ? "Pedido em dinheiro: será confirmado e enviado pra preparação. Cliente paga na entrega."
        : "Cliente receberá notificação para pagar em até 1h.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          onPress: async () => {
            setConfirming(true);
            const response = await AdminOrdersService.confirm(id);
            setConfirming(false);
            if (response.success) {
              Toast.show({ type: "success", text1: "Pedido confirmado." });
              fetchDetails(false);
            } else {
              Toast.show({
                type: "error",
                text1: "Erro ao confirmar",
                text2: response.message,
              });
            }
          },
        },
      ],
    );
  };

  const handleApplyEdits = async (edits: OrderItemEdit[]) => {
    setConfirming(true);
    const response = await AdminOrdersService.confirm(id, edits);
    setConfirming(false);
    if (response.success) {
      Toast.show({ type: "success", text1: "Pedido confirmado com edições." });
      setEditOpen(false);
      fetchDetails(false);
    } else {
      Toast.show({
        type: "error",
        text1: "Erro ao confirmar",
        text2: response.message,
      });
    }
  };

  const handleReject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      Toast.show({
        type: "error",
        text1: "Informe o motivo",
        text2: "O cliente receberá esse motivo.",
      });
      return;
    }
    setRejecting(true);
    const response = await AdminOrdersService.reject(id, reason);
    setRejecting(false);
    if (response.success) {
      Toast.show({ type: "success", text1: "Pedido rejeitado." });
      setRejectOpen(false);
      setRejectReason("");
      fetchDetails(false);
    } else {
      Toast.show({
        type: "error",
        text1: "Erro ao rejeitar",
        text2: response.message,
      });
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
  const customer = order.customer ?? {};
  const isCancelled = order.status === "cancelled";
  const needsStoreConfirmation = order.status === "awaiting_store_confirmation";
  const awaitingCustomerPayment = order.status === "awaiting_customer_payment";

  const sectionShadow = Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
    },
    android: { elevation: 2 },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAF6F0" }} edges={["top", "bottom"]}>
      {/* HEADER */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 15, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#EAE3D7" }}>
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 justify-center">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#121212" />
        </TouchableOpacity>
        <Text className="text-[18px] font-bold text-text-primary">Pedido (Admin)</Text>
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
        {/* RESUMO */}
        <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
          <Text className="text-[18px] font-bold text-text-primary">
            Pedido #{order.id.substring(0, 8).toUpperCase()}
          </Text>
          <View
            className="flex-row items-center px-3 py-1 rounded-full gap-1 self-start mt-2"
            style={{ backgroundColor: badge.bg }}
          >
            <Text className="text-[13px] font-bold" style={{ color: badge.color }}>
              {badge.label}
            </Text>
          </View>
          <Text className="text-[12px] text-text-secondary mt-2">
            Criado em {new Date(order.created_at).toLocaleString("pt-BR")}
          </Text>
          <Text className="text-[12px] text-text-secondary mt-0.5">
            Pagamento: {PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method}
            {" • "}
            {order.payment_status === "paid" ? "Pago" : order.payment_status === "pending" ? "Pendente" : order.payment_status}
          </Text>
          {order.was_edited && (
            <Text className="text-[12px] text-text-secondary mt-0.5">
              Pedido editado • original: {formatPrice(Number(order.original_total_price))}
            </Text>
          )}
        </View>

        {/* CONFIRMAÇÃO DA LOJA */}
        {needsStoreConfirmation && (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            style={[sectionShadow, { borderLeftWidth: 4, borderLeftColor: "#D91A21" }]}
          >
            <View className="flex-row items-center mb-2">
              <MaterialCommunityIcons name="store-clock-outline" size={20} color="#D91A21" />
              <Text className="text-[16px] font-bold text-text-primary ml-2">
                Confirmar com o estoque físico
              </Text>
            </View>
            <Text className="text-[12.5px] text-text-secondary mb-4" style={{ lineHeight: 17 }}>
              Cheque se todos os itens estão disponíveis antes de o cliente pagar.
              Você pode reduzir/remover itens em falta ao confirmar.
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={confirming}
              onPress={handleConfirmAsIs}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: "#10B981",
                marginBottom: 8,
                opacity: confirming ? 0.6 : 1,
              }}
            >
              {confirming ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="check-bold" size={18} color="#FFFFFF" />
                  <Text className="text-[15px] font-bold text-white">Confirmar tudo</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={confirming}
              onPress={() => setEditOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 14,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: "#3B82F6",
                backgroundColor: "#EFF6FF",
                marginBottom: 8,
              }}
            >
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#3B82F6" />
              <Text className="text-[15px] font-bold" style={{ color: "#3B82F6" }}>
                Editar itens (faltou algum)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={confirming}
              onPress={() => setRejectOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 14,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: "#D91A21",
                backgroundColor: "#FEF2F2",
              }}
            >
              <MaterialCommunityIcons name="close-thick" size={18} color="#D91A21" />
              <Text className="text-[15px] font-bold" style={{ color: "#D91A21" }}>
                Rejeitar pedido
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {awaitingCustomerPayment && (
          <View
            className="bg-surface rounded-card p-4 mb-4"
            style={[sectionShadow, { borderLeftWidth: 4, borderLeftColor: "#F59E0B" }]}
          >
            <View className="flex-row items-center mb-2">
              <MaterialCommunityIcons name="cash-clock" size={20} color="#F59E0B" />
              <Text className="text-[16px] font-bold text-text-primary ml-2">
                Aguardando pagamento
              </Text>
            </View>
            <Text className="text-[12.5px] text-text-secondary" style={{ lineHeight: 17 }}>
              Você confirmou. O cliente foi notificado e tem 1h pra pagar.
              {order.payment_window_expires_at
                ? ` Expira em ${new Date(order.payment_window_expires_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
                : ""}
            </Text>
          </View>
        )}

        {/* CLIENTE */}
        <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-text-primary mb-3">Cliente</Text>
          <View className="flex-row items-center mb-2">
            <MaterialCommunityIcons name="account-outline" size={18} color="#8A8079" />
            <Text className="text-[14px] text-text-primary ml-2">
              {customer.name || "Sem nome cadastrado"}
            </Text>
          </View>
          {customer.email && (
            <View className="flex-row items-center mb-2">
              <MaterialCommunityIcons name="email-outline" size={18} color="#8A8079" />
              <Text className="text-[14px] text-text-secondary ml-2">{customer.email}</Text>
            </View>
          )}
          {customer.phone && (
            <View className="flex-row items-center mb-2">
              <MaterialCommunityIcons name="phone-outline" size={18} color="#8A8079" />
              <Text className="text-[14px] text-text-secondary ml-2">{customer.phone}</Text>
            </View>
          )}
          {customer.cpf && (
            <View className="flex-row items-center">
              <MaterialCommunityIcons name="card-account-details-outline" size={18} color="#8A8079" />
              <Text className="text-[14px] text-text-secondary ml-2">CPF: {customer.cpf}</Text>
            </View>
          )}
        </View>

        {/* ITENS */}
        <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-text-primary mb-4">Itens</Text>
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
                  {item.quantity ? `${item.quantity}x unitário` : `${item.weight}g`}
                  {" • "}
                  {formatPrice(item.product_price)}
                </Text>
              </View>
              <Text className="text-[14px] font-bold text-text-primary">
                {formatPrice(item.subtotal)}
              </Text>
            </View>
          ))}
        </View>

        {/* ENTREGA */}
        <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-text-primary mb-4">Entrega</Text>
          {isPickup ? (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FAF6F0", padding: 12, borderRadius: 12 }}>
              <MaterialCommunityIcons name="storefront" size={24} color="#D91A21" />
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
              <MaterialCommunityIcons name="map-marker-outline" size={24} color="#D91A21" />
              <View className="ml-3 flex-1">
                <Text className="text-[14px] font-bold text-text-primary mb-0.5">
                  {order.addresses.street}, {order.addresses.number}
                  {order.addresses.complement ? ` — ${order.addresses.complement}` : ""}
                </Text>
                <Text className="text-[12px] text-text-secondary">
                  {order.addresses.neighborhood} • {order.addresses.city}/{order.addresses.state}
                </Text>
                {order.addresses.zip_code && (
                  <Text className="text-[11px] text-neutral-300 mt-0.5">
                    CEP {order.addresses.zip_code}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* TOTAIS */}
        <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
          <Text className="text-[16px] font-bold text-text-primary mb-4">Resumo</Text>
          <View className="flex-row justify-between mb-2">
            <Text className="text-[14px] text-text-secondary">Subtotal</Text>
            <Text className="text-[14px] text-text-primary">
              {formatPrice(Number(order.total_price) - Number(order.delivery_fee))}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-[14px] text-text-secondary">Taxa de Entrega</Text>
            <Text className="text-[14px] text-text-primary">
              {order.delivery_fee > 0 ? formatPrice(order.delivery_fee) : "Grátis"}
            </Text>
          </View>
          <View className="flex-row justify-between border-t border-neutral-200 pt-3 mt-1">
            <Text className="text-[16px] font-bold text-text-primary">Total</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#1A1613" }}>
              {formatPrice(order.total_price)}
            </Text>
          </View>
        </View>

        {/* ENVIO LOGMANAGER */}
        {(order.logmanager_envio_id || order.shipping_status || order.shipping_last_error) && (
          <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
            <View className="flex-row items-center mb-3">
              <MaterialCommunityIcons name="truck-fast-outline" size={18} color="#1A1613" />
              <Text className="text-[16px] font-bold text-text-primary ml-2">Envio</Text>
            </View>

            {order.logmanager_envio_id && (
              <View className="flex-row items-center mb-2">
                <Text className="text-[12px] text-text-secondary">ID do envio:</Text>
                <Text className="text-[13px] font-bold text-text-primary ml-2">
                  {order.logmanager_envio_id}
                </Text>
              </View>
            )}

            {order.shipping_status && (
              <View className="flex-row items-center mb-2">
                <Text className="text-[12px] text-text-secondary">Status transportadora:</Text>
                <Text className="text-[13px] font-bold text-text-primary ml-2">
                  {order.shipping_status}
                </Text>
              </View>
            )}

            {order.shipping_dispatched_at && (
              <View className="flex-row items-center mb-2">
                <Text className="text-[12px] text-text-secondary">Despachado em:</Text>
                <Text className="text-[13px] text-text-primary ml-2">
                  {new Date(order.shipping_dispatched_at).toLocaleString("pt-BR")}
                </Text>
              </View>
            )}

            {order.shipping_last_error && (
              <View
                style={{
                  backgroundColor: "#FEF2F2",
                  padding: 8,
                  borderRadius: 8,
                  marginTop: 4,
                }}
              >
                <Text className="text-[11px] font-bold" style={{ color: "#D91A21" }}>
                  Falha no último envio
                </Text>
                <Text className="text-[11px]" style={{ color: "#7F1D1D" }} numberOfLines={3}>
                  {order.shipping_last_error}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* STATUS */}
        {!isCancelled && !needsStoreConfirmation && !awaitingCustomerPayment && (
          <View className="bg-surface rounded-card p-4 mb-4" style={sectionShadow}>
            <Text className="text-[16px] font-bold text-text-primary mb-1">
              Atualizar status
            </Text>
            <Text className="text-[12px] text-text-secondary mb-4">
              Toque para alterar para o status desejado.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {STATUS_FLOW.map((s) => {
                const isCurrent = order.status === s.key;
                const isUpdating = updating === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    disabled={isCurrent || !!updating}
                    onPress={() => handleChangeStatus(s.key)}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      backgroundColor: isCurrent ? s.color : "#FFFFFF",
                      borderColor: isCurrent ? s.color : "#EAE3D7",
                      opacity: !isCurrent && updating ? 0.5 : 1,
                    }}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <MaterialCommunityIcons
                        name={s.icon}
                        size={14}
                        color={isCurrent ? "#FFFFFF" : s.color}
                      />
                    )}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: isCurrent ? "#FFFFFF" : "#1A1613",
                      }}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {!isCancelled && !needsStoreConfirmation && (
        <View className="p-4 bg-surface border-t border-neutral-200">
          <TouchableOpacity
            className="py-4 rounded-btn border border-brand items-center"
            onPress={handleCancel}
            disabled={canceling}
          >
            {canceling ? (
              <ActivityIndicator color="#D91A21" />
            ) : (
              <Text className="text-brand text-[16px] font-bold">Cancelar Pedido</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Modal de rejeição */}
      <Modal
        visible={rejectOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <View className="bg-surface rounded-card p-5">
              <Text className="text-[18px] font-bold text-text-primary mb-2">
                Rejeitar pedido
              </Text>
              <Text className="text-[12.5px] text-text-secondary mb-3">
                Esse motivo será enviado ao cliente. Ex: "Faltou o item X no estoque".
              </Text>
              <TextInput
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Motivo da rejeição"
                placeholderTextColor="#A6A6A6"
                multiline
                numberOfLines={3}
                style={{
                  borderWidth: 1,
                  borderColor: "#EAE3D7",
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 14,
                  color: "#1A1613",
                  minHeight: 80,
                  textAlignVertical: "top",
                  marginBottom: 16,
                }}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    setRejectOpen(false);
                    setRejectReason("");
                  }}
                  disabled={rejecting}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "#EAE3D7",
                    alignItems: "center",
                  }}
                >
                  <Text className="text-text-primary text-[14px] font-bold">Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleReject}
                  disabled={rejecting || !rejectReason.trim()}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: "#D91A21",
                    alignItems: "center",
                    opacity: rejecting || !rejectReason.trim() ? 0.6 : 1,
                  }}
                >
                  {rejecting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-white text-[14px] font-bold">Rejeitar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal de edição de itens */}
      <EditItemsModal
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        items={order.order_items ?? []}
        deliveryFee={Number(order.delivery_fee ?? 0)}
        loading={confirming}
        onConfirm={handleApplyEdits}
      />
    </SafeAreaView>
  );
}
