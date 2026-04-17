import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/services/supabase";
import { resetPassword } from "../../services/auth";
import { Toast } from "@/util/toast";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedInput, setFocusedInput] = useState<"new" | "confirm" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "PASSWORD_RECOVERY" || session) {
          setIsReady(true);
        }
      }
    );
    return () => authListener.subscription.unsubscribe();
  }, []);

  async function handleUpdatePassword() {
    if (!isReady)
      return Toast.show({ type: "error", text1: "Link inválido ou expirado." });

    if (newPassword.length < 6)
      return Toast.show({ type: "error", text1: "A senha deve ter pelo menos 6 caracteres." });

    if (newPassword !== confirmPassword)
      return Toast.show({ type: "error", text1: "As senhas não coincidem." });

    setIsLoading(true);
    const response = await resetPassword(newPassword);
    setIsLoading(false);

    if (response.success) {
      Toast.show({ type: "success", text1: "Senha atualizada!", text2: "Sua senha foi alterada com sucesso." });
      router.replace("/(tabs)/home");
    } else {
      Toast.show({ type: "error", text1: "Erro ao atualizar", text2: response.message });
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Nova Senha",
          headerTintColor: "#D91A21",
          headerShadowVisible: false,
        }}
      />

      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center" }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: "#D91A21", marginBottom: 8, letterSpacing: -0.5 }}>
          Criar nova senha
        </Text>
        <Text style={{ fontSize: 14, color: "#666666", marginBottom: 32, lineHeight: 20 }}>
          Quase lá! Digite sua nova senha abaixo para recuperar o acesso à sua conta.
        </Text>

        {/* Nova senha */}
        <Text style={s.label}>Nova senha</Text>
        <View
          style={[
            s.inputBox,
            { flexDirection: "row", alignItems: "center" },
            focusedInput === "new" && s.inputBoxFocused,
            { marginBottom: 16 },
          ]}
        >
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="••••••••"
            placeholderTextColor="#C2C2C2"
            value={newPassword}
            onChangeText={setNewPassword}
            onFocus={() => setFocusedInput("new")}
            onBlur={() => setFocusedInput(null)}
            secureTextEntry={!showNew}
            editable={!isLoading}
            returnKeyType="next"
          />
          <TouchableOpacity onPress={() => setShowNew(!showNew)} style={{ padding: 4 }}>
            <Feather name={showNew ? "eye" : "eye-off"} size={20} color="#C2C2C2" />
          </TouchableOpacity>
        </View>

        {/* Confirmar senha */}
        <Text style={s.label}>Confirmar senha</Text>
        <View
          style={[
            s.inputBox,
            { flexDirection: "row", alignItems: "center" },
            focusedInput === "confirm" && s.inputBoxFocused,
            { marginBottom: 32 },
          ]}
        >
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="••••••••"
            placeholderTextColor="#C2C2C2"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onFocus={() => setFocusedInput("confirm")}
            onBlur={() => setFocusedInput(null)}
            secureTextEntry={!showConfirm}
            editable={!isLoading}
            returnKeyType="done"
            onSubmitEditing={handleUpdatePassword}
          />
          <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={{ padding: 4 }}>
            <Feather name={showConfirm ? "eye" : "eye-off"} size={20} color="#C2C2C2" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleUpdatePassword}
          disabled={isLoading || !newPassword || !confirmPassword}
          style={{
            height: 56,
            borderRadius: 8,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: newPassword && confirmPassword ? "#D91A21" : "#F5F5F5",
            shadowColor: "#D91A21",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: newPassword && confirmPassword ? 0.3 : 0,
            shadowRadius: 8,
            elevation: newPassword && confirmPassword ? 6 : 0,
          }}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: newPassword && confirmPassword ? "#FFFFFF" : "#C2C2C2",
              }}
            >
              Atualizar senha
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = {
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
  input: {
    flex: 1,
    fontSize: 15,
    color: "#121212",
    paddingVertical: 0,
    includeFontPadding: false,
  },
};
