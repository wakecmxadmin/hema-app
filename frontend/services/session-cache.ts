/**
 * Cache em memória do access_token da sessão atual. O CartContext (única fonte
 * de verdade de auth no app) atualiza este cache no mesmo listener que ele já
 * mantém, e o `apiFetch` lê de forma síncrona — evitando `supabase.auth.getSession()`
 * await em cada request.
 */
let cachedToken: string | null = null;

export function setCachedToken(token: string | null): void {
  cachedToken = token;
}

export function getCachedToken(): string | null {
  return cachedToken;
}
