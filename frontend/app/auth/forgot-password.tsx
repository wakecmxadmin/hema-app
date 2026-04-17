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
  const [isFocused, setIsFocused] = useState(false);

  async function handleReset() {
    if (!email)
      return Toast.show({ type: "error", text1: "Informe seu e-mail." });

    setIsLoading(true);
    const response = await sendPasswordResetEmail(email);
    setIsLoading(false);

    if (response.success) {
      Toast.show({ type: "success", text1: "Sucesso!", text2: response.message });
      router.back();
    } else {
      Toast.show({ type: "error", text1: "Erro", text2: response.message });
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
          title: "",
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, marginLeft: -8 }}>
              <Ionicons name="arrow-back" size={24} color="#121212" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={{ marginBottom: 40 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: "#D91A21", marginBottom: 12, letterSpacing: -0.5 }}>
            Recuperar senha
          </Text>
          <Text style={{ fontSize: 15, color: "#666666", lineHeight: 22, fontWeight: "500" }}>
            Digite seu e-mail cadastrado e enviaremos um link para você criar uma nova senha.
          </Text>
        </View>

        <Text style={s.label}>E-mail</Text>
        <View style={[s.inputBox, isFocused && s.inputBoxFocused, { marginBottom: 32 }]}>
          <TextInput
            style={s.input}
            placeholder="seuemail@exemplo.com"
            placeholderTextColor="#C2C2C2"
            value={email}
            onChangeText={setEmail}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
            returnKeyType="done"
            onSubmitEditing={handleReset}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleReset}
          disabled={isLoading}
          style={{
            height: 56,
            borderRadius: 8,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#D91A21",
            shadowColor: "#D91A21",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFFFFF" }}>
              Enviar link
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
