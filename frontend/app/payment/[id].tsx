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
      <View className="flex-1 justify-center items-center bg-surface-secondary">
        <ActivityIndicator size="large" color="#D91A21" />
        <Text className="mt-[15px] text-text-secondary text-base font-medium">
          Configurando check-out...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-secondary" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="px-4 py-[10px] flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="p-1.5">
          <MaterialCommunityIcons
            name="chevron-left"
            color="#121212"
            size={32}
          />
        </TouchableOpacity>
        <Text className="text-[18px] font-bold ml-2.5 text-text-primary">
          Checkout
        </Text>
      </View>

      <ScrollView
        contentContainerClassName="pb-10"
        showsVerticalScrollIndicator={false}
      >
        {/* Resumo do Pedido */}
        <View
          className="bg-surface py-5 px-5 rounded-b-card flex-row items-center justify-between w-full"
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
              className="text-neutral-300 text-[11px] uppercase tracking-[1.2px] mb-0.5"
              numberOfLines={1}
            >
              PEDIDO #{displayId}
            </Text>
            <Text
              className="text-[18px] font-extrabold text-text-primary"
              numberOfLines={1}
            >
              Hema Cereais
            </Text>
          </View>

          <View className="items-end justify-center min-w-[100px]">
            <Text className="text-[20px] font-black text-brand text-right">
              {formatPrice(total)}
            </Text>
          </View>
        </View>

        {/* Alerta de Preparação */}
        <View className="flex-row bg-brand/5 mx-5 p-4 rounded-card mt-5 items-center border border-brand/20">
          <MaterialCommunityIcons name="clock-fast" size={24} color="#D91A21" />
          <Text className="flex-1 ml-3 text-[14px] text-brand leading-[20px] font-medium">
            Assim que o pagamento for aprovado nossos funcionários vão começar a
            preparar o pedido
          </Text>
        </View>

        {method === "pix" ? (
          <View className="mt-8 px-5">
            <Text className="text-[18px] font-bold text-text-primary mb-5">
              Pague com PIX
            </Text>

            <View className="items-center mb-8 bg-surface rounded-card p-6 self-center w-[80vw] border border-neutral-200">
              <View className="p-2.5 bg-surface">
                <MaterialCommunityIcons
                  name="qrcode-scan"
                  size={140}
                  color="#121212"
                />
              </View>
              <Text className="mt-4 text-text-secondary text-[14px] font-medium">
                Escaneie o QR Code acima
              </Text>
            </View>

            <View className="w-full mt-2">
              <Text className="text-[14px] text-text-secondary mb-2.5 font-medium">
                Ou copie o código:
              </Text>
              <TouchableOpacity
                className="flex-row bg-surface p-[18px] rounded-card items-center justify-between border-[1.5px] border-neutral-200 border-dashed"
                onPress={handleCopyPix}
              >
                <Text
                  className="flex-1 mr-2.5 text-text-primary text-[14px] font-semibold"
                  numberOfLines={1}
                >
                  {id}-pix-mercadopago-mock-2026-delivery-app
                </Text>
                <MaterialCommunityIcons
                  name="content-copy"
                  size={22}
                  color="#D91A21"
                />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="mt-8 px-5">
            <Text className="text-[18px] font-bold text-text-primary mb-5">
              Dados do Cartão
            </Text>

            <View className="bg-surface p-5 rounded-card border border-neutral-200">
              <View className="mb-5">
                <Text className="text-[14px] font-bold text-text-primary mb-2">
                  Número do Cartão
                </Text>
                <TextInput
                  className="bg-neutral-100 border border-neutral-200 px-4 h-[54px] rounded-btn text-[16px] text-text-primary"
                  placeholder="0000 0000 0000 0000"
                  keyboardType="numeric"
                  placeholderTextColor="#C2C2C2"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[14px] font-bold text-text-primary mb-2">
                    Validade
                  </Text>
                  <TextInput
                    className="bg-neutral-100 border border-neutral-200 px-4 h-[54px] rounded-btn text-[16px] text-text-primary"
                    placeholder="MM/AA"
                    keyboardType="numeric"
                    placeholderTextColor="#C2C2C2"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-bold text-text-primary mb-2">
                    CVV
                  </Text>
                  <TextInput
                    className="bg-neutral-100 border border-neutral-200 px-4 h-[54px] rounded-btn text-[16px] text-text-primary"
                    placeholder="123"
                    keyboardType="numeric"
                    placeholderTextColor="#C2C2C2"
                  />
                </View>
              </View>

              <View className="mt-5">
                <Text className="text-[14px] font-bold text-text-primary mb-2">
                  Nome Completo
                </Text>
                <TextInput
                  className="bg-neutral-100 border border-neutral-200 px-4 h-[54px] rounded-btn text-[16px] text-text-primary"
                  placeholder="Como está no cartão"
                  autoCapitalize="characters"
                  placeholderTextColor="#C2C2C2"
                />
              </View>
            </View>
          </View>
        )}

        {/* Botão de Ação Final */}
        <TouchableOpacity
          className="bg-brand mx-5 h-[60px] rounded-card items-center justify-center flex-row mt-8"
          style={{
            shadowColor: "#D91A21",
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
            color="#FFFFFF"
            style={{ marginRight: 10 }}
          />
          <Text className="text-brand-on text-[18px] font-bold">
            {method === "pix"
              ? "Já realizei o pagamento"
              : "Finalizar Pagamento"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
