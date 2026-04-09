import { supabase } from "./supabase";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000";

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

interface FetchOptions extends RequestInit {
  isMultipart?: boolean;
}

export async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<ApiResponse<T>> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const headers: Record<string, string> = {
      ...((options.headers as object) || {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (!options.isMultipart) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Se havia token (sessão real expirou), limpa o estado local.
      // Não redireciona — cada tela decide como reagir à falta de auth.
      if (token) {
        await AsyncStorage.clear();
        await supabase.auth.signOut();
      }
      return {
        success: false,
        message: "Sua sessão expirou. Faça login novamente.",
      };
    }

    const result = await response.json().catch(() => ({}));

    return {
      success: response.ok ? (result.success ?? true) : false,
      message: result.message || "Erro de comunicação com o servidor",
      data: result.data,
      error: result.error,
    };
  } catch (error: any) {
    console.error(`[API FETCH ERROR] ${endpoint}:`, error);
    return {
      success: false,
      message: "Não foi possível conectar ao servidor. Verifique sua internet.",
    };
  }
}
