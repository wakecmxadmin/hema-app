import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { supabase } from "@/services/supabase";
import { useNotifications } from "@/context/NotificationsContext";

// Configura como as notificações aparecem enquanto o app está em foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      console.warn("[NOTIF] Permissão de notificação negada pelo usuário.");
      return false;
    }
    return true;
  } catch (err) {
    console.error("[NOTIF] Erro ao solicitar permissão:", err);
    return false;
  }
}

async function fireLocalNotification(title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch (err) {
    console.error("[NOTIF] Erro ao disparar notificação local:", err);
  }
}

type NotifConfig = {
  icon: string;
  title: string;
  body: string;
};

function resolveNotification(order: any): NotifConfig | null {
  const { status, payment_status } = order;

  if (status === "confirmed" && payment_status === "paid") {
    return {
      icon: "check-circle-outline",
      title: "Pedido Confirmado! ✅",
      body: "Seu pagamento foi aprovado e já estamos preparando seu pedido.",
    };
  }
  if (status === "preparing") {
    return {
      icon: "chef-hat",
      title: "Pedido em Preparo 👨‍🍳",
      body: "A loja já começou a preparar seu pedido.",
    };
  }
  if (status === "cancelled") {
    return {
      icon: "close-circle-outline",
      title: "Pedido Cancelado ❌",
      body: "Seu pedido foi cancelado. Entre em contato se precisar de ajuda.",
    };
  }
  return null;
}

export function useOrderNotifications(userId: string | null) {
  const { add } = useNotifications();
  const notifiedOrders = useRef<Set<string>>(new Set());
  const permissionGranted = useRef(false);

  useEffect(() => {
    requestNotificationPermission().then((granted) => {
      permissionGranted.current = granted;
    });
  }, []);

  useEffect(() => {
    if (!userId) return;

    console.log(`[NOTIF] Inscrevendo canal de notificações para userId=${userId}`);

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
          console.log("[NOTIF] Evento recebido do Supabase Realtime:", JSON.stringify(payload.new));

          const order = payload.new as any;
          const dedupeKey = `${order.id}-${order.status}-${order.payment_status}`;

          if (notifiedOrders.current.has(dedupeKey)) {
            console.log("[NOTIF] Evento duplicado ignorado:", dedupeKey);
            return;
          }

          const config = resolveNotification(order);
          if (!config) {
            console.log("[NOTIF] Status sem notificação configurada:", order.status, order.payment_status);
            return;
          }

          notifiedOrders.current.add(dedupeKey);
          console.log("[NOTIF] Disparando notificação:", config.title);

          if (permissionGranted.current) {
            fireLocalNotification(config.title, config.body);
          }

          add({
            orderId: order.id,
            icon: config.icon,
            title: config.title,
            body: config.body,
          });
        },
      )
      .subscribe((status, err) => {
        if (err) {
          console.error("[NOTIF] Erro na subscrição Supabase Realtime:", err);
        } else {
          console.log("[NOTIF] Status da subscrição Supabase Realtime:", status);
        }
      });

    return () => {
      console.log(`[NOTIF] Removendo canal para userId=${userId}`);
      supabase.removeChannel(channel);
    };
  }, [userId, add]);
}
