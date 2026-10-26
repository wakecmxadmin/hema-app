import React, { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useCart } from "@/context/CartContext";
import { login } from "@/services/auth";
import { Toast } from "@/util/toast";

interface CheckoutAuthSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Chamado após o login e a subida do carrinho local para o backend. */
  onAuthenticated: () => void;
}

export function CheckoutAuthSheet({
  visible,
  onClose,
  onAuthenticated,
}: CheckoutAuthSheetProps) {
  const router = useRouter();
  const { mergeGuestCart, refreshCart } = useCart();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<"email" | "password" | null>(
    null,
  );

  async function handleLogin() {
    if (!email.trim() || !password) {
      return Toast.show({ type: "error", text1: "Preencha e-mail e senha." });
    }

    Keyboard.dismiss();
    setLoading(true);
    const response = await login(email.trim(), password);

    if (!response.success) {
      setLoading(false);
      return Toast.show({
        type: "error",
        text1: "Erro ao entrar",
        text2: response.message,
      });
    }

    // Leva o que o visitante já tinha escolhido para a conta dele
    await mergeGuestCart();
    await refreshCart();
    setLoading(false);
    setPassword("");
    onAuthenticated();
  }

  function goToRegister() {
    onClose();
    // O cadastro devolve a pessoa direto para o fechamento do pedido
    router.push({
      pathname: "/auth/register",
      params: { redirect: "checkout" },
    } as any);
  }

  function goToForgotPassword() {
    onClose();
    router.push("/auth/forgot-password" as any);
  }

  const inputBorder = (field: "email" | "password") =>
    focusedInput === field ? "#D91A21" : "#EDEDED";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} />
        </TouchableWithoutFeedback>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: Platform.OS === "ios" ? 32 : 24,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 44,
              height: 5,
              borderRadius: 3,
              backgroundColor: "#EDEDED",
              marginBottom: 20,
            }}
          />

          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: "#121212",
              marginBottom: 4,
            }}
          >
            Entre para finalizar
          </Text>
          <Text style={{ fontSize: 14, color: "#666666", marginBottom: 24 }}>
            Seu carrinho continua salvo. Precisamos da conta só para fechar o
            pedido.
          </Text>

          <Text style={s.label}>E-mail</Text>
          <View style={[s.inputWrapper, { borderColor: inputBorder("email") }]}>
            <MaterialCommunityIcons
              name="email-outline"
              size={20}
              color="#C2C2C2"
            />
            <TextInput
              style={s.input}
              placeholder="seuemail@exemplo.com"
              placeholderTextColor="#C2C2C2"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocusedInput("email")}
              onBlur={() => setFocusedInput(null)}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          <Text style={[s.label, { marginTop: 16 }]}>Senha</Text>
          <View
            style={[s.inputWrapper, { borderColor: inputBorder("password") }]}
          >
            <MaterialCommunityIcons
              name="lock-outline"
              size={20}
              color="#C2C2C2"
            />
            <TextInput
              style={s.input}
              placeholder="Digite sua senha"
              placeholderTextColor="#C2C2C2"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocusedInput("password")}
              onBlur={() => setFocusedInput(null)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              onSubmitEditing={handleLogin}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={{ padding: 4 }}
            >
              <Feather
                name={showPassword ? "eye" : "eye-off"}
                size={20}
                color="#C2C2C2"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={goToForgotPassword}
            style={{ alignSelf: "flex-end", marginTop: 12 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ fontSize: 13, color: "#666666", fontWeight: "600" }}>
              Esqueci minha senha
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={loading}
            style={{
              height: 54,
              borderRadius: 12,
              backgroundColor: loading ? "#E8A0A3" : "#D91A21",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 20,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: "#FFFFFF" }}
              >
                Entrar
              </Text>
            )}
          </TouchableOpacity>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginVertical: 18,
            }}
          >
            <View style={{ flex: 1, height: 1, backgroundColor: "#EDEDED" }} />
            <Text
              style={{ marginHorizontal: 12, fontSize: 13, color: "#999999" }}
            >
              Não tem conta?
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: "#EDEDED" }} />
          </View>

          <TouchableOpacity
            onPress={goToRegister}
            activeOpacity={0.85}
            disabled={loading}
            style={{
              height: 52,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: "#D91A21",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#D91A21" }}>
              Criar conta
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = {
  label: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#121212",
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#121212",
  },
};
