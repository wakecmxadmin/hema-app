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
import { supabase } from "@/services/supabase";
import { resetPassword } from "../../services/auth";
import { Toast } from "@/util/toast";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Evento Auth no Reset:", event);
        if (event === "PASSWORD_RECOVERY" || session) {
          setIsReady(true);
        }
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function handleUpdatePassword() {
    if (!isReady) {
      return Toast.show({ type: "error", text1: "Link inválido ou expirado." });
    }

    if (newPassword.length < 6) {
      return Toast.show({
        type: "error",
        text1: "A senha deve ter pelo menos 6 caracteres.",
      });
    }

    if (newPassword !== confirmPassword) {
      return Toast.show({ type: "error", text1: "As senhas não coincidem." });
    }

    setIsLoading(true);
    const response = await resetPassword(newPassword);
    setIsLoading(false);

    if (response.success) {
      Toast.show({
        type: "success",
        text1: "Senha atualizada!",
        text2: "Sua senha foi alterada com sucesso.",
      });
      router.replace("/(tabs)/home");
    } else {
      Toast.show({
        type: "error",
        text1: "Erro ao atualizar",
        text2: response.message,
      });
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Nova Senha",
          headerTintColor: "#E30613",
          headerShadowVisible: false,
        }}
      />

      <View className="flex-1 px-7 justify-center">
        <Text className="text-[32px] font-black text-[#E30613] mb-2">
          Criar nova senha
        </Text>
        <Text className="text-base text-[#666] mb-8">
          Quase lá! Digite sua nova senha abaixo para recuperar o acesso à sua
          conta.
        </Text>

        <View className="bg-[#F9F9F9] border border-[#E8E8E8] rounded-[16px] mb-4 p-5">
          <TextInput
            className="h-10 px-5 text-base text-[#1A1A1A]"
            placeholder="Nova senha"
            placeholderTextColor="#999"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />
        </View>

        <View className="bg-[#F9F9F9] border border-[#E8E8E8] rounded-[16px] mb-8 p-5">
          <TextInput
            className="h-10 px-5 text-base text-[#1A1A1A]"
            placeholder="Confirme a nova senha"
            placeholderTextColor="#999"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          className="bg-[#E30613] h-[58px] rounded-[16px] justify-center items-center"
          onPress={handleUpdatePassword}
          disabled={isLoading || !newPassword || !confirmPassword}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text className="text-white font-bold uppercase">
              Atualizar Senha
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
