import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
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
import {
  OrdersService,
  ShippingOption,
  ShippingQuote,
} from "@/services/orders";
import { CouponsService } from "@/services/coupons";
import { getProfileData, updateProfile } from "@/services/profile";
import { validateCartStockService } from "@/services/cart";
import { Toast } from "@/util/toast";
import { DeliveryScheduleModal } from "@/components/DeliveryScheduleModal";

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

function maskCpf(text: string) {
  return text
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

/** Confere os dígitos verificadores do CPF. */
function isValidCpf(value: string) {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function formatDeliveryDays(option: ShippingOption) {
  const max = option.delivery_range?.max ?? option.delivery_days;
  const min = option.delivery_range?.min ?? max;
  if (!max) return "";
  if (min && min !== max) return `${min} a ${max} dias úteis`;
  return `até ${max} ${max === 1 ? "dia útil" : "dias úteis"}`;
}

function maskPhone(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
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
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_percent: number;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  // A transportadora exige telefone do comprador. Quem se cadastrou sem
  // informar (campo era opcional) preenche aqui, antes de fechar o pedido.
  const [profilePhone, setProfilePhone] = useState("");
  const [phoneInput, setPhoneInput] = useState("");

  // Fora de Curitiba e região o pedido vai pelo Melhor Envio: o frete vem de
  // uma cotação no backend e o cliente escolhe o serviço (PAC, SEDEX…).
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(
    null,
  );
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(
    null,
  );

  // A etiqueta dos Correios exige o CPF do destinatário.
  const [profileCpf, setProfileCpf] = useState("");
  const [cpfInput, setCpfInput] = useState("");

  // Conta recém-criada chega aqui sem endereço: abre o formulário uma vez,
  // em vez de deixar a pessoa procurar o botão.
  const autoOpenedAddressForm = useRef(false);
  const deliveryMethodRef = useRef(deliveryMethod);
  deliveryMethodRef.current = deliveryMethod;

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

    const profileResponse = await getProfileData();
    if (profileResponse.success && profileResponse.data) {
      const savedPhone = profileResponse.data.phone ?? "";
      setProfilePhone(savedPhone);
      setPhoneInput((current) => current || maskPhone(savedPhone));
      const savedCpf = profileResponse.data.cpf ?? "";
      setProfileCpf(savedCpf);
      setCpfInput((current) => current || maskCpf(savedCpf));
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

      if (
        data.length === 0 &&
        deliveryMethodRef.current === "delivery" &&
        !autoOpenedAddressForm.current
      ) {
        autoOpenedAddressForm.current = true;
        router.push("/addresses/new" as any);
      }
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

  const phoneInputDigits = phoneInput.replace(/\D/g, "");
  const needsPhone =
    deliveryMethod === "delivery" &&
    profilePhone.replace(/\D/g, "").length < 10;

  const subtotal = cart?.total_price ? Number(cart.total_price) : 0;
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  const localDeliveryFee = useMemo(
    () => calculateDeliveryFee(selectedAddress?.city),
    [selectedAddress],
  );

  // Endereço fora da área do motoboy → frete pelo Melhor Envio.
  const outsideLocalArea =
    deliveryMethod === "delivery" && !!selectedAddress && localDeliveryFee === -1;

  useEffect(() => {
    if (!outsideLocalArea || !selectedAddressId) {
      setShippingQuote(null);
      setQuoteLoading(false);
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);
    OrdersService.quoteShipping(selectedAddressId)
      .then((response) => {
        if (cancelled) return;
        const quote: ShippingQuote =
          response.success && response.data
            ? response.data
            : { mode: "unavailable", fee: null, options: [] };
        setShippingQuote(quote);
        // Mantém a escolha se ela ainda existir; senão, o mais barato.
        setSelectedServiceId((current) =>
          quote.options.some((o) => o.service_id === current)
            ? current
            : (quote.options[0]?.service_id ?? null),
        );
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [outsideLocalArea, selectedAddressId, subtotal, quoteNonce]);

  const shippingOptions =
    shippingQuote?.mode === "melhor_envio" ? shippingQuote.options : [];
  const isMelhorEnvio = outsideLocalArea && shippingOptions.length > 0;
  const selectedShippingOption = shippingOptions.find(
    (o) => o.service_id === selectedServiceId,
  );

  // null = frete ainda sendo calculado; -1 = não entregamos no endereço.
  const currentDeliveryFee: number | null = (() => {
    if (deliveryMethod === "pickup") return 0;
    if (!outsideLocalArea) return localDeliveryFee;
    if (quoteLoading || !shippingQuote) return null;
    if (isMelhorEnvio) return selectedShippingOption?.price ?? 0;
    return -1;
  })();

  const displayDeliveryFee =
    currentDeliveryFee == null || currentDeliveryFee === -1
      ? 0
      : currentDeliveryFee;

  const needsCpf =
    isMelhorEnvio && profileCpf.replace(/\D/g, "").length !== 11;

  // Sempre derivado do subtotal atual — nunca guardado, pra não ficar
  // defasado se o carrinho mudar depois do cupom aplicado.
  const discountAmount = appliedCoupon
    ? Number(
        Math.min(subtotal, (subtotal * appliedCoupon.discount_percent) / 100).toFixed(2),
      )
    : 0;

  const total = subtotal - discountAmount + displayDeliveryFee;

  const formatPrice = (price: number) => {
    return price.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;

    setCouponLoading(true);
    const response = await CouponsService.validate(code);
    setCouponLoading(false);

    if (response.success && response.data) {
      setAppliedCoupon({
        code: response.data.code,
        discount_percent: response.data.discount_percent,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Toast.show({
        type: "success",
        text1: "Cupom aplicado!",
        text2: `${response.data.discount_percent}% de desconto`,
      });
    } else {
      Toast.show({
        type: "error",
        text1: "Cupom inválido",
        text2: response.message,
      });
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
  };

  // O carrinho pode mudar (item removido, estoque ajustado) depois do cupom
  // aplicado — revalida pra não deixar um valor mínimo deixar de ser atendido
  // sem avisar o cliente.
  useEffect(() => {
    if (!appliedCoupon || subtotal <= 0) return;

    let cancelled = false;
    CouponsService.validate(appliedCoupon.code).then((response) => {
      if (cancelled) return;
      if (!response.success) {
        setAppliedCoupon(null);
        Toast.show({
          type: "error",
          text1: "Cupom removido",
          text2: response.message || "O cupom não é mais válido para este carrinho.",
        });
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

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
          "Não encontramos nenhuma opção de entrega para este endereço.\n\nConfira o CEP, selecione outro endereço ou mude para a opção 'Retirar na Loja'.",
          [{ text: "Entendi", style: "default" }],
        );
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [currentDeliveryFee, deliveryMethod, selectedAddressId]);

  // O clique em confirmar roda as validações locais primeiro: assim o aviso
  // de horários não aparece só pra a pessoa tomar um erro logo depois.
  const handleConfirmPress = async () => {
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

      // Frete ainda sendo calculado (o botão já fica desabilitado).
      if (currentDeliveryFee === null) return;

      if (currentDeliveryFee === -1) {
        return Toast.show({
          type: "error",
          text1: "Região não atendida",
          text2: "Selecione a opção Retirada na Loja.",
        });
      }

      if (isMelhorEnvio && !selectedShippingOption) {
        return Toast.show({
          type: "error",
          text1: "Escolha o frete",
          text2: "Selecione uma das opções de entrega.",
        });
      }

      if (needsCpf && !isValidCpf(cpfInput)) {
        return Toast.show({
          type: "error",
          text1: "Informe um CPF válido",
          text2: "Os Correios exigem o CPF de quem recebe.",
        });
      }

      if (needsPhone && phoneInputDigits.length < 10) {
        return Toast.show({
          type: "error",
          text1: "Informe um telefone",
          text2: "O entregador precisa de um número com DDD para contato.",
        });
      }

      // O badge de horários na tela passa despercebido (cliente já reclamou
      // de não ter visto): na entrega vira confirmação explícita. Não vale
      // para Correios/transportadora, que têm o próprio prazo.
      if (!isMelhorEnvio) {
        setShowScheduleModal(true);
        return;
      }
    }

    await submitOrder();
  };

  const submitOrder = async () => {
    setIsCreatingOrder(true);

    // Re-validar estoque antes de confirmar
    const stockCheck = await validateCartStockService();
    if (stockCheck.success && stockCheck.data && !stockCheck.data.valid) {
      setIsCreatingOrder(false);
      setShowScheduleModal(false);
      await refreshCart();
      const names = stockCheck.data.adjustments.map((a) => a.product_name).join(", ");
      Toast.show({
        type: "error",
        text1: "Estoque indisponível",
        text2: `Itens ajustados: ${names}. Revise o carrinho.`,
      });
      return;
    }

    // Sem telefone (ou CPF, nos Correios) no cadastro a transportadora
    // recusa a etiqueta, então os dados são salvos no perfil antes do pedido
    // existir.
    if (needsPhone || needsCpf) {
      const updates: { phone?: string; cpf?: string } = {};
      if (needsPhone) updates.phone = phoneInput;
      if (needsCpf) updates.cpf = cpfInput;
      const saved = await updateProfile(updates);
      if (!saved.success) {
        setIsCreatingOrder(false);
        setShowScheduleModal(false);
        return Toast.show({
          type: "error",
          text1: "Não foi possível salvar seus dados",
          text2: saved.message,
        });
      }
      if (needsPhone) setProfilePhone(phoneInput);
      if (needsCpf) setProfileCpf(cpfInput);
    }

    const addressToLog =
      deliveryMethod === "delivery" ? selectedAddressId : null;

    const response = await OrdersService.createOrder({
      address_id: addressToLog,
      payment_method: paymentMethod,
      coupon_code: appliedCoupon?.code,
      shipping_service_id: isMelhorEnvio ? selectedServiceId : null,
    });

    setIsCreatingOrder(false);
    setShowScheduleModal(false);

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
      } else if (
        response.error === "SHIPPING_OPTION_UNAVAILABLE" ||
        response.error === "SHIPPING_OPTION_REQUIRED"
      ) {
        // O preço/serviço mudou desde a cotação: recalcula e deixa o
        // cliente conferir antes de confirmar de novo.
        setQuoteNonce((n) => n + 1);
        Toast.show({
          type: "error",
          text1: "Frete atualizado",
          text2: response.message || "Confira as opções de entrega.",
        });
      } else if (
        response.error === "COUPON_INVALID" ||
        response.error === "COUPON_BELOW_MIN_ORDER"
      ) {
        setAppliedCoupon(null);
        Toast.show({
          type: "error",
          text1: "Cupom não pôde ser aplicado",
          text2: response.message,
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

                {outsideLocalArea ? (
                  <View className="flex-row bg-neutral-100 p-3 rounded-btn items-start mb-3">
                    <MaterialCommunityIcons
                      name="package-variant-closed"
                      size={20}
                      color="#D91A21"
                    />
                    <Text className="ml-3 flex-1 text-xs text-text-secondary">
                      Este endereço fica fora da área do nosso entregador.
                      Enviamos pelos Correios ou transportadora. O prazo
                      conta a partir do envio.
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row bg-neutral-100 p-3 rounded-btn items-start mb-3">
                    <MaterialCommunityIcons
                      name="clock-outline"
                      size={20}
                      color="#D91A21"
                    />
                    <Text className="ml-3 flex-1 text-xs text-text-secondary">
                      Entregas chegam entre 14h e 21h. Pedidos feitos até as
                      12h são entregues no mesmo dia.
                    </Text>
                  </View>
                )}

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

                {outsideLocalArea && (
                  <View className="mt-2 border-t border-neutral-200 pt-4">
                    <Text className="text-sm font-semibold text-text-primary mb-3">
                      Opções de frete
                    </Text>
                    {quoteLoading || !shippingQuote ? (
                      <View className="flex-row items-center py-3">
                        <ActivityIndicator size="small" color="#D91A21" />
                        <Text className="ml-3 text-xs text-text-secondary">
                          Calculando o frete...
                        </Text>
                      </View>
                    ) : shippingOptions.length === 0 ? (
                      <Text className="text-xs text-brand">
                        Nenhuma opção de entrega para este CEP. Escolha outro
                        endereço ou retire na loja.
                      </Text>
                    ) : (
                      shippingOptions.map((option) => {
                        const active = option.service_id === selectedServiceId;
                        return (
                          <TouchableOpacity
                            key={option.service_id}
                            className={`flex-row items-center py-3 px-3 border rounded-btn mb-2 ${
                              active
                                ? "border-brand bg-brand/5"
                                : "border-neutral-200"
                            }`}
                            onPress={() =>
                              setSelectedServiceId(option.service_id)
                            }
                          >
                            <MaterialCommunityIcons
                              name={active ? "radiobox-marked" : "radiobox-blank"}
                              size={20}
                              color={active ? "#D91A21" : "#C2C2C2"}
                            />
                            <View className="ml-3 flex-1">
                              <Text className="text-sm font-bold text-text-primary">
                                {option.name}
                                <Text className="text-xs font-normal text-text-secondary">
                                  {" "}
                                  · {option.company}
                                </Text>
                              </Text>
                              <Text className="text-xs text-text-secondary mt-0.5">
                                {formatDeliveryDays(option)}
                              </Text>
                            </View>
                            <Text className="text-sm font-bold text-text-primary">
                              {formatPrice(option.price)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                )}

                {needsCpf && (
                  <View className="mt-2 border-t border-neutral-200 pt-4">
                    <Text className="text-sm font-semibold text-text-primary mb-1">
                      CPF de quem recebe
                    </Text>
                    <Text className="text-xs text-text-secondary mb-3">
                      Os Correios exigem o CPF na etiqueta. Ele fica salvo no
                      seu perfil.
                    </Text>
                    <View className="flex-row items-center border border-neutral-200 rounded-btn px-3">
                      <MaterialCommunityIcons
                        name="card-account-details-outline"
                        size={20}
                        color="#8A8079"
                      />
                      <TextInput
                        className="flex-1 ml-2 py-3 text-sm text-text-primary"
                        placeholder="000.000.000-00"
                        placeholderTextColor="#C2C2C2"
                        value={cpfInput}
                        onChangeText={(text) => setCpfInput(maskCpf(text))}
                        keyboardType="number-pad"
                        maxLength={14}
                      />
                    </View>
                  </View>
                )}

                {needsPhone && (
                  <View className="mt-2 border-t border-neutral-200 pt-4">
                    <Text className="text-sm font-semibold text-text-primary mb-1">
                      Telefone para a entrega
                    </Text>
                    <Text className="text-xs text-text-secondary mb-3">
                      O entregador precisa de um número com DDD para te
                      encontrar. Ele fica salvo no seu perfil.
                    </Text>
                    <View className="flex-row items-center border border-neutral-200 rounded-btn px-3">
                      <MaterialCommunityIcons
                        name="phone-outline"
                        size={20}
                        color="#8A8079"
                      />
                      <TextInput
                        className="flex-1 ml-2 py-3 text-sm text-text-primary"
                        placeholder="(41) 99999-9999"
                        placeholderTextColor="#C2C2C2"
                        value={phoneInput}
                        onChangeText={(text) => setPhoneInput(maskPhone(text))}
                        keyboardType="phone-pad"
                        maxLength={15}
                      />
                    </View>
                  </View>
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

        {/* 2.5 CUPOM DE DESCONTO */}
        <View style={{ backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: "#1A1613", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
          <Text className="text-base font-bold text-text-primary mb-3">
            Cupom de Desconto
          </Text>
          {appliedCoupon ? (
            <View className="flex-row items-center justify-between bg-brand/5 border border-brand/30 rounded-btn px-3 py-3">
              <View className="flex-row items-center flex-1">
                <MaterialCommunityIcons name="ticket-percent" size={20} color="#D91A21" />
                <Text className="ml-2 text-sm font-bold text-brand">
                  {appliedCoupon.code} · {appliedCoupon.discount_percent}% OFF
                </Text>
              </View>
              <TouchableOpacity onPress={removeCoupon} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={20} color="#888888" />
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <TextInput
                value={couponInput}
                onChangeText={(text) => setCouponInput(text.toUpperCase())}
                placeholder="Código do cupom"
                placeholderTextColor="#A8A29E"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!couponLoading}
                className="flex-1 border border-neutral-200 rounded-btn px-3 py-3 text-sm text-text-primary"
              />
              <TouchableOpacity
                onPress={applyCoupon}
                disabled={couponLoading || !couponInput.trim()}
                className={`px-4 rounded-btn items-center justify-center ${
                  couponLoading || !couponInput.trim() ? "bg-neutral-200" : "bg-brand"
                }`}
              >
                {couponLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-brand-on text-sm font-bold">Aplicar</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
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
          {discountAmount > 0 && (
            <View className="flex-row justify-between mb-2">
              <Text className="text-sm text-text-secondary">
                Desconto ({appliedCoupon?.discount_percent}%)
              </Text>
              <Text className="text-sm text-brand font-medium">
                -{formatPrice(discountAmount)}
              </Text>
            </View>
          )}
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm text-text-secondary">
              {isMelhorEnvio && selectedShippingOption
                ? `Frete (${selectedShippingOption.name})`
                : "Taxa de Entrega"}
            </Text>
            <Text
              className={`text-sm font-medium ${
                currentDeliveryFee === -1 ? "text-brand" : "text-text-primary"
              }`}
            >
              {deliveryMethod === "pickup"
                ? "Isento"
                : currentDeliveryFee === null
                  ? "Calculando..."
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
            (isCreatingOrder ||
              currentDeliveryFee === -1 ||
              currentDeliveryFee === null) &&
            "opacity-70"
          }`}
          activeOpacity={0.8}
          onPress={handleConfirmPress}
          disabled={
            isCreatingOrder ||
            currentDeliveryFee === -1 ||
            currentDeliveryFee === null
          }
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

      <DeliveryScheduleModal
        visible={showScheduleModal}
        loading={isCreatingOrder}
        onConfirm={submitOrder}
        onClose={() => setShowScheduleModal(false)}
      />
    </View>
  );
}
