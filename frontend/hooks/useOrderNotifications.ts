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
  if (status === "awaiting_dispatch") {
    return {
      icon: "storefront-outline",
      title: "Pedido Pronto! 📦",
      body: "Seu pedido está pronto e aguardando a saída para entrega.",
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

const PUSH_TYPE_ICONS: Record<string, string> = {
  new_order: "package-variant-closed",
  order_confirmed_by_store: "check-circle-outline",
  order_rejected: "close-circle-outline",
  order_payment_expired: "clock-alert-outline",
  order_cancelled: "close-circle-outline",
};

export function useOrderNotifications(userId: string | null) {
  const { add } = useNotifications();
  const notifiedOrders = useRef<Set<string>>(new Set());
  const permissionGranted = useRef(false);

  useEffect(() => {
    requestNotificationPermission().then((granted) => {
      permissionGranted.current = granted;
    });
  }, []);

  // Push notifications recebidas via Expo (server → device) também devem
  // aparecer no painel de notificações. Cobrimos os dois caminhos:
  // 1. addNotificationReceivedListener: app em foreground/background
  // 2. addNotificationResponseReceivedListener: usuário toca na notificação
  // Dedup é por (type, orderId) — se Realtime já adicionou, ignoramos.
  useEffect(() => {
    const handleIncoming = (notification: Notifications.Notification) => {
      const content = notification.request.content;
      const title = (content.title ?? "").trim();
      const body = (content.body ?? "").trim();
      const data: any = content.data ?? {};
      if (!title && !body) return;

      const orderId: string | undefined = data?.orderId;
      const type: string | undefined = data?.type;
      const dedupeKey = `push-${type ?? "generic"}-${orderId ?? notification.request.identifier}`;
      if (notifiedOrders.current.has(dedupeKey)) return;
      notifiedOrders.current.add(dedupeKey);

      const icon = (type && PUSH_TYPE_ICONS[type]) || "bell-outline";

      add({ orderId, icon, title: title || "Notificação", body });
    };

    const received = Notifications.addNotificationReceivedListener(handleIncoming);
    const responded = Notifications.addNotificationResponseReceivedListener(
      (response) => handleIncoming(response.notification),
    );

    return () => {
      received.remove();
      responded.remove();
    };
  }, [add]);

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
