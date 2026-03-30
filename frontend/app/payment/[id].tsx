import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Toast } from "@/util/toast";

const formatPrice = (value: string | number) => {
  const val = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(val || 0);
};

export default function PaymentPage() {
  const { id, method, total } = useLocalSearchParams<{
    id: string;
    method: string;
    total: string;
  }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const displayId = id ? id.split("-")[0] : "...";

  useEffect(() => {
    // Isso aqui é um mock visual temporário.
    // No futuro, aqui você faria um fetch(getOrderDetails) para pegar o QR code real do PIX
    const timer = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const handleCopyPix = async () => {
    const fakePixCode =
      "00020101021226870014br.gov.bcb.pix25650021br.mercadopago.mock123456";
    await Clipboard.setStringAsync(fakePixCode);

    Toast.show({
      type: "success",
      text1: "Código copiado!",
      text2: "Agora é só colar no app do seu banco.",
    });
  };

  const handleFinishPayment = () => {
    if (method === "credit_card") {
      Toast.show({ type: "success", text1: "Pagamento enviado com sucesso!" });
      router.replace("/(tabs)/home");
    } else {
      router.replace("/(tabs)/home");
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#F8F9FA]">
        <ActivityIndicator size="large" color="#E31837" />
        <Text className="mt-[15px] text-[#666] text-base font-medium">
          Configurando check-out...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F8F9FA]" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header Customizado com Botão Voltar */}
      <View className="px-[15px] py-[10px] flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="p-1.5">
          <MaterialCommunityIcons
            name="chevron-left"
            color="#1A1A1A"
            size={32}
          />
        </TouchableOpacity>
        <Text className="text-[18px] font-bold ml-2.5 text-[#1A1A1A]">
          Checkout
        </Text>
      </View>

      <ScrollView
        contentContainerClassName="pb-10"
        showsVerticalScrollIndicator={false}
      >
        {/* Resumo do Pedido */}
        <View
          className="bg-white py-5 px-5 rounded-b-[24px] flex-row items-center justify-between w-full"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <View className="flex-1 mr-2.5">
            <Text
              className="text-[#999] text-[11px] uppercase tracking-[1.2px] mb-0.5"
              numberOfLines={1}
            >
              PEDIDO #{displayId}
            </Text>
            <Text
              className="text-[18px] font-extrabold text-[#1A1A1A]"
              numberOfLines={1}
            >
              Hema Cereais
            </Text>
          </View>

          <View className="items-end justify-center min-w-[100px]">
            <Text className="text-[20px] font-black text-[#E31837] text-right">
              {formatPrice(total)}
            </Text>
          </View>
        </View>

        {/* Alerta de Preparação */}
        <View className="flex-row bg-[#FFF1F2] mx-5 p-4 rounded-2xl mt-5 items-center border border-[#FFDFE1]">
          <MaterialCommunityIcons name="clock-fast" size={24} color="#E31837" />
          <Text className="flex-1 ml-3 text-[14px] text-[#C0162D] leading-[20px] font-medium">
            Assim que o pagamento for aprovado nossos funcionários vão começar a
            preparar o pedido
          </Text>
        </View>

        {method === "pix" ? (
          <View className="mt-8 px-5">
            <Text className="text-[18px] font-bold text-[#1A1A1A] mb-5">
              Pague com PIX
            </Text>

            <View className="items-center mb-8 bg-white rounded-[24px] p-6 self-center w-[80vw] border border-[#F0F0F0]">
              <View className="p-2.5 bg-white">
                <MaterialCommunityIcons
                  name="qrcode-scan"
                  size={140}
                  color="#1A1A1A"
                />
              </View>
              <Text className="mt-4 text-[#666] text-[14px] font-medium">
                Escaneie o QR Code acima
              </Text>
            </View>

            <View className="w-full mt-2">
              <Text className="text-[14px] text-[#666] mb-2.5 font-medium">
                Ou copie o código:
              </Text>
              <TouchableOpacity
                className="flex-row bg-white p-[18px] rounded-[14px] items-center justify-between border-[1.5px] border-[#EEE] border-dashed"
                onPress={handleCopyPix}
              >
                <Text
                  className="flex-1 mr-2.5 text-[#1A1A1A] text-[14px] font-semibold"
                  numberOfLines={1}
                >
                  {id}-pix-mercadopago-mock-2026-delivery-app
                </Text>
                <MaterialCommunityIcons
                  name="content-copy"
                  size={22}
                  color="#E31837"
                />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="mt-8 px-5">
            <Text className="text-[18px] font-bold text-[#1A1A1A] mb-5">
              Dados do Cartão
            </Text>

            <View className="bg-white p-5 rounded-[20px] border border-[#EEE]">
              <View className="mb-5">
                <Text className="text-[14px] font-bold text-[#444] mb-2">
                  Número do Cartão
                </Text>
                <TextInput
                  className="bg-[#F9FAFB] border border-[#E5E7EB] px-4 h-[54px] rounded-xl text-[16px] text-[#1A1A1A]"
                  placeholder="0000 0000 0000 0000"
                  keyboardType="numeric"
                  placeholderTextColor="#999"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[14px] font-bold text-[#444] mb-2">
                    Validade
                  </Text>
                  <TextInput
                    className="bg-[#F9FAFB] border border-[#E5E7EB] px-4 h-[54px] rounded-xl text-[16px] text-[#1A1A1A]"
                    placeholder="MM/AA"
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-bold text-[#444] mb-2">
                    CVV
                  </Text>
                  <TextInput
                    className="bg-[#F9FAFB] border border-[#E5E7EB] px-4 h-[54px] rounded-xl text-[16px] text-[#1A1A1A]"
                    placeholder="123"
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                  />
                </View>
              </View>

              <View className="mt-5">
                <Text className="text-[14px] font-bold text-[#444] mb-2">
                  Nome Completo
                </Text>
                <TextInput
                  className="bg-[#F9FAFB] border border-[#E5E7EB] px-4 h-[54px] rounded-xl text-[16px] text-[#1A1A1A]"
                  placeholder="Como está no cartão"
                  autoCapitalize="characters"
                  placeholderTextColor="#999"
                />
              </View>
            </View>
          </View>
        )}

        {/* Botão de Ação Final */}
        <TouchableOpacity
          className="bg-[#E31837] mx-5 h-[60px] rounded-2xl items-center justify-center flex-row mt-8"
          style={{
            shadowColor: "#E31837",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6,
          }}
          onPress={handleFinishPayment}
        >
          <MaterialCommunityIcons
            name={method === "pix" ? "check-bold" : "credit-card-check"}
            size={24}
            color="#FFF"
            style={{ marginRight: 10 }}
          />
          <Text className="text-white text-[18px] font-bold">
            {method === "pix"
              ? "Já realizei o pagamento"
              : "Finalizar Pagamento"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
