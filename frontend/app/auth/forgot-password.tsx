import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { sendPasswordResetEmail } from "../../services/auth";
import { Toast } from "@/util/toast";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false); // Estado para animar a borda do input

  // Sombra suave para o input (mantendo a identidade do app)
  const inputShadow = Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },
    android: {
      elevation: 2,
    },
  });

  async function handleReset() {
    if (!email)
      return Toast.show({ type: "error", text1: "Informe seu e-mail." });

    setIsLoading(true);
    const response = await sendPasswordResetEmail(email);
    setIsLoading(false);

    if (response.success) {
      Toast.show({
        type: "success",
        text1: "Sucesso!",
        text2: response.message,
      });
      router.back();
    } else {
      Toast.show({ type: "error", text1: "Erro", text2: response.message });
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
          title: "",
          headerShadowVisible: false,
          // Adicionado um paddingzinho no botão de voltar para facilitar o clique
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              className="p-2 -ml-2"
            >
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Trocamos a View estática por um ScrollView */}
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-7 pb-20"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="mb-10">
          <Text className="text-[36px] font-black text-[#E30613] mb-3 tracking-[-1px]">
            Recuperar senha
          </Text>
          <Text className="text-[16px] text-[#666666] leading-6 font-medium">
            Digite seu e-mail cadastrado e enviaremos um link para você criar
            uma nova senha.
          </Text>
        </View>

        <View
          className={`rounded-2xl h-[60px] mb-8 justify-center ${
            isFocused
              ? "bg-white border-2 border-[#E30613]"
              : "bg-[#F9F9F9] border border-[#E8E8E8]"
          }`}
          style={inputShadow}
        >
          <TextInput
            className="flex-1 px-5 text-[16px] text-[#1A1A1A]"
            placeholder="E-mail"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!isLoading}
          />
        </View>

        <TouchableOpacity
          className="bg-[#E30613] h-[60px] rounded-2xl justify-center items-center"
          activeOpacity={0.8}
          onPress={handleReset}
          disabled={isLoading}
          style={{
            shadowColor: "#E30613",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 6,
          }}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text className="text-[16px] font-bold uppercase tracking-[0.5px] text-white">
              Enviar Link
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
