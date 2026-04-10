import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { supabase } from "@/services/supabase";

async function scheduleOrderNotification(title: string, body: string) {
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch {
    // silencia em ambientes onde notificações não são suportadas (Expo Go)
  }
}

async function setupNotificationHandler() {
  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing !== "granted") {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // silencia em Expo Go
  }
}

export function useOrderNotifications(userId: string | null) {
  const notifiedOrders = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    setupNotificationHandler();

    const channel = supabase
      .channel(`orders-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const order = payload.new as any;
          const orderId = order.id;

          if (notifiedOrders.current.has(orderId)) return;

          if (order.status === "confirmed" && order.payment_status === "paid") {
            notifiedOrders.current.add(orderId);
            scheduleOrderNotification(
              "Pedido Confirmado! ✅",
              "Seu pagamento foi aprovado e já estamos preparando seu pedido.",
            );
          } else if (order.status === "cancelled") {
            notifiedOrders.current.add(orderId);
            scheduleOrderNotification(
              "Pedido Cancelado",
              "Seu pedido foi cancelado. Entre em contato se precisar de ajuda.",
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
