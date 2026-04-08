import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StatusBar,
  ActivityIndicator,
  Keyboard,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Animated,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather, AntDesign } from "@expo/vector-icons";
import { login } from "@/services/auth";
import { Toast } from "@/util/toast";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const IMAGE_HEIGHT = SCREEN_HEIGHT * 0.62;
const CARD_OFFSET = IMAGE_HEIGHT - 32;

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // isLoginMode controla QUAL conteúdo renderizar dentro do card
  // — só muda APÓS as animações terminarem (ida) ou ANTES (volta)
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // ─── Todos os valores animados usam native driver (translateY + opacity) ───
  const cardTranslateY = useRef(new Animated.Value(CARD_OFFSET)).current;
  const imageOpacity   = useRef(new Animated.Value(1)).current;
  const welcomeOpacity = useRef(new Animated.Value(1)).current;
  const loginOpacity = useRef(new Animated.Value(1)).current;

  // Welcome → Login: card sobe, imagem some, conteúdo troca no callback
  const handleOpenLogin = () => {
    Animated.parallel([
      Animated.timing(cardTranslateY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(imageOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(welcomeOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(loginOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsLoginMode(true);
    });
  };

  // Login → Welcome: troca conteúdo imediatamente, depois anima o card descendo
  const handleCloseLogin = () => {
    Keyboard.dismiss();
    setEmail("");
    setPassword("");
    setIsLoginMode(false); 
    Animated.parallel([
      Animated.timing(cardTranslateY, {
        toValue: CARD_OFFSET,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.timing(imageOpacity, {
        toValue: 1,
        duration: 300,
        delay: 60,
        useNativeDriver: true,
      }),
      Animated.timing(welcomeOpacity, {
        toValue: 1,
        duration: 260,
        delay: 180, // aparece quando o card já desceu o suficiente
        useNativeDriver: true,
      }),
      Animated.timing(loginOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  };

  async function handleLogin() {
    if (!email || !password) {
      return Toast.show({ type: "error", text1: "Preencha e-mail e senha." });
    }
    Keyboard.dismiss();
    setIsLoading(true);
    const response = await login(email, password);
    setIsLoading(false);
    if (response.success) {
      router.replace("/(tabs)/home");
    } else {
      Toast.show({ type: "error", text1: "Erro ao entrar", text2: response.message });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar
        barStyle={isLoginMode ? "dark-content" : "light-content"}
        translucent
        backgroundColor="transparent"
      />

      {/* ── Imagem — sempre montada, desaparece com fade ── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: IMAGE_HEIGHT,
          opacity: imageOpacity,
          overflow: "hidden",
        }}
      >
        <Image
          source={require("@/assets/images/auth.jpg")}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.0)"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 120 }}
          pointerEvents="none"
        />
      </Animated.View>

      {/* ── Card — sempre montado, desliza com translateY ── */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0, bottom: 0, left: 0, right: 0,
          transform: [{ translateY: cardTranslateY }],
          backgroundColor: "#FFFFFF",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 24,
        }}
      >
        {/* ── Conteúdo de Boas-vindas ── */}
        {!isLoginMode && (
          <Animated.View
            style={{
              height: SCREEN_HEIGHT - CARD_OFFSET,
              opacity: welcomeOpacity,
              justifyContent: "flex-end",
              paddingBottom: Math.max(insets.bottom, 20) + 8,
            }}
          >
            {/* Botão primário — Criar conta */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push("/auth/register-email")}
              style={{
                backgroundColor: "#8C0000",
                height: 56,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>
                Criar nova conta
              </Text>
            </TouchableOpacity>

            {/* Botão secundário — Login (dispara a animação) */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleOpenLogin}
              style={{
                height: 56,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: "#8C0000",
                marginBottom: 32,
              }}
            >
              <Text style={{ color: "#8C0000", fontSize: 16, fontWeight: "700" }}>
                Já tenho uma conta
              </Text>
            </TouchableOpacity>

            {/* Divisória */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: "#E0E0E0" }} />
              <Text style={{ color: "#C2C2C2", marginHorizontal: 12, fontSize: 13 }}>OU</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: "#E0E0E0" }} />
            </View>

            {/* Google */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={{
                flexDirection: "row",
                height: 56,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "#E0E0E0",
                backgroundColor: "#FFFFFF",
              }}
            >
              <AntDesign name="google" size={22} color="#DB4437" style={{ marginRight: 12 }} />
              <Text style={{ color: "#121212", fontSize: 15, fontWeight: "600" }}>
                Entrar com o Google
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {isLoginMode && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View
              style={{
                flex: 1,
                paddingTop: insets.top + 12,
                paddingBottom: Math.max(insets.bottom, 20) + 8,
              }}
            >
              {/* Voltar */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleCloseLogin}
                style={{ alignSelf: "flex-start", marginBottom: 24, padding: 4 }}
              >
                <MaterialCommunityIcons name="arrow-left" size={24} color="#121212" />
              </TouchableOpacity>

              <Text style={{ fontSize: 22, fontWeight: "800", color: "#121212", marginBottom: 6 }}>
                Entrar na conta
              </Text>
              <Text style={{ fontSize: 14, color: "#666666", marginBottom: 32 }}>
                Acesse com seu e-mail e senha.
              </Text>

              {/* E-mail */}
              <Text style={s.label}>E-mail ou CPF</Text>
              <View style={[s.inputBox, focusedInput === "email" && s.inputBoxFocused]}>
                <TextInput
                  style={s.input}
                  placeholder="seuemail@exemplo.com"
                  placeholderTextColor="#C2C2C2"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedInput("email")}
                  onBlur={() => setFocusedInput(null)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                  returnKeyType="next"
                />
              </View>

              {/* Senha */}
              <Text style={[s.label, { marginTop: 16 }]}>Senha</Text>
              <View
                style={[
                  s.inputBox,
                  { flexDirection: "row", alignItems: "center" },
                  focusedInput === "password" && s.inputBoxFocused,
                ]}
              >
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor="#C2C2C2"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedInput("password")}
                  onBlur={() => setFocusedInput(null)}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                  <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#C2C2C2" />
                </TouchableOpacity>
              </View>

              {/* Esqueci a senha */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push("/auth/forgot-password")}
                style={{ alignSelf: "flex-end", paddingVertical: 10, marginBottom: 24 }}
              >
                <Text style={{ fontSize: 14, color: "#666666", fontWeight: "500" }}>
                  Esqueci minha senha
                </Text>
              </TouchableOpacity>

              {/* CTA */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleLogin}
                disabled={isLoading}
                style={{
                  backgroundColor: "#8C0000",
                  height: 56,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#8C0000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 6,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>
                    Continuar
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </Animated.View>
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
    borderColor: "#8C0000",
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#121212",
    paddingVertical: 0,
    includeFontPadding: false,
  },
};
