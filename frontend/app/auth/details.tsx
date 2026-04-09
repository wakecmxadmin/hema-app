import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { updateUserProfile } from "@/services/auth";
import { Toast } from "@/util/toast";

function maskCpf(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2");
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

export default function AuthDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [focusedField, setFocusedField] = useState<"name" | "phone" | "cpf" | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = name.trim().length >= 2 && !loading;

  function handleCpfChange(text: string) {
    setCpf(maskCpf(text));
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setLoading(true);
    const response = await updateUserProfile({ name: name.trim(), phone, cpf });
    setLoading(false);

    if (response.success) {
      Toast.show({ type: "success", text1: "Conta criada com sucesso!" });
      router.replace("/(tabs)/home");
    } else {
      Toast.show({ type: "error", text1: "Erro ao salvar", text2: response.message });
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 20,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Botão de voltar */}
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
          <MaterialCommunityIcons name="arrow-left" size={24} color="#121212" />
        </TouchableOpacity>

        {/* Título */}
        <Text
          style={{
            fontSize: 24,
            fontWeight: "800",
            color: "#121212",
            marginBottom: 8,
          }}
        >
          Seus dados
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: "#666666",
            marginBottom: 32,
            lineHeight: 20,
          }}
        >
          Precisamos de algumas informações para personalizar sua experiência.
        </Text>

        {/* ── Campo: Nome ── */}
        <Text style={s.label}>Nome Completo</Text>
        <View
          style={[
            s.inputBox,
            focusedField === "name" && s.inputBoxFocused,
          ]}
        >
          <TextInput
            style={s.input}
            placeholder="Digite seu nome"
            placeholderTextColor="#C2C2C2"
            value={name}
            onChangeText={setName}
            onFocus={() => setFocusedField("name")}
            onBlur={() => setFocusedField(null)}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            editable={!loading}
            returnKeyType="next"
          />
        </View>

        {/* ── Campo: Telefone ── */}
        <Text style={[s.label, { marginTop: 20 }]}>Celular</Text>
        <View style={[s.inputBox, focusedField === "phone" && s.inputBoxFocused]}>
          <TextInput
            style={s.input}
            placeholder="(00) 00000-0000"
            placeholderTextColor="#C2C2C2"
            value={phone}
            onChangeText={(t) => setPhone(maskPhone(t))}
            onFocus={() => setFocusedField("phone")}
            onBlur={() => setFocusedField(null)}
            keyboardType="phone-pad"
            editable={!loading}
            returnKeyType="next"
          />
        </View>

        {/* ── Campo: CPF ── */}
        <Text style={[s.label, { marginTop: 20 }]}>CPF</Text>
        <View
          style={[
            s.inputBox,
            focusedField === "cpf" && s.inputBoxFocused,
          ]}
        >
          <TextInput
            style={s.input}
            placeholder="000.000.000-00"
            placeholderTextColor="#C2C2C2"
            value={cpf}
            onChangeText={handleCpfChange}
            onFocus={() => setFocusedField("cpf")}
            onBlur={() => setFocusedField(null)}
            keyboardType="numeric"
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>

        <Text
          style={{
            fontSize: 12,
            color: "#C2C2C2",
            marginTop: 8,
            lineHeight: 17,
          }}
        >
          O CPF é opcional mas necessário para emissão de nota fiscal.
        </Text>
      </ScrollView>

      {/* ── CTA fixo no rodapé ── */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 16) + 12,
          backgroundColor: "#FFFFFF",
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!canSubmit}
          onPress={handleSubmit}
          style={[
            s.btn,
            { backgroundColor: canSubmit ? "#D91A21" : "#F0F0F0" },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: canSubmit ? "#FFFFFF" : "#C2C2C2",
              }}
            >
              Continuar
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
  btn: {
    height: 56,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
