-- ============================================================
-- Migration: device_tokens — per-user uniqueness
-- Date: 2026-06-03
-- Description: O esquema antigo tinha UNIQUE(expo_push_token), o que fazia o
--   re-registro de um device por outro usuário (ex: cliente loga no mesmo
--   aparelho que o staff usou antes) sobrescrever o is_staff e quebrar o push
--   para a equipe. Movendo para UNIQUE(user_id, expo_push_token), múltiplos
--   usuários podem coexistir associados ao mesmo device; quem logar como staff
--   continua recebendo push mesmo que outro usuário tenha usado o aparelho.
-- ============================================================

ALTER TABLE public.device_tokens
  DROP CONSTRAINT IF EXISTS device_tokens_expo_push_token_key;

ALTER TABLE public.device_tokens
  ADD CONSTRAINT device_tokens_user_token_unique
  UNIQUE (user_id, expo_push_token);
