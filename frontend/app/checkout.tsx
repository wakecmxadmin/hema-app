import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "@/context/CartContext";
import { getAddresses, Address } from "@/services/addresses";
import { OrdersService } from "@/services/orders";
import { validateCartStockService } from "@/services/cart";
import { Toast } from "@/util/toast";

type DeliveryMethod = "pickup" | "delivery";
type PaymentMethod = "pix" | "credit_card" | "cash";

function calculateDeliveryFee(city?: string): number {
  if (!city) return 0;

  const normalizedCity = city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const tier10 = [
    "curitiba",
    "araucaria",
    "balsa nova",
    "pinhais",
    "sao jose dos pinhais",
  ];
  const tier15 = ["colombo", "almirante tamandare", "piraquara"];

  if (tier10.includes(normalizedCity)) return 10.0;
  if (tier15.includes(normalizedCity)) return 15.0;

  return -1;
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { items, loading, cart, refreshCart } = useCart();
  const insets = useSafeAreaInsets();

  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>("delivery");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );

  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    await refreshCart();

    // Validar estoque ao abrir o checkout
    const stockValidation = await validateCartStockService();
    if (stockValidation.success && stockValidation.data) {
      if (!stockValidation.data.valid) {
        await refreshCart();
        const adjustments = stockValidation.data.adjustments;
        const names = adjustments.map((a) => a.product_name).join(", ");
        Toast.show({
          type: "error",
          text1: "Carrinho ajustado",
          text2: `Estoque insuficiente para: ${names}`,
        });
      }
    }

    const response = await getAddresses();

    if (response.success && response.data) {
      const data = response.data;
      setAddresses(data);

      setSelectedAddressId((currentSelectedId) => {
        if (currentSelectedId) return currentSelectedId;
        if (data.length > 0) {
          const defaultAddr = data.find((a) => a.is_default);
          return defaultAddr ? defaultAddr.id : data[0].id;
        }
        return null;
      });
    } else {
      console.log("Falha ao carregar endereços no checkout:", response.message);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoadingAddresses(addresses.length === 0);
      loadData().finally(() => setLoadingAddresses(false));
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const subtotal = cart?.total_price ? Number(cart.total_price) : 0;
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  const currentDeliveryFee = useMemo(() => {
    if (deliveryMethod === "pickup") return 0;
    return calculateDeliveryFee(selectedAddress?.city);
  }, [deliveryMethod, selectedAddress]);

  const displayDeliveryFee = currentDeliveryFee === -1 ? 0 : currentDeliveryFee;
  const total = subtotal + displayDeliveryFee;

  const formatPrice = (price: number) => {
    return price.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  // Dinheiro só é aceito na retirada. Se cliente tinha selecionado cash e
  // troca pra entrega, força reset pra PIX.
  useEffect(() => {
    if (deliveryMethod === "delivery" && paymentMethod === "cash") {
      setPaymentMethod("pix");
    }
  }, [deliveryMethod, paymentMethod]);

  useEffect(() => {
    if (
      deliveryMethod === "delivery" &&
      currentDeliveryFee === -1 &&
      selectedAddressId
    ) {
      const timer = setTimeout(() => {
        Alert.alert(
          "Região não atendida 🛵",
          "Infelizmente ainda não realizamos entregas flex para esta cidade.\n\nPor favor, selecione outro endereço ou mude para a opção 'Retirar na Loja'.",
          [{ text: "Entendi", style: "default" }],
        );
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [currentDeliveryFee, deliveryMethod, selectedAddressId]);

  const handleConfirmOrder = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (items.length === 0) {
      return Toast.show({ type: "error", text1: "Seu carrinho está vazio." });
    }

    if (deliveryMethod === "delivery") {
      if (!selectedAddressId) {
        return Toast.show({
          type: "error",
          text1: "Atenção",
          text2: "Por favor, selecione um endereço para a entrega.",
        });
      }

      if (currentDeliveryFee === -1) {
        return Toast.show({
          type: "error",
          text1: "Região não atendida",
          text2: "Selecione a opção Retirada na Loja.",
        });
      }
    }

    setIsCreatingOrder(true);

    // Re-validar estoque antes de confirmar
    const stockCheck = await validateCartStockService();
    if (stockCheck.success && stockCheck.data && !stockCheck.data.valid) {
      setIsCreatingOrder(false);
      await refreshCart();
      const names = stockCheck.data.adjustments.map((a) => a.product_name).join(", ");
      Toast.show({
        type: "error",
        text1: "Estoque indisponível",
        text2: `Itens ajustados: ${names}. Revise o carrinho.`,
      });
      return;
    }

    const addressToLog =
      deliveryMethod === "delivery" ? selectedAddressId : null;

    const response = await OrdersService.createOrder({
      address_id: addressToLog,
      payment_method: paymentMethod,
    });

    setIsCreatingOrder(false);

    if (response.success && response.data) {
      // Novo fluxo: pedido nasce em awaiting_store_confirmation. A loja
      // confirma e só então o cliente paga. Aqui só navegamos para o detalhe;
      // o pagamento é disparado de lá quando a loja confirmar.
      await refreshCart();
      const orderId = response.data.order_id;
      router.replace(`/orders/${orderId}` as any);
      Toast.show({
        type: "success",
        text1: "Pedido enviado!",
        text2: "Aguarde a loja confirmar o estoque.",
      });
    } else {
      if (response.error === "INSUFFICIENT_STOCK") {
        await refreshCart();
        Toast.show({
          type: "error",
          text1: "Produto ficou indisponível",
          text2: response.message || "Revise seu carrinho e tente novamente.",
        });
      } else {
        Toast.show({
          type: "error",
          text1: "Erro ao finalizar pedido",
          text2: response.message,
        });
      }
    }
  };

  if (loading && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FAF6F0", paddingTop: 40, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#D91A21" />
        <Text className="mt-3 text-text-secondary">
          Carregando dados do pedido...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#FAF6F0", paddingTop: 40 }}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        className="flex-1 p-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom > 0 ? insets.bottom + 180 : 160,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#D91A21"]}
            tintColor="#D91A21"
          />
        }
      >
        {/* 1. MÉTODO DE ENTREGA */}
        <View style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: "#1A1613", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
          <Text className="text-base font-bold text-text-primary mb-3">
            Como deseja receber?
          </Text>
          <View className="flex-row justify-between gap-3">
            <TouchableOpacity
              className={`flex-1 border-[1.5px] rounded-btn py-3 px-2 items-center ${
                deliveryMethod === "delivery"
                  ? "border-brand bg-brand/5"
                  : "border-neutral-200 bg-neutral-100"
              }`}
              onPress={() => setDeliveryMethod("delivery")}
            >
              <MaterialCommunityIcons
                name="bike"
                size={28}
                color={deliveryMethod === "delivery" ? "#D91A21" : "#C2C2C2"}
              />
              <Text
                className={`text-[13px] font-semibold mt-2 ${
                  deliveryMethod === "delivery"
                    ? "text-brand"
                    : "text-text-secondary"
                }`}
              >
                Entrega
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className={`flex-1 border-[1.5px] rounded-btn py-3 px-2 items-center ${
                deliveryMethod === "pickup"
                  ? "border-brand bg-brand/5"
                  : "border-neutral-200 bg-neutral-100"
              }`}
              onPress={() => setDeliveryMethod("pickup")}
            >
              <MaterialCommunityIcons
                name="storefront-outline"
                size={28}
                color={deliveryMethod === "pickup" ? "#D91A21" : "#C2C2C2"}
              />
              <Text
                className={`text-[13px] font-semibold mt-2 ${
                  deliveryMethod === "pickup" ? "text-brand" : "text-text-secondary"
                }`}
              >
                Retirar na Loja
              </Text>
            </TouchableOpacity>
          </View>

          {/* DADOS DE ENTREGA / RETIRADA */}
          <View className="mt-4 border-t border-neutral-200 pt-4">
            {deliveryMethod === "pickup" ? (
              <View className="flex-row bg-neutral-100 p-3 rounded-btn items-start">
                <MaterialCommunityIcons
                  name="map-marker-radius"
                  size={24}
                  color="#D91A21"
                />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-text-primary mb-1">
                    Endereço de Retirada
                  </Text>
                  <Text className="text-[13px] text-text-secondary mb-0.5">
                    R. São José dos Pinhais, 187 - Sítio Cercado
                  </Text>
                  <Text className="text-[13px] text-text-secondary mb-0.5">
                    Curitiba - PR, 81910-010
                  </Text>
                  <Text className="text-xs text-text-secondary mt-1 font-medium">
                    <MaterialCommunityIcons
                      name="clock-outline"
                      size={14}
                      color="#666666"
                    />{" "}
                    09hAM às 18h30PM (Fechado aos domingos)
                  </Text>
                </View>
              </View>
            ) : (
              <View>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-sm font-semibold text-text-primary">
                    Selecione o Endereço
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/addresses/new" as any)}
                  >
                    <MaterialCommunityIcons
                      name="plus-circle"
                      size={24}
                      color="#D91A21"
                    />
                  </TouchableOpacity>
                </View>

                {loadingAddresses ? (
                  <ActivityIndicator
                    size="small"
                    color="#D91A21"
                    style={{ marginVertical: 20 }}
                  />
                ) : addresses.length === 0 ? (
                  <Text className="text-sm text-neutral-300 italic text-center mt-3">
                    Nenhum endereço cadastrado.
                  </Text>
                ) : (
                  addresses.map((address) => (
                    <TouchableOpacity
                      key={address.id}
                      className={`flex-row items-center py-3 px-3 border rounded-btn mb-2 ${
                        selectedAddressId === address.id
                          ? "border-brand bg-brand/5"
                          : "border-neutral-200"
                      }`}
                      onPress={() => setSelectedAddressId(address.id)}
                    >
                      <MaterialCommunityIcons
                        name={
                          selectedAddressId === address.id
                            ? "radiobox-marked"
                            : "radiobox-blank"
                        }
                        size={20}
                        color={
                          selectedAddressId === address.id ? "#D91A21" : "#C2C2C2"
                        }
                      />
                      <View className="ml-3 flex-1">
                        {address.label && (
                          <Text className="text-sm font-bold text-text-primary mb-0.5">
                            {address.label}
                          </Text>
                        )}

                        <View className="flex-row items-center">
                          <Text
                            className="text-sm font-semibold text-text-primary flex-shrink"
                            numberOfLines={1}
                          >
                            {address.street}, {address.number}
                          </Text>
                          {address.is_default && (
                            <View className="flex-row items-center bg-brand/5 border border-brand/30 px-1 py-0.5 rounded-sm ml-2">
                              <MaterialCommunityIcons
                                name="star"
                                size={12}
                                color="#D91A21"
                              />
                              <Text className="text-[10px] text-brand font-bold ml-0.5">
                                Favorito
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-xs text-text-secondary mt-0.5">
                          {address.neighborhood} - {address.city}/
                          {address.state}
                          {address.complement ? ` • ${address.complement}` : ""}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </View>
        </View>

        {/* 2. FORMA DE PAGAMENTO */}
        <View style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: "#1A1613", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
          <Text className="text-base font-bold text-text-primary mb-3">
            Forma de Pagamento
          </Text>
          <View className="gap-3">
            {(deliveryMethod === "pickup"
              ? (["pix", "credit_card", "cash"] as PaymentMethod[])
              : (["pix", "credit_card"] as PaymentMethod[])
            ).map((method) => {
              const isActive = paymentMethod === method;
              const icons = {
                pix: "qrcode",
                credit_card: "credit-card-outline",
                cash: "cash",
              } as const;
              const labels = {
                pix: "PIX",
                credit_card: "Cartão de Crédito",
                cash: "Pague na entrega",
              };
              const descriptions = {
                pix: "Aprovação imediata",
                credit_card: "Débito à vista",
                cash: "Pague ao receber",
              };
              return (
                <TouchableOpacity
                  key={method}
                  className={`flex-row items-center px-4 py-4 mt-1 border-[1.5px] rounded-btn ${
                    isActive
                      ? "border-brand bg-brand/5"
                      : "border-neutral-200 bg-neutral-100"
                  }`}
                  onPress={() => setPaymentMethod(method)}
                  activeOpacity={0.7}
                >
                  <View
                    className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                      isActive ? "bg-brand/10" : "bg-neutral-200"
                    }`}
                  >
                    <MaterialCommunityIcons
                      name={icons[method]}
                      size={22}
                      color={isActive ? "#D91A21" : "#888888"}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`text-sm font-bold ${
                        isActive ? "text-brand" : "text-text-primary"
                      }`}
                    >
                      {labels[method]}
                    </Text>
                    <Text className="text-xs text-text-secondary mt-0.5">
                      {descriptions[method]}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={isActive ? "radiobox-marked" : "radiobox-blank"}
                    size={22}
                    color={isActive ? "#D91A21" : "#C2C2C2"}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 3. RESUMO DOS VALORES */}
        <View style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: "#1A1613", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
          <Text className="text-base font-bold text-text-primary mb-3">
            Resumo da Compra
          </Text>
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm text-text-secondary">
              Subtotal ({items?.length || 0} itens)
            </Text>
            <Text className="text-sm text-text-primary font-medium">
              {formatPrice(subtotal)}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm text-text-secondary">Taxa de Entrega</Text>
            <Text
              className={`text-sm font-medium ${
                currentDeliveryFee === -1 ? "text-brand" : "text-text-primary"
              }`}
            >
              {deliveryMethod === "pickup"
                ? "Isento"
                : currentDeliveryFee === -1
                  ? "Região não atendida"
                  : formatPrice(currentDeliveryFee)}
            </Text>
          </View>

          <View className="flex-row justify-between mt-3 pt-3 border-t border-neutral-200">
            <Text className="text-base font-bold text-text-primary">Total</Text>
            <Text className="text-lg font-bold text-brand">
              {formatPrice(total)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* 4. FOOTER */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-surface p-4 border-t border-neutral-200"
        style={{
          paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24,
          elevation: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.05,
          shadowRadius: 5,
        }}
      >
        <TouchableOpacity
          className={`bg-brand h-[50px] rounded-btn justify-center items-center mb-3 ${
            (isCreatingOrder || currentDeliveryFee === -1) && "opacity-70"
          }`}
          activeOpacity={0.8}
          onPress={handleConfirmOrder}
          disabled={isCreatingOrder || currentDeliveryFee === -1}
        >
          {isCreatingOrder ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-brand-on text-base font-bold">
              Confirmar Pedido
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="items-center py-1"
          onPress={() => router.back()}
          disabled={isCreatingOrder}
        >
          <Text className="text-text-secondary text-sm font-medium">
            Voltar e revisar carrinho
          </Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}
