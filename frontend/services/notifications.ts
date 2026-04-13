import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AppNotification {
  id: string;
  orderId: string;
  icon: string;
  title: string;
  body: string;
  createdAt: string; // ISO
  read: boolean;
  dismissed: boolean;
}

const STORAGE_KEY = "@hema_notifications";

export async function loadNotifications(): Promise<AppNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveNotifications(list: AppNotification[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function formatNotificationTime(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Agora";
  if (diffMins < 60) return `${diffMins} min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Ontem";
  return `${diffDays} dias`;
}
