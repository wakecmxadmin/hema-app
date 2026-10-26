import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

import { useCart } from "@/context/CartContext";
import { signup, updateUserProfile } from "@/services/auth";
import { supabase } from "@/services/supabase";
import { Toast } from "@/util/toast";

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

type Field = "name" | "email" | "phone" | "password";

/**
 * Cadastro em uma tela só: apenas o que o pedido precisa. CPF e endereço
 * ficam para o checkout/perfil.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { mergeGuestCart, refreshCart } = useCart();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<Field | null>(null);

  const phoneDigits = phone.replace(/\D/g, "");
  const canSubmit =
    name.trim().length >= 2 &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    phoneDigits.length >= 10 &&
    password.length >= 6 &&
    !loading;

  async function handleSubmit() {
    if (!canSubmit) return;

    setLoading(true);
    const response = await signup(email.trim(), password, name.trim());

    if (!response.success) {
      setLoading(false);
      return Toast.show({
        type: "error",
        text1: "Não foi possível criar a conta",
        text2: response.message,
      });
    }

    // Sem sessão = o projeto exige confirmação de e-mail antes de entrar
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setLoading(false);
      Toast.show({
        type: "success",
        text1: "Conta criada! Confirme o e-mail para entrar",
        text2: "Enviamos um link para " + email.trim(),
      });
      router.replace("/auth" as any);
      return;
    }

    const profile = await updateUserProfile({ name: name.trim(), phone });
    if (!profile.success) {
      Toast.show({
        type: "error",
        text1: "Conta criada, mas houve um erro ao salvar seus dados",
        text2: profile.message,
      });
    }

    // O que o visitante já tinha no carrinho sobe para a conta dele
    await mergeGuestCart();
    await refreshCart();
    setLoading(false);

    Toast.show({ type: "success", text1: "Conta criada com sucesso!" });
    router.replace(
      (redirect === "checkout" ? "/checkout" : "/(tabs)/home") as any,
    );
  }

  const borderOf = (field: Field) =>
    focused === field ? "#D91A21" : "#EDEDED";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 12,
          paddingBottom: 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ width: 36, height: 36, justifyContent: "center" }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#121212" />
        </TouchableOpacity>

        <Text
          style={{
            fontSize: 24,
            fontWeight: "800",
            color: "#121212",
            marginTop: 16,
          }}
        >
          Criar conta
        </Text>
        <Text style={{ fontSize: 14, color: "#666666", marginTop: 6, marginBottom: 28 }}>
          {redirect === "checkout"
            ? "Só isso e você volta direto para o fechamento do pedido."
            : "Leva menos de um minuto."}
        </Text>

        <Text style={s.label}>Nome</Text>
        <View style={[s.inputWrapper, { borderColor: borderOf("name") }]}>
          <MaterialCommunityIcons
            name="account-outline"
            size={20}
            color="#C2C2C2"
          />
          <TextInput
            style={s.input}
            placeholder="Como podemos te chamar"
            placeholderTextColor="#C2C2C2"
            value={name}
            onChangeText={setName}
            onFocus={() => setFocused("name")}
            onBlur={() => setFocused(null)}
            autoCapitalize="words"
            autoComplete="name"
            editable={!loading}
          />
        </View>

        <Text style={[s.label, { marginTop: 18 }]}>E-mail</Text>
        <View style={[s.inputWrapper, { borderColor: borderOf("email") }]}>
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
            onFocus={() => setFocused("email")}
            onBlur={() => setFocused(null)}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!loading}
          />
        </View>

        <Text style={[s.label, { marginTop: 18 }]}>Celular</Text>
        <View style={[s.inputWrapper, { borderColor: borderOf("phone") }]}>
          <MaterialCommunityIcons
            name="whatsapp"
            size={20}
            color="#C2C2C2"
          />
          <TextInput
            style={s.input}
            placeholder="(00) 00000-0000"
            placeholderTextColor="#C2C2C2"
            value={phone}
            onChangeText={(text) => setPhone(maskPhone(text))}
            onFocus={() => setFocused("phone")}
            onBlur={() => setFocused(null)}
            keyboardType="phone-pad"
            editable={!loading}
          />
        </View>
        <Text style={s.hint}>Usamos para avisar sobre o seu pedido.</Text>

        <Text style={[s.label, { marginTop: 18 }]}>Senha</Text>
        <View style={[s.inputWrapper, { borderColor: borderOf("password") }]}>
          <MaterialCommunityIcons
            name="lock-outline"
            size={20}
            color="#C2C2C2"
          />
          <TextInput
            style={s.input}
            placeholder="Mínimo de 6 caracteres"
            placeholderTextColor="#C2C2C2"
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            onSubmitEditing={handleSubmit}
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
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={!canSubmit}
          style={{
            height: 56,
            borderRadius: 12,
            backgroundColor: canSubmit ? "#D91A21" : "#E8A0A3",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 28,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFFFFF" }}>
              {redirect === "checkout" ? "Criar conta e continuar" : "Criar conta"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace("/auth" as any)}
          style={{ marginTop: 20, alignItems: "center" }}
          disabled={loading}
        >
          <Text style={{ fontSize: 14, color: "#666666", fontWeight: "600" }}>
            Já tenho uma conta
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  hint: {
    fontSize: 12,
    color: "#999999",
    marginTop: 8,
  },
};
