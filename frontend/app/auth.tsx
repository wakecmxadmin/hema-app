import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { login, signup } from "../services/auth";
import { View as MotiView, Text as MotiText, AnimatePresence } from "moti";
import { Toast } from "@/util/toast";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AuthScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const toggleMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsLogin(!isLogin);
  };

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
      Toast.show({
        type: "error",
        text1: "Erro ao entrar",
        text2: response.message,
      });
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
      Toast.show({
        type: "error",
        text1: "Erro ao criar conta",
        text2: response.message,
      });
    }
  }

  // Sombra suave para o input wrapper
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

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-7 justify-center">
          <View className="mb-10 items-start">
            <MotiText
              className="text-[42px] font-black text-[#EA1D2C] tracking-[-2px]"
              from={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              HEMA
            </MotiText>
            <Text className="text-base text-[#666666] mt-3 leading-6 font-normal">
              Alimentos naturais entregues na sua casa
            </Text>
          </View>

          <View>
            <AnimatePresence exitBeforeEnter>
              {!isLogin && (
                <MotiView
                  key="name-input"
                  from={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 80, marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ type: "timing", duration: 250 }}
                  style={{ overflow: "hidden" }}
                >
                  <View
                    className={`rounded-[16px] justify-center ${
                      focusedInput === "name"
                        ? "bg-white border-2 border-[#EA1D2C]"
                        : "bg-[#F9F9F9] border border-[#E8E8E8]"
                    }`}
                    style={inputShadow}
                  >
                    <TextInput
                      className="h-[60px] px-5 text-base text-[#1A1A1A]"
                      placeholder="Nome completo"
                      placeholderTextColor="#999"
                      value={name}
                      onChangeText={setName}
                      onFocus={() => setFocusedInput("name")}
                      onBlur={() => setFocusedInput(null)}
                      editable={!isLoading}
                    />
                  </View>
                </MotiView>
              )}
            </AnimatePresence>

            <View
              className={`rounded-[16px] mb-5 justify-center ${
                focusedInput === "email"
                  ? "bg-white border-2 border-[#EA1D2C]"
                  : "bg-[#F9F9F9] border border-[#E8E8E8]"
              }`}
              style={inputShadow}
            >
              <TextInput
                className="h-[60px] px-5 text-base text-[#1A1A1A]"
                placeholder="E-mail"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput("email")}
                onBlur={() => setFocusedInput(null)}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isLoading}
              />
            </View>

            <View
              className={`rounded-[16px] mb-5 justify-center ${
                focusedInput === "password"
                  ? "bg-white border-2 border-[#EA1D2C]"
                  : "bg-[#F9F9F9] border border-[#E8E8E8]"
              }`}
              style={inputShadow}
            >
              <TextInput
                className="h-[60px] px-5 text-base text-[#1A1A1A]"
                placeholder="Senha"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput("password")}
                onBlur={() => setFocusedInput(null)}
                secureTextEntry
                editable={!isLoading}
              />
            </View>

            <View style={{ marginTop: 24 }} />

            <TouchableOpacity
              className="bg-[#EA1D2C] h-[58px] rounded-[16px] justify-center items-center mt-3"
              activeOpacity={0.8}
              onPress={isLogin ? handleLogin : handleSignup}
              disabled={isLoading}
              style={{
                shadowColor: "#EA1D2C",
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
                  className="text-base font-bold uppercase tracking-[0.5px] text-white"
                  from={{ opacity: 0, translateY: 5 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  exit={{ opacity: 0, translateY: -5 }}
                >
                  {isLogin ? "Entrar" : "Criar conta"}
                </MotiText>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="mt-6 items-center self-center"
              onPress={toggleMode}
              disabled={isLoading}
            >
              <Text className="text-[15px] text-[#666666]">
                {isLogin ? "Ainda não tem conta? " : "Já tenho conta. "}
                <Text className="font-bold text-[#EA1D2C]">
                  {isLogin ? "Criar conta" : "Entrar"}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
