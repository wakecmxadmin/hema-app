import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuthRegistration } from "@/context/AuthContext";

export default function PasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setStepData, signUp, loading } = useAuthRegistration();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState<
    "password" | "confirm" | null
  >(null);

  const confirmRef = useRef<TextInput>(null);
  const btnScale = useRef(new Animated.Value(1)).current;

  // ─── Derivações ──────────────────────────────────────────────────────────
  const passwordOk = password.length >= 6;
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const confirmMismatch = confirm.length > 0 && !passwordsMatch;
  const canSubmit = passwordOk && passwordsMatch && !loading;

  // ─── Handlers ────────────────────────────────────────────────────────────

  function handlePasswordChange(text: string) {
    setPassword(text);
    setStepData({ password: text });
  }

  function handlePressIn() {
    if (!canSubmit) return;
    Animated.spring(btnScale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(btnScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    const success = await signUp();
    if (success) {
      router.push("/auth/details");
    }
  }

  // ─── Estilo dinâmico dos campos ──────────────────────────────────────────

  const passwordBoxStyle = [
    s.inputBox,
    focusedField === "password" && s.inputBoxFocused,
  ];

  const confirmBoxStyle = [
    s.inputBox,
    confirmMismatch
      ? s.inputBoxError
      : passwordsMatch
        ? s.inputBoxSuccess
        : focusedField === "confirm" && s.inputBoxFocused,
  ];

  const eyeColorPassword =
    focusedField === "password" || password.length > 0 ? "#D91A21" : "#C2C2C2";

  const eyeColorConfirm = passwordsMatch
    ? "#28A745"
    : confirmMismatch
      ? "#DC3545"
      : focusedField === "confirm" || confirm.length > 0
        ? "#D91A21"
        : "#C2C2C2";

  // ─── Render ───────────────────────────────────────────────────────────────

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
          Crie sua senha
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: "#666666",
            marginBottom: 32,
            lineHeight: 20,
          }}
        >
          Mínimo 6 caracteres. Use letras e números para uma senha mais segura.
        </Text>

        {/* ── Campo: Senha ── */}
        <Text style={s.label}>Senha</Text>
        <View style={passwordBoxStyle}>
          <TextInput
            style={s.input}
            placeholder="Digite sua senha"
            placeholderTextColor="#C2C2C2"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            value={password}
            onChangeText={handlePasswordChange}
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField(null)}
            editable={!loading}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={eyeColorPassword}
            />
          </TouchableOpacity>
        </View>

        {/* ── Campo: Confirmar Senha ── */}
        <Text style={[s.label, { marginTop: 20 }]}>Confirmar Senha</Text>
        <View style={confirmBoxStyle}>
          <TextInput
            ref={confirmRef}
            style={s.input}
            placeholder="Repita sua senha"
            placeholderTextColor="#C2C2C2"
            secureTextEntry={!showConfirm}
            autoCapitalize="none"
            autoCorrect={false}
            value={confirm}
            onChangeText={setConfirm}
            onFocus={() => setFocusedField("confirm")}
            onBlur={() => setFocusedField(null)}
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          {/* Ícone direito contextual */}
          {passwordsMatch ? (
            <MaterialCommunityIcons
              name="check-circle"
              size={20}
              color="#28A745"
            />
          ) : confirmMismatch ? (
            <MaterialCommunityIcons
              name="close-circle"
              size={20}
              color="#DC3545"
            />
          ) : (
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => setShowConfirm((v) => !v)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <MaterialCommunityIcons
                name={showConfirm ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={eyeColorConfirm}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Mensagem de erro inline — altura fixa para evitar layout shift */}
        <View style={{ height: 22, justifyContent: "center", marginTop: 6 }}>
          {confirmMismatch && (
            <Text style={{ fontSize: 12, color: "#DC3545", fontWeight: "500" }}>
              As senhas não coincidem.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* ── CTA fixo no rodapé ── */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 16) + 12,
          backgroundColor: "#FFFFFF",
        }}
      >
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <TouchableOpacity
            activeOpacity={1}
            disabled={!canSubmit}
            onPress={handleSubmit}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
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
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

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
  inputBoxSuccess: {
    backgroundColor: "#F6FFF8",
    borderWidth: 1.5,
    borderColor: "#28A745",
  },
  inputBoxError: {
    backgroundColor: "#FFF5F5",
    borderWidth: 1.5,
    borderColor: "#DC3545",
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
