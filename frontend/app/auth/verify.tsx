import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MaterialCommunityIcons,
  FontAwesome5,
  Feather,
} from "@expo/vector-icons";
import { Toast } from "@/util/toast";

export default function VerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedMethod, setSelectedMethod] = useState<
    "whatsapp" | "sms" | "email" | null
  >(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState(false);

  // Função para simular o envio do código
  async function handleSendCode() {
    if (!selectedMethod) {
      return Toast.show({
        type: "error",
        text1: "Selecione um método de envio.",
      });
    }

    setIsLoading(true);
    // Simula tempo de requisição
    setTimeout(() => {
      setIsLoading(false);
      setIsCodeSent(true);
    }, 1000);
  }

  // Função para validar o código final
  async function handleVerifyCode() {
    if (code.length < 6) {
      return Toast.show({
        type: "error",
        text1: "Digite o código de 6 dígitos.",
      });
    }

    Keyboard.dismiss();
    setIsLoading(true);

    // Simula verificação da API
    setTimeout(() => {
      setIsLoading(false);
      Toast.show({ type: "success", text1: "Conta verificada com sucesso!" });
      router.replace("/(tabs)/home");
    }, 1500);
  }

  // Componente para renderizar cada opção de envio
  const MethodCard = ({ id, title, icon, iconFamily: IconFamily }: any) => {
    const isSelected = selectedMethod === id;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setSelectedMethod(id)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: isSelected ? "#D91A21" : "#E0E0E0",
          backgroundColor: isSelected ? "#FFF5F5" : "#FFFFFF",
          marginBottom: 12,
        }}
      >
        <View style={{ width: 32, alignItems: "center", marginRight: 12 }}>
          <IconFamily
            name={icon}
            size={24}
            color={isSelected ? "#D91A21" : "#666666"}
          />
        </View>
        <Text
          style={{
            fontSize: 16,
            fontWeight: isSelected ? "700" : "500",
            color: isSelected ? "#D91A21" : "#333333",
            flex: 1,
          }}
        >
          {title}
        </Text>
        {isSelected && (
          <MaterialCommunityIcons
            name="check-circle"
            size={20}
            color="#D91A21"
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingTop: insets.top + 20,
          paddingBottom: Math.max(insets.bottom, 20) + 8,
        }}
      >
        {/* Botão de voltar */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            if (isCodeSent) {
              setIsCodeSent(false);
              setCode("");
            } else {
              router.back();
            }
          }}
          style={{
            alignSelf: "flex-start",
            marginBottom: 24,
            padding: 4,
            marginLeft: -4,
          }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#121212" />
        </TouchableOpacity>

        {/* ── PASSO 1: ESCOLHER MÉTODO ── */}
        {!isCodeSent ? (
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: "#121212",
                marginBottom: 8,
              }}
            >
              Verificação de segurança
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: "#666666",
                marginBottom: 32,
                lineHeight: 22,
              }}
            >
              Para manter sua conta segura, precisamos confirmar sua identidade.
              Escolha por onde deseja receber seu código de verificação.
            </Text>

            <MethodCard
              id="whatsapp"
              title="WhatsApp"
              icon="whatsapp"
              iconFamily={FontAwesome5}
            />
            <MethodCard
              id="sms"
              title="SMS"
              icon="message-processing-outline"
              iconFamily={MaterialCommunityIcons}
            />
            <MethodCard
              id="email"
              title="E-mail"
              icon="mail"
              iconFamily={Feather}
            />

            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSendCode}
                disabled={!selectedMethod || isLoading}
                style={{
                  backgroundColor: selectedMethod ? "#D91A21" : "#D0D0D0",
                  height: 56,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    Enviar código
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* ── PASSO 2: DIGITAR O CÓDIGO ── */
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: "#121212",
                marginBottom: 8,
              }}
            >
              Insira o código
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: "#666666",
                marginBottom: 32,
                lineHeight: 22,
              }}
            >
              Enviamos um código de 6 dígitos para o seu{" "}
              <Text style={{ fontWeight: "700", color: "#121212" }}>
                {selectedMethod === "whatsapp"
                  ? "WhatsApp"
                  : selectedMethod === "sms"
                    ? "SMS"
                    : "E-mail"}
              </Text>
              .
            </Text>

            <View style={{ marginBottom: 24 }}>
              <Text style={sCode.label}>Código de verificação</Text>
              <View style={[sCode.inputBox, focusedInput && sCode.inputBoxFocused]}>
                <TextInput
                  style={sCode.otpInput}
                  placeholder="000000"
                  placeholderTextColor="#C2C2C2"
                  value={code}
                  onChangeText={setCode}
                  onFocus={() => setFocusedInput(true)}
                  onBlur={() => setFocusedInput(false)}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!isLoading}
                  autoFocus
                />
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSendCode}
              style={{ alignSelf: "center", marginBottom: 32 }}
            >
              <Text
                style={{ fontSize: 14, color: "#D91A21", fontWeight: "600" }}
              >
                Reenviar código
              </Text>
            </TouchableOpacity>

            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleVerifyCode}
                disabled={code.length < 6 || isLoading}
                style={{
                  backgroundColor: code.length === 6 ? "#D91A21" : "#D0D0D0",
                  height: 56,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    Confirmar
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const sCode = {
  label: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#C2C2C2",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputBox: {
    height: 54,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingHorizontal: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  inputBoxFocused: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D91A21",
  },
  otpInput: {
    flex: 1,
    fontSize: 22,
    color: "#121212",
    letterSpacing: 10,
    textAlign: "center" as const,
    paddingVertical: 0,
    includeFontPadding: false,
  },
};
