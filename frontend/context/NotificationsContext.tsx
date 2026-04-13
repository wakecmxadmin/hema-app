import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  AppNotification,
  loadNotifications,
  saveNotifications,
} from "@/services/notifications";

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  add: (
    n: Omit<AppNotification, "id" | "createdAt" | "read" | "dismissed">,
  ) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [all, setAll] = useState<AppNotification[]>([]);

  useEffect(() => {
    loadNotifications().then(setAll);
  }, []);

  const notifications = all.filter((n) => !n.dismissed);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const add = useCallback(
    async (
      n: Omit<AppNotification, "id" | "createdAt" | "read" | "dismissed">,
    ) => {
      const newNotif: AppNotification = {
        ...n,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
        read: false,
        dismissed: false,
      };
      setAll((prev) => {
        const updated = [newNotif, ...prev];
        saveNotifications(updated);
        return updated;
      });
    },
    [],
  );

  const dismiss = useCallback(async (id: string) => {
    setAll((prev) => {
      const updated = prev.map((n) =>
        n.id === id ? { ...n, dismissed: true } : n,
      );
      saveNotifications(updated);
      return updated;
    });
  }, []);

  const markAllRead = useCallback(async () => {
    setAll((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
  }, []);

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, add, dismiss, markAllRead }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx)
    throw new Error(
      "useNotifications must be used within NotificationsProvider",
    );
  return ctx;
}
