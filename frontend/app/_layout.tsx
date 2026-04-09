import "../global.css";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack, useRouter, useSegments } from "expo-router";
import { supabase } from "@/services/supabase";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import "react-native-reanimated";
import { View, Platform, StatusBar as RNStatusBar } from "react-native";
import { ToastContainer } from "@/components/ToastContainer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useColorScheme } from "@/components/useColorScheme";
import { CartProvider } from "@/context/CartContext";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <RootLayoutNav />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const isInitialRoute = useRef(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthReady(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_, session) => {
        setSession(session);
        setIsAuthReady(true);
      },
    );

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const inAuthGroup = segments[0] === "auth";
    const currentSegments = segments as string[];

    // Telas do fluxo de registro/reset que não devem sofrer redirect
    const BYPASS_SCREENS = new Set(["password", "verify", "reset-password", "details"]);
    if (currentSegments.some((s) => BYPASS_SCREENS.has(s))) return;

    if (session) {
      const isEmailConfirmed = !!session.user?.email_confirmed_at;

      if (isEmailConfirmed && inAuthGroup) {
        // Já autenticado e confirmado — sai do grupo /auth
        router.replace("/(tabs)/home");
      } else if (!isEmailConfirmed && inAuthGroup) {
        // Cadastrado mas e-mail não confirmado — mantém no fluxo de verificação
        router.replace("/auth/verify");
      }
    } else {
      // Guest mode: app reabriu com estado residual em /auth → manda pra home
      if (isInitialRoute.current && inAuthGroup) {
        router.replace("/(tabs)/home");
      }
    }

    isInitialRoute.current = false;
  }, [session, isAuthReady, segments]);

  if (!isAuthReady) return null;

  return <>{children}</>;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const dynamicHeaderHeight =
    Platform.OS === "ios" ? 44 + insets.top : 56 + RNStatusBar.currentHeight!;

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <CartProvider>
        <View
          style={{
            flex: 1,
            backgroundColor: colorScheme === "dark" ? "#000" : "#fff",
          }}
        >
          <AuthGuard>
            <Stack
              screenOptions={{
                headerShown: false,
                headerStyle: {
                  backgroundColor: "#fff",
                },
                headerTitleStyle: {
                  fontWeight: "bold",
                  fontSize: 18,
                },
                headerTitleAlign: "center",
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="auth" />
            </Stack>
          </AuthGuard>
          <ToastContainer />
        </View>
      </CartProvider>
    </ThemeProvider>
  );
}
