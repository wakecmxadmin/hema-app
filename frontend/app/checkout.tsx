import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context"; // <-- Import adicionado

import { useCart } from "@/context/CartContext";
import { getAddresses, Address } from "@/services/addresses";
import { OrdersService } from "@/services/orders";
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
  const insets = useSafeAreaInsets(); // <-- Hook adicionado para pegar as margens seguras

  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>("delivery");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );

  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    await refreshCart();

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

    const addressToLog =
      deliveryMethod === "delivery" ? selectedAddressId : null;

    const response = await OrdersService.createOrder({
      address_id: addressToLog,
      payment_method: paymentMethod,
    });

    setIsCreatingOrder(false);

    if (response.success && response.data) {
      await refreshCart();

      if (paymentMethod === "cash") {
        setShowSuccessModal(true);
      } else {
        router.push({
          pathname: "/payment/[id]",
          params: {
            id: response.data.order_id,
            method: paymentMethod,
            total: response.data.total_price,
          },
        });
      }
    } else {
      Toast.show({
        type: "error",
        text1: "Erro ao finalizar pedido",
        text2: response.message,
      });
    }
  };

  if (loading && items.length === 0) {
    return (
      <View className="flex-1 bg-[#F8F8F8] pt-10 justify-center items-center">
        <ActivityIndicator size="large" color="#E30613" />
        <Text className="mt-2.5 text-[#666]">
          Carregando dados do pedido...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F8F8F8] pt-10">
      <StatusBar barStyle="dark-content" />

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
            colors={["#E30613"]}
            tintColor="#E30613"
          />
        }
      >
        {/* 1. MÉTODO DE ENTREGA */}
        <View className="bg-white rounded-lg p-4 mb-4 border border-[#EAEAEA]">
          <Text className="text-base font-bold text-[#333] mb-3">
            Como deseja receber?
          </Text>
          <View className="flex-row justify-between gap-2.5">
            <TouchableOpacity
              className={`flex-1 border-[1.5px] rounded-lg py-3 px-2 items-center ${
                deliveryMethod === "delivery"
                  ? "border-[#E30613] bg-[#FFF5F5]"
                  : "border-[#EAEAEA] bg-[#FAFAFA]"
              }`}
              onPress={() => setDeliveryMethod("delivery")}
            >
              <MaterialCommunityIcons
                name="bike"
                size={28}
                color={deliveryMethod === "delivery" ? "#E30613" : "#999"}
              />
              <Text
                className={`text-[13px] font-semibold mt-1.5 ${
                  deliveryMethod === "delivery"
                    ? "text-[#E30613]"
                    : "text-[#666]"
                }`}
              >
                Delivery
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className={`flex-1 border-[1.5px] rounded-lg py-3 px-2 items-center ${
                deliveryMethod === "pickup"
                  ? "border-[#E30613] bg-[#FFF5F5]"
                  : "border-[#EAEAEA] bg-[#FAFAFA]"
              }`}
              onPress={() => setDeliveryMethod("pickup")}
            >
              <MaterialCommunityIcons
                name="storefront-outline"
                size={28}
                color={deliveryMethod === "pickup" ? "#E30613" : "#999"}
              />
              <Text
                className={`text-[13px] font-semibold mt-1.5 ${
                  deliveryMethod === "pickup" ? "text-[#E30613]" : "text-[#666]"
                }`}
              >
                Retirar na Loja
              </Text>
            </TouchableOpacity>
          </View>

          {/* DADOS DE ENTREGA / RETIRADA */}
          <View className="mt-4 border-t border-[#EAEAEA] pt-4">
            {deliveryMethod === "pickup" ? (
              <View className="flex-row bg-[#F5F5F5] p-3 rounded-lg items-start">
                <MaterialCommunityIcons
                  name="map-marker-radius"
                  size={24}
                  color="#E30613"
                />
                <View className="ml-2.5 flex-1">
                  <Text className="text-sm font-bold text-[#333] mb-1">
                    Endereço de Retirada
                  </Text>
                  <Text className="text-[13px] text-[#666] mb-0.5">
                    R. São José dos Pinhais, 187 - Sítio Cercado
                  </Text>
                  <Text className="text-[13px] text-[#666] mb-0.5">
                    Curitiba - PR, 81910-010
                  </Text>
                  <Text className="text-xs text-[#666] mt-1.5 font-medium">
                    <MaterialCommunityIcons
                      name="clock-outline"
                      size={14}
                      color="#666"
                    />{" "}
                    09hAM às 18h30PM (Fechado aos domingos)
                  </Text>
                </View>
              </View>
            ) : (
              <View>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-sm font-semibold text-[#333]">
                    Selecione o Endereço
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/addresses/new" as any)}
                  >
                    <MaterialCommunityIcons
                      name="plus-circle"
                      size={24}
                      color="#E30613"
                    />
                  </TouchableOpacity>
                </View>

                {loadingAddresses ? (
                  <ActivityIndicator
                    size="small"
                    color="#E30613"
                    style={{ marginVertical: 20 }}
                  />
                ) : addresses.length === 0 ? (
                  <Text className="text-sm text-[#999] italic text-center mt-2.5">
                    Nenhum endereço cadastrado.
                  </Text>
                ) : (
                  addresses.map((address) => (
                    <TouchableOpacity
                      key={address.id}
                      className={`flex-row items-center py-3 px-2.5 border rounded-lg mb-2 ${
                        selectedAddressId === address.id
                          ? "border-[#E30613] bg-[#FFF5F5]"
                          : "border-[#EAEAEA]"
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
                          selectedAddressId === address.id ? "#E30613" : "#999"
                        }
                      />
                      <View className="ml-3 flex-1">
                        {address.label && (
                          <Text className="text-sm font-bold text-[#333] mb-0.5">
                            {address.label}
                          </Text>
                        )}

                        <View className="flex-row items-center">
                          <Text
                            className="text-sm font-semibold text-[#333] flex-shrink"
                            numberOfLines={1}
                          >
                            {address.street}, {address.number}
                          </Text>
                          {address.is_default && (
                            <View className="flex-row items-center bg-[#FFF5F5] border border-[rgba(227,24,55,0.3)] px-1.5 py-0.5 rounded ml-2">
                              <MaterialCommunityIcons
                                name="star"
                                size={12}
                                color="#E30613"
                              />
                              <Text className="text-[10px] text-[#E30613] font-bold ml-0.5">
                                Favorito
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-xs text-[#666] mt-0.5">
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
        <View className="bg-white rounded-lg p-4 mb-4 border border-[#EAEAEA]">
          <Text className="text-base font-bold text-[#333] mb-3">
            Forma de Pagamento
          </Text>
          <View className="flex-row justify-between gap-2.5">
            <TouchableOpacity
              className={`flex-1 border-[1.5px] rounded-lg py-3 px-2 items-center ${
                paymentMethod === "pix"
                  ? "border-[#E30613] bg-[#FFF5F5]"
                  : "border-[#EAEAEA] bg-[#FAFAFA]"
              }`}
              onPress={() => setPaymentMethod("pix")}
            >
              <MaterialCommunityIcons
                name="qrcode"
                size={24}
                color={paymentMethod === "pix" ? "#E30613" : "#999"}
              />
              <Text
                className={`text-[13px] font-semibold mt-1.5 ${
                  paymentMethod === "pix" ? "text-[#E30613]" : "text-[#666]"
                }`}
              >
                PIX
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className={`flex-1 border-[1.5px] rounded-lg py-3 px-2 items-center ${
                paymentMethod === "credit_card"
                  ? "border-[#E30613] bg-[#FFF5F5]"
                  : "border-[#EAEAEA] bg-[#FAFAFA]"
              }`}
              onPress={() => setPaymentMethod("credit_card")}
            >
              <MaterialCommunityIcons
                name="credit-card-outline"
                size={24}
                color={paymentMethod === "credit_card" ? "#E30613" : "#999"}
              />
              <Text
                className={`text-[13px] font-semibold mt-1.5 ${
                  paymentMethod === "credit_card"
                    ? "text-[#E30613]"
                    : "text-[#666]"
                }`}
              >
                Cartão
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className={`flex-1 border-[1.5px] rounded-lg py-3 px-2 items-center ${
                paymentMethod === "cash"
                  ? "border-[#E30613] bg-[#FFF5F5]"
                  : "border-[#EAEAEA] bg-[#FAFAFA]"
              }`}
              onPress={() => setPaymentMethod("cash")}
            >
              <MaterialCommunityIcons
                name="cash"
                size={24}
                color={paymentMethod === "cash" ? "#E30613" : "#999"}
              />
              <Text
                className={`text-[13px] font-semibold mt-1.5 ${
                  paymentMethod === "cash" ? "text-[#E30613]" : "text-[#666]"
                }`}
              >
                Dinheiro
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. RESUMO DOS VALORES */}
        <View className="bg-white rounded-lg p-4 mb-4 border border-[#EAEAEA]">
          <Text className="text-base font-bold text-[#333] mb-3">
            Resumo da Compra
          </Text>
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm text-[#666]">
              Subtotal ({items?.length || 0} itens)
            </Text>
            <Text className="text-sm text-[#333] font-medium">
              {formatPrice(subtotal)}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm text-[#666]">Taxa de Entrega</Text>
            <Text
              className={`text-sm font-medium ${
                currentDeliveryFee === -1 ? "text-[#E30613]" : "text-[#333]"
              }`}
            >
              {deliveryMethod === "pickup"
                ? "Isento"
                : currentDeliveryFee === -1
                  ? "Região não atendida"
                  : formatPrice(currentDeliveryFee)}
            </Text>
          </View>

          <View className="flex-row justify-between mt-2.5 pt-2.5 border-t border-[#EAEAEA]">
            <Text className="text-base font-bold text-[#1A1A1A]">Total</Text>
            <Text className="text-lg font-bold text-[#E30613]">
              {formatPrice(total)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* 4. FOOTER */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white p-4 border-t border-[#EAEAEA]"
        style={{
          // Ajuste dinâmico: soma 16px de margem + o tamanho da barra de navegação nativa do Android/iOS
          paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24,
          elevation: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.05,
          shadowRadius: 5,
        }}
      >
        <TouchableOpacity
          className={`bg-[#E30613] h-[50px] rounded-md justify-center items-center mb-2.5 ${
            (isCreatingOrder || currentDeliveryFee === -1) && "opacity-70"
          }`}
          activeOpacity={0.8}
          onPress={handleConfirmOrder}
          disabled={isCreatingOrder || currentDeliveryFee === -1}
        >
          {isCreatingOrder ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text className="text-white text-base font-bold">
              Confirmar Pedido
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="items-center py-1"
          onPress={() => router.back()}
          disabled={isCreatingOrder}
        >
          <Text className="text-[#666] text-sm font-medium">
            Voltar e revisar carrinho
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showSuccessModal} transparent={true} animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center p-5">
          <View
            className="bg-white rounded-[16px] p-[30px] items-center w-full max-w-[340px]"
            style={{
              elevation: 10,
              shadowColor: "#000",
              shadowOpacity: 0.2,
              shadowRadius: 10,
            }}
          >
            <MaterialCommunityIcons
              name="check-decagram"
              size={80}
              color="#4CAF50"
            />
            <Text className="text-[24px] font-bold text-[#1A1A1A] mt-4 text-center">
              Pedido Confirmado!
            </Text>
            <Text className="text-base text-[#666] text-center mt-2 mb-6 leading-[22px]">
              Recebemos seu pedido e já vamos começar a preparar.
            </Text>
            <TouchableOpacity
              className="bg-[#E30613] py-3.5 px-6 rounded-lg w-full items-center"
              onPress={() => {
                setShowSuccessModal(false);
                refreshCart();
                router.replace("/(tabs)/home");
              }}
            >
              <Text className="text-white text-base font-bold">Concluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
