import { supabase } from "./supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCachedToken, setCachedToken } from "./session-cache";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES_FOR_IDEMPOTENT = 2; // só GET

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

interface FetchOptions extends RequestInit {
  isMultipart?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function singleAttempt(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<ApiResponse<T>> {
  try {
    // Lê do cache (atualizado pelo CartContext). Cai para getSession() apenas
    // na primeira request, antes do listener montar.
    let token = getCachedToken();
    if (!token) {
      const { data: sessionData } = await supabase.auth.getSession();
      token = sessionData.session?.access_token ?? null;
      setCachedToken(token);
    }

    const headers: Record<string, string> = {
      ...((options.headers as object) || {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (!options.isMultipart) {
      headers["Content-Type"] = "application/json";
    }

    const method = (options.method ?? "GET").toUpperCase();
    const isIdempotent = method === "GET" || method === "HEAD";
    const maxRetries = isIdempotent ? MAX_RETRIES_FOR_IDEMPOTENT : 0;

    let response: Response | null = null;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        response = await singleAttempt(`${BASE_URL}${endpoint}`, {
          ...options,
          headers,
        });
        break;
      } catch (err: any) {
        lastError = err;
        // AbortError (timeout) e TypeError (network unreachable) são retryáveis.
        const retriable =
          err?.name === "AbortError" || err?.name === "TypeError";
        if (!retriable || attempt === maxRetries) {
          throw err;
        }
        // Backoff exponencial: 400ms, 1200ms.
        await sleep(400 * Math.pow(3, attempt));
      }
    }

    if (!response) {
      throw lastError ?? new Error("Sem resposta do servidor");
    }

    if (response.status === 401) {
      if (token) {
        await AsyncStorage.clear();
        await supabase.auth.signOut();
        setCachedToken(null);
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
    const isTimeout = error?.name === "AbortError";
    console.error(
      `[API FETCH ERROR] ${endpoint}:`,
      isTimeout ? "timeout" : error,
    );
    return {
      success: false,
      message: isTimeout
        ? "A conexão demorou demais. Tente novamente."
        : "Não foi possível conectar ao servidor. Verifique sua internet.",
    };
  }
}
