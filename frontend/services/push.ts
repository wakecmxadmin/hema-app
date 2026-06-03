import { apiFetch, ApiResponse } from "./api";

export const PushService = {
  async registerToken(
    expoPushToken: string,
    platform: "ios" | "android" | "web",
  ): Promise<ApiResponse<{ is_staff: boolean }>> {
    return apiFetch("/notifications/register-token", {
      method: "POST",
      body: JSON.stringify({ expo_push_token: expoPushToken, platform }),
    });
  },

  async unregisterToken(expoPushToken: string): Promise<ApiResponse<void>> {
    return apiFetch(`/notifications/token/${encodeURIComponent(expoPushToken)}`, {
      method: "DELETE",
    });
  },
};
