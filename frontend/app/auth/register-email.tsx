import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthRegistration } from "@/context/AuthContext";

export default function RegisterEmail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setStepData } = useAuthRegistration();
  const [email, setEmail] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const isEmailValid = email.includes("@") && email.includes(".");

  function handleContinue() {
    if (!isEmailValid) return;
    setStepData({ email });
    router.push("/auth/password");
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <StatusBar
        barStyle="dark-content"
        translucent
        backgroundColor="transparent"
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingTop: insets.top + 16,
          }}
        >
          {/* Voltar */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.back()}
            style={{
              alignSelf: "flex-start",
              marginBottom: 32,
              padding: 4,
              marginLeft: -4,
            }}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color="#121212"
            />
          </TouchableOpacity>

          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: "#121212",
              marginBottom: 8,
            }}
          >
            Qual é o seu e-mail?
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "#666666",
              marginBottom: 32,
              lineHeight: 20,
            }}
          >
            Use um e-mail válido para criar sua conta.
          </Text>

          <Text style={s.label}>E-mail</Text>
          <View style={[s.inputBox, isFocused && s.inputBoxFocused]}>
            <TextInput
              style={s.input}
              placeholder="seuemail@exemplo.com"
              placeholderTextColor="#C2C2C2"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              value={email}
              onChangeText={setEmail}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
          </View>
        </View>

        {/* CTA fixo no rodapé */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 20) + 12,
          }}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!isEmailValid}
            onPress={handleContinue}
            style={{
              height: 56,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isEmailValid ? "#D91A21" : "#F5F5F5",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: isEmailValid ? "#FFFFFF" : "#C2C2C2",
              }}
            >
              Continuar
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
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
