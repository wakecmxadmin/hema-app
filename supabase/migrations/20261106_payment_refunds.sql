-- ============================================================
-- Migration: Mercado Pago refunds
-- Date: 2026-11-06
-- Description: Permite estornar um pedido pago direto pelo admin, sem abrir o
--              painel do Mercado Pago.
--
--              `mp_payment_id` é o id do pagamento no MP. Ele já chegava no
--              webhook e era descartado — sem ele, estornar exige buscar o
--              pagamento por `external_reference` na API do MP a cada vez.
--              Fica nullable porque pedidos em dinheiro nunca têm pagamento no
--              MP, e pedidos antigos só ganham o valor no primeiro estorno
--              (backfill sob demanda via Payment.search).
--
--              `refund_status` é o guarda contra estorno duplicado: a API do MP
--              aceita vários refunds parciais no mesmo pagamento, então sem um
--              estado local um clique repetido no admin devolveria o dinheiro
--              duas vezes. Separado de `payment_status` de propósito —
--              `payment_status` é o que o MP diz sobre a cobrança, este é o que
--              NÓS fizemos sobre ela.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS refund_amount numeric,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_error text;

-- Lookup pelo id do MP (webhook de refund/chargeback chega com o payment id,
-- não com o nosso order id).
CREATE INDEX IF NOT EXISTS orders_mp_payment_id_idx
  ON orders(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

-- Vocabulário fechado pra não acumular grafia solta ao longo do tempo.
-- NULL = nunca houve tentativa de estorno (estado da esmagadora maioria).
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_refund_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_refund_status_check
  CHECK (refund_status IS NULL OR refund_status IN (
    'pending',    -- chamada ao MP em andamento
    'refunded',   -- estorno total confirmado pelo MP
    'partial',    -- estorno parcial confirmado pelo MP
    'failed',     -- MP recusou (sem saldo, prazo expirado, etc.)
    'charged_back' -- cliente abriu contestação; dinheiro retido pelo MP
  ));
