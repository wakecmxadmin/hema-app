-- ============================================================
-- Migration: Store confirmation flow (iFood-style) + stock reservation
-- Date: 2026-06-16
-- ============================================================
-- Separa estoque sincronizado pelo ERP (products.stock, sobrescrito pelo n8n)
-- da reserva temporária feita por pedidos abertos (products.reserved_quantity).
--
-- Disponível para venda = stock - reserved_quantity
--
-- Também adiciona campos em orders para suportar o fluxo de confirmação
-- da loja antes do pagamento (status novos vivem na camada de app: a coluna
-- já é varchar livre, sem check constraint).
-- ============================================================

-- ------------------------------------------------------------
-- 1. products.reserved_quantity
-- ------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS reserved_quantity numeric NOT NULL DEFAULT 0
    CHECK (reserved_quantity >= 0);

-- ------------------------------------------------------------
-- 2. Novos campos em orders
-- ------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS original_total_price numeric,
  ADD COLUMN IF NOT EXISTS was_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS payment_window_expires_at timestamptz;

-- Índice parcial para o cron de timeout achar rápido os candidatos
CREATE INDEX IF NOT EXISTS idx_orders_payment_window
  ON public.orders (payment_window_expires_at)
  WHERE payment_window_expires_at IS NOT NULL;

-- ------------------------------------------------------------
-- 3. RPC deduct_stock: reescrita para usar reserved_quantity
-- ------------------------------------------------------------
-- Mantém o lock FOR UPDATE para serializar pedidos concorrentes no mesmo
-- produto. Em vez de subtrair de products.stock, incrementa reserved_quantity.
-- A checagem de capacidade considera o que já está reservado.
CREATE OR REPLACE FUNCTION public.deduct_stock(items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  product_row RECORD;
  requested numeric;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    requested := (item->>'quantity')::numeric;

    SELECT * INTO product_row
    FROM public.products
    WHERE id = (item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', 'Produto desconhecido';
    END IF;

    IF (product_row.stock - product_row.reserved_quantity) < requested THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', product_row.name;
    END IF;

    UPDATE public.products
    SET reserved_quantity = reserved_quantity + requested
    WHERE id = (item->>'product_id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------
-- 4. RPC release_stock: cancelamento / rejeição / edição
-- ------------------------------------------------------------
-- Devolve quantidades reservadas. Clamp em zero para nunca ficar negativo
-- caso seja chamada duas vezes (idempotência defensiva).
CREATE OR REPLACE FUNCTION public.release_stock(items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  to_release numeric;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    to_release := (item->>'quantity')::numeric;

    UPDATE public.products
    SET reserved_quantity = GREATEST(0, reserved_quantity - to_release)
    WHERE id = (item->>'product_id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------
-- 5. RPC commit_stock: pedido virou shipped
-- ------------------------------------------------------------
-- Quando o item sai fisicamente da loja, a reserva deixa de existir.
-- O ERP refletirá a saída na próxima rodada do sync (que sobrescreve
-- products.stock). Até lá, contamos com a redução da reserva para evitar
-- double-counting.
CREATE OR REPLACE FUNCTION public.commit_stock(items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  to_commit numeric;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    to_commit := (item->>'quantity')::numeric;

    UPDATE public.products
    SET reserved_quantity = GREATEST(0, reserved_quantity - to_commit)
    WHERE id = (item->>'product_id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------
-- 6. get_home_catalog: filtrar por disponível, não estoque cru
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_home_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH ranked_products AS (
    SELECT
      p.id, p.name, p.price, p.price_per_kg, p.image_url, p.type,
      (p.stock - p.reserved_quantity) AS stock,
      p.category_id,
      ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.id) AS rn
    FROM public.products p
    WHERE p.is_active = true
      AND (p.stock - p.reserved_quantity) > 0
      AND p.image_url IS NOT NULL
      AND p.category_id IS NOT NULL
  ),
  top_categories AS (
    SELECT DISTINCT category_id
    FROM ranked_products
    ORDER BY category_id
    LIMIT 5
  ),
  cat_products AS (
    SELECT
      c.id,
      c.name,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', rp.id,
            'name', rp.name,
            'price', rp.price,
            'price_per_kg', rp.price_per_kg,
            'image_url', rp.image_url,
            'type', rp.type,
            'stock', rp.stock
          ) ORDER BY rp.rn
        ) FILTER (WHERE rp.id IS NOT NULL),
        '[]'::jsonb
      ) AS products
    FROM top_categories tc
    JOIN public.categories c ON c.id = tc.category_id
    LEFT JOIN ranked_products rp
      ON rp.category_id = c.id AND rp.rn <= 10
    GROUP BY c.id, c.name
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', cp.id,
        'name', cp.name,
        'products', cp.products
      )
    ),
    '[]'::jsonb
  )
  FROM cat_products cp;
$$;

-- ------------------------------------------------------------
-- 7. delete_stale_products: não remover produtos com reservas ativas
-- ------------------------------------------------------------
-- Se o ERP parar de mandar um produto que tem pedido aberto, manter o
-- registro para não orfanar a reserva. Quando a reserva zerar (envio ou
-- cancelamento), a próxima execução do sync remove naturalmente.
CREATE OR REPLACE FUNCTION public.delete_stale_products(run_ts timestamp with time zone)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM cart_items
  WHERE product_id IN (
    SELECT id FROM public.products
    WHERE updated_at < run_ts
      AND is_active = true
      AND reserved_quantity = 0
  );

  UPDATE order_items
  SET product_id = NULL
  WHERE product_id IN (
    SELECT id FROM public.products
    WHERE updated_at < run_ts
      AND is_active = true
      AND reserved_quantity = 0
  );

  DELETE FROM public.products
  WHERE updated_at < run_ts
    AND is_active = true
    AND reserved_quantity = 0;
END;
$$;
