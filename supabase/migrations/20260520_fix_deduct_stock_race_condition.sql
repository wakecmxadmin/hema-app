-- Fix: deduct_stock com SELECT FOR UPDATE para evitar race condition
-- Sem o lock, dois pedidos simultâneos podiam passar pelo UPDATE (affected=1 cada)
-- e depois a constraint stock_non_negative disparava com mensagem genérica,
-- causando o fallback "um produto" no frontend.
CREATE OR REPLACE FUNCTION deduct_stock(items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  product_row RECORD;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    -- Lock garante serialização: nenhum outro pedido pode ler/alterar esta linha
    -- enquanto a transação não terminar
    SELECT * INTO product_row
    FROM products
    WHERE id = (item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', 'Produto desconhecido';
    END IF;

    IF product_row.stock < (item->>'quantity')::numeric THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', product_row.name;
    END IF;

    UPDATE products
    SET stock = stock - (item->>'quantity')::numeric
    WHERE id = (item->>'product_id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;
