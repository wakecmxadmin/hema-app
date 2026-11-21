-- ============================================================
-- Migration: Guardar a resposta completa do LogManager
-- Date: 2026-11-13
-- Description: Até aqui só gravávamos se a criação do envio deu certo
--              (`logmanager_envio_id`) ou o erro (`shipping_last_error`).
--              O corpo da resposta de sucesso era descartado, então quando
--              um envio aceito pela API não aparecia no painel (pedido
--              9043B092) não havia como saber o que o LogManager devolveu.
--              Guarda { status, body, at } da última chamada, sucesso ou falha.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_last_response jsonb;
