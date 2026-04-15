-- ============================================================
-- Migration: Stock Control System
-- Date: 2026-04-15
-- Description: Adds stock constraint, deduct_stock and restore_stock RPC functions,
--              and updates search_products to filter by stock > 0.
-- ============================================================

-- 1. Constraint: stock nunca pode ser negativo
ALTER TABLE products
  ADD CONSTRAINT stock_non_negative CHECK (stock >= 0);

-- 2. RPC: Dedução atômica de estoque ao confirmar pedido
-- Recebe um array JSON de { product_id, quantity }
-- quantity = unidades (para type=unit) ou KG (para type=weight)
-- Retorna { success: true } ou { success: false, failed_product: "nome" }
CREATE OR REPLACE FUNCTION deduct_stock(items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  product_row RECORD;
  affected int;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    -- Tenta deduzir apenas se houver estoque suficiente
    UPDATE products
    SET stock = stock - (item->>'quantity')::numeric
    WHERE id = (item->>'product_id')::uuid
      AND stock >= (item->>'quantity')::numeric;

    GET DIAGNOSTICS affected = ROW_COUNT;

    IF affected = 0 THEN
      -- Busca o nome do produto para a mensagem de erro
      SELECT name INTO product_row
      FROM products
      WHERE id = (item->>'product_id')::uuid;

      -- Rollback implícito: a transação inteira falha
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', COALESCE(product_row.name, 'Produto desconhecido');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. RPC: Restauração de estoque ao cancelar pedido
CREATE OR REPLACE FUNCTION restore_stock(items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    UPDATE products
    SET stock = stock + (item->>'quantity')::numeric
    WHERE id = (item->>'product_id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Atualizar a function search_products para filtrar stock > 0
-- (Substitua esta seção se a sua function search_products tiver uma implementação diferente)
CREATE OR REPLACE FUNCTION search_products(
  search_query text,
  limit_count int DEFAULT 20,
  offset_count int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  type text,
  price numeric,
  price_per_kg numeric,
  image_url text,
  stock numeric,
  similarity_score real
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.type,
    p.price,
    p.price_per_kg,
    p.image_url,
    p.stock,
    similarity(p.name, search_query) AS similarity_score
  FROM products p
  WHERE p.is_active = true
    AND p.stock > 0
    AND (
      p.name ILIKE '%' || search_query || '%'
      OR similarity(p.name, search_query) > 0.1
    )
  ORDER BY similarity_score DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$;
