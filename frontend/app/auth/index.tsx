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
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { login } from "@/services/auth";
import { Toast } from "@/util/toast";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [isLoginMode, setIsLoginMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // Card de login começa abaixo da tela (SCREEN_HEIGHT) e sobe até 0
  const loginCardTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const imageOpacity = useRef(new Animated.Value(1)).current;
  const welcomeOpacity = useRef(new Animated.Value(1)).current;
  // Opacidade dedicada ao conteúdo interno do login (fade-in após card subir)
  const loginContentOpacity = useRef(new Animated.Value(0)).current;

  // ── Welcome → Login ───────────────────────────────────────────────────────
  const handleOpenLogin = () => {
    Animated.parallel([
      Animated.timing(loginCardTranslateY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(imageOpacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(welcomeOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsLoginMode(true);
      loginContentOpacity.setValue(0);
      Animated.timing(loginContentOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    });
  };

  // ── Login → Welcome ───────────────────────────────────────────────────────
  const handleCloseLogin = () => {
    Keyboard.dismiss();
    setEmail("");
    setPassword("");
    // Desmonta o conteúdo e desabilita pointer events no login card
    // antes de animar, para não bloquear toques no welcome card
    setIsLoginMode(false);
    loginContentOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(loginCardTranslateY, {
        toValue: SCREEN_HEIGHT,
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
        delay: 160,
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
      Toast.show({
        type: "error",
        text1: "Erro ao entrar",
        text2: response.message,
      });
    }
  }

  const bottomPadding = Math.max(insets.bottom, 16) + 12;

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar
        barStyle={isLoginMode ? "dark-content" : "light-content"}
        translucent
        backgroundColor="transparent"
      />

      {/* ── Imagem — cobre a tela inteira, some durante login ── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: imageOpacity,
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

      {/* ── Card de boas-vindas — altura natural pelo conteúdo, fixado no rodapé ── */}
      <Animated.View
        pointerEvents={isLoginMode ? "none" : "auto"}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "#FFFFFF",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          opacity: welcomeOpacity,
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: bottomPadding,
        }}
      >
        {/* Botão primário — Criar conta */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/auth/register-email")}
          style={{
            backgroundColor: "#D91A21",
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

        {/* Botão secundário — Login */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleOpenLogin}
          style={{
            height: 52,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1.5,
            borderColor: "#D91A21",
            marginBottom: 20,
          }}
        >
          <Text style={{ color: "#D91A21", fontSize: 15, fontWeight: "700" }}>
            Já tenho uma conta
          </Text>
        </TouchableOpacity>

        {/* Ghost — Continuar sem conta */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.replace("/(tabs)/home")}
          style={{
            height: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#888888", fontSize: 14, fontWeight: "500" }}>
            Continuar sem conta
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Card de login — tela cheia, desliza de baixo para cima ── */}
      <Animated.View
        pointerEvents={isLoginMode ? "auto" : "none"}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          transform: [{ translateY: loginCardTranslateY }],
          backgroundColor: "#FFFFFF",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 24,
        }}
      >
        {isLoginMode && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View
              style={{
                flex: 1,
                paddingTop: insets.top + 16,
                paddingBottom: bottomPadding,
              }}
            >
              {/* Voltar — fora do fade para ser imediatamente clicável */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleCloseLogin}
                style={{ alignSelf: "flex-start", marginBottom: 24, padding: 4 }}
              >
                <MaterialCommunityIcons
                  name="arrow-left"
                  size={24}
                  color="#121212"
                />
              </TouchableOpacity>

              {/* Título + campos + CTA com fade-in */}
              <Animated.View style={{ flex: 1, opacity: loginContentOpacity }}>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "800",
                    color: "#121212",
                    marginBottom: 6,
                  }}
                >
                  Entrar na conta
                </Text>
                <Text
                  style={{ fontSize: 14, color: "#666666", marginBottom: 32 }}
                >
                  Acesse com seu e-mail e senha.
                </Text>

                {/* E-mail */}
                <Text style={s.label}>E-mail ou CPF</Text>
                <View
                  style={[
                    s.inputBox,
                    focusedInput === "email" && s.inputBoxFocused,
                  ]}
                >
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

                {/* Esqueci a senha */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => router.push("/auth/forgot-password")}
                  style={{
                    alignSelf: "flex-end",
                    paddingVertical: 10,
                    marginBottom: 24,
                  }}
                >
                  <Text
                    style={{ fontSize: 14, color: "#666666", fontWeight: "500" }}
                  >
                    Esqueci minha senha
                  </Text>
                </TouchableOpacity>

                {/* CTA */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleLogin}
                  disabled={isLoading}
                  style={{
                    backgroundColor: "#D91A21",
                    height: 56,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
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
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: 16,
                        fontWeight: "700",
                      }}
                    >
                      Continuar
                    </Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
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
    color: "#8A8079",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputBox: {
    height: 54,
    borderRadius: 8,
    backgroundColor: "#FAF6F0",
    borderWidth: 1,
    borderColor: "#EAE3D7",
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
