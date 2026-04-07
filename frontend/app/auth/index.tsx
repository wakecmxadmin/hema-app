import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
  ScrollView,
  Image,
  StatusBar,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { login, signup } from "@/services/auth";
import { View as MotiView, Text as MotiText, AnimatePresence } from "moti";
import { Toast } from "@/util/toast";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const toggleMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsLogin(!isLogin);
  };

  function scrollToBottom() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
  }

  async function handleLogin() {
    if (!email || !password) {
      return Toast.show({ type: "error", text1: "Preencha todos os campos." });
    }
    Keyboard.dismiss();
    setIsLoading(true);
    const response = await login(email, password);
    setIsLoading(false);
    if (response.success) {
      Toast.show({ type: "success", text1: response.message });
      router.replace("/(tabs)/home");
    } else {
      Toast.show({ type: "error", text1: "Erro ao entrar", text2: response.message });
    }
  }

  async function handleSignup() {
    if (!email || !password || !name) {
      return Toast.show({ type: "error", text1: "Preencha todos os campos." });
    }
    Keyboard.dismiss();
    setIsLoading(true);
    const response = await signup(email, password, name);
    setIsLoading(false);
    if (response.success) {
      Toast.show({ type: "success", text1: response.message });
      router.replace("/(tabs)/home");
    } else {
      Toast.show({ type: "error", text1: "Erro ao criar conta", text2: response.message });
    }
  }

  const inputShadow = Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },
    android: { elevation: 2 },
  });

  const androidOffset = (StatusBar.currentHeight ?? 0) + (insets.top > 0 ? insets.top : 0);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "android" ? androidOffset : 0}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 28,
          paddingTop: Math.max(insets.top, 20) + 8,
          paddingBottom: Math.max(insets.bottom, 16) + 16,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bounces={false}
      >
        {/* Logo */}
        <View style={{ alignItems: "center", marginBottom: 28 }}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={{ width: 180, height: 180, resizeMode: "contain" }}
          />
        </View>

        {/* Header */}
        <View style={{ marginBottom: 28 }}>
          <MotiText
            from={{ opacity: 0, translateY: 6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300 }}
            className="text-[38px] font-black text-[#A60200] tracking-[-1.5px]"
          >
            {isLogin ? "Bem-vindo!" : "Criar conta"}
          </MotiText>
          <Text className="text-[15px] text-[#666666] mt-1 leading-6 font-medium">
            {isLogin
              ? "Entre para continuar comprando."
              : "Preencha os dados para se cadastrar."}
          </Text>
        </View>

        {/* Form */}
        <View>
          <AnimatePresence exitBeforeEnter>
            {!isLogin && (
              <MotiView
                key="name-input"
                from={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 76, marginBottom: 4 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ type: "timing", duration: 250 }}
                style={{ overflow: "hidden" }}
              >
                <View
                  className={`rounded-2xl justify-center h-[60px] ${
                    focusedInput === "name"
                      ? "bg-white border-2 border-[#A60200]"
                      : "bg-[#F9F9F9] border border-[#E8E8E8]"
                  }`}
                  style={inputShadow}
                >
                  <TextInput
                    className="flex-1 px-5 text-[16px] text-[#1A1A1A]"
                    placeholder="Nome completo"
                    placeholderTextColor="#999"
                    value={name}
                    onChangeText={setName}
                    onFocus={() => { setFocusedInput("name"); scrollToBottom(); }}
                    onBlur={() => setFocusedInput(null)}
                    editable={!isLoading}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </MotiView>
            )}
          </AnimatePresence>

          <View
            className={`rounded-2xl h-[60px] mb-4 justify-center ${
              focusedInput === "email"
                ? "bg-white border-2 border-[#A60200]"
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
              onFocus={() => { setFocusedInput("email"); scrollToBottom(); }}
              onBlur={() => setFocusedInput(null)}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isLoading}
              returnKeyType="next"
            />
          </View>

          <View
            className={`flex-row items-center rounded-2xl h-[60px] mb-4 ${
              focusedInput === "password"
                ? "bg-white border-2 border-[#A60200]"
                : "bg-[#F9F9F9] border border-[#E8E8E8]"
            }`}
            style={inputShadow}
          >
            <TextInput
              className="flex-1 px-5 text-[16px] text-[#1A1A1A]"
              placeholder="Senha"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              onFocus={() => { setFocusedInput("password"); scrollToBottom(); }}
              onBlur={() => setFocusedInput(null)}
              secureTextEntry={!showPassword}
              editable={!isLoading}
              returnKeyType="done"
              onSubmitEditing={isLogin ? handleLogin : handleSignup}
            />
            <TouchableOpacity
              className="px-5 h-full justify-center"
              onPress={() => setShowPassword(!showPassword)}
            >
              <Feather name={showPassword ? "eye" : "eye-off"} size={22} color="#999" />
            </TouchableOpacity>
          </View>

          {isLogin && (
            <TouchableOpacity
              className="self-end py-2 mb-2"
              onPress={() => router.push("/auth/forgot-password")}
            >
              <Text className="text-[#666] font-semibold text-[14px]">
                Esqueceu sua senha?
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            className="bg-[#A60200] h-[60px] rounded-2xl justify-center items-center mt-4"
            activeOpacity={0.8}
            onPress={isLogin ? handleLogin : handleSignup}
            disabled={isLoading}
            style={{
              shadowColor: "#A60200",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 6,
            }}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <MotiText
                className="text-[16px] font-bold uppercase tracking-[0.5px] text-white"
                from={{ opacity: 0, translateY: 5 }}
                animate={{ opacity: 1, translateY: 0 }}
                exit={{ opacity: 0, translateY: -5 }}
              >
                {isLogin ? "Entrar" : "Criar conta"}
              </MotiText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-8 py-3 items-center self-center"
            onPress={toggleMode}
            disabled={isLoading}
          >
            <Text className="text-[15px] text-[#666666]">
              {isLogin ? "Ainda não tem conta? " : "Já tenho conta. "}
              <Text className="font-extrabold text-[#A60200]">
                {isLogin ? "Criar conta" : "Entrar"}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
