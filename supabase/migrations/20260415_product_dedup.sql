-- ============================================================
-- Migration: Product Deduplication
-- Date: 2026-04-15
-- Description: Adds `codigo` column (barcode/SKU from PDV) with
--              UNIQUE constraint to prevent duplicate products.
--              PostgREST's `resolution=merge-duplicates` will then
--              resolve conflicts on both PK (id) and UNIQUE (codigo).
-- ============================================================

-- IMPORTANTE: Antes de rodar esta migration, execute os scripts
-- de limpeza abaixo manualmente no Supabase SQL Editor.

-- ============================================================
-- PASSO 1: Identificar duplicatas (rodar primeiro para inspecionar)
-- ============================================================
-- SELECT name, array_agg(id) as ids, array_agg(is_active) as statuses, count(*)
-- FROM products
-- GROUP BY name
-- HAVING count(*) > 1;

-- ============================================================
-- PASSO 2: Limpar duplicatas que NÃO são referenciadas em pedidos/carrinhos
-- (deleta o registro mais antigo, mantém o mais recente)
-- ============================================================
-- DELETE FROM products a
-- USING products b
-- WHERE a.name = b.name
--   AND a.id <> b.id
--   AND a.created_at < b.created_at
--   AND NOT EXISTS (
--     SELECT 1 FROM order_items oi WHERE oi.product_id = a.id
--   )
--   AND NOT EXISTS (
--     SELECT 1 FROM cart_items ci WHERE ci.product_id = a.id
--   );

-- ============================================================
-- PASSO 3: Desativar duplicatas que SÃO referenciadas (não pode deletar)
-- ============================================================
-- UPDATE products a
-- SET is_active = false
-- FROM products b
-- WHERE a.name = b.name
--   AND a.id <> b.id
--   AND a.created_at < b.created_at
--   AND a.is_active = true;

-- ============================================================
-- PASSO 4: Aplicar migration (rodar APÓS a limpeza)
-- ============================================================

-- 1. Adicionar coluna codigo (código de barras / SKU do PDV)
ALTER TABLE products ADD COLUMN IF NOT EXISTS codigo BIGINT;

-- 2. Constraint UNIQUE — permite NULL (produtos sem código ainda não conflitam)
ALTER TABLE products ADD CONSTRAINT products_codigo_unique UNIQUE (codigo);
