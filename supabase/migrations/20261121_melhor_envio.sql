-- ============================================================
-- Migration: Integração Melhor Envio
-- Date: 2026-11-21
-- Description: Entregas fora de Curitiba e região metropolitana (onde o
--              motoboy da LogManager não chega) passam a ir pelo Melhor
--              Envio (Correios/Jadlog). O pedido guarda qual serviço o
--              cliente escolheu no checkout e, depois, a etiqueta comprada.
--
--              `shipping_provider` separa os dois fluxos:
--                'local'        → motoboy (LogManager), como sempre foi
--                'melhor_envio' → etiqueta Melhor Envio
--
--              Os tokens OAuth do Melhor Envio renovam sozinhos (30 dias o
--              access, 45 o refresh), por isso ficam no banco e não no .env.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_provider text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS me_service_id integer,
  ADD COLUMN IF NOT EXISTS me_quote jsonb,          -- opção escolhida no checkout (preço, prazo, caixa)
  ADD COLUMN IF NOT EXISTS me_order_id text,        -- uuid da etiqueta no Melhor Envio
  ADD COLUMN IF NOT EXISTS me_tracking_code text,
  ADD COLUMN IF NOT EXISTS me_tracking_url text,
  ADD COLUMN IF NOT EXISTS me_label_url text,
  ADD COLUMN IF NOT EXISTS nfe_key text;            -- chave da NF-e (envio comercial)

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_shipping_provider_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_shipping_provider_check
  CHECK (shipping_provider IN ('local', 'melhor_envio'));

CREATE UNIQUE INDEX IF NOT EXISTS orders_me_order_id_key
  ON orders (me_order_id) WHERE me_order_id IS NOT NULL;

-- Linha única com os tokens da conta Melhor Envio da loja.
CREATE TABLE IF NOT EXISTS melhor_envio_auth (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  oauth_state text,           -- anti-CSRF do callback OAuth
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Só o backend (service role) lê/escreve. Sem policies = nenhum acesso via
-- anon/authenticated.
ALTER TABLE melhor_envio_auth ENABLE ROW LEVEL SECURITY;
