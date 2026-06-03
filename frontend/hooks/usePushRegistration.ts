import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { PushService } from "@/services/push";

async function requestPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("orders", {
    name: "Pedidos",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#D91A21",
    sound: "default",
  });
}

async function fetchExpoPushToken(): Promise<string | null> {
  const projectId =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId;

  if (!projectId) {
    console.warn("[PUSH] projectId não encontrado em app.json — token não será emitido.");
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data ?? null;
  } catch (err) {
    console.error("[PUSH] Erro ao obter Expo Push Token:", err);
    return null;
  }
}

/**
 * Registra o token Expo no backend sempre que houver `userId`, e desregistra
 * quando ele vira null (logout). A fonte de verdade da sessão é o CartContext —
 * este hook NÃO subscreve `supabase.auth.onAuthStateChange` por conta própria
 * pra evitar listeners duplicados.
 */
export function usePushRegistration(userId: string | null) {
  const registeredTokenRef = useRef<string | null>(null);
  const registeredUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function registerForUser(uid: string) {
      if (registeredUserIdRef.current === uid && registeredTokenRef.current) {
        return;
      }

      const granted = await requestPermission();
      if (!granted || cancelled) return;

      await ensureAndroidChannel();

      const token = await fetchExpoPushToken();
      if (!token || cancelled) return;

      const platform: "ios" | "android" | "web" =
        Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";

      const res = await PushService.registerToken(token, platform);
      if (res.success) {
        registeredTokenRef.current = token;
        registeredUserIdRef.current = uid;
      } else {
        console.warn("[PUSH] Falha ao registrar token no backend:", res.message);
      }
    }

    async function unregisterCurrent() {
      const token = registeredTokenRef.current;
      registeredTokenRef.current = null;
      registeredUserIdRef.current = null;
      if (!token) return;
      await PushService.unregisterToken(token).catch(() => {});
    }

    if (userId) {
      registerForUser(userId);
    } else if (registeredTokenRef.current) {
      unregisterCurrent();
    }

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
