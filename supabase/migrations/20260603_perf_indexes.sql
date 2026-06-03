-- ============================================================
-- Migration: Performance indexes
-- Date: 2026-06-03
-- Description: Adds indexes for hot paths identified in perf audit.
--              - products: catalog filters (is_active + stock > 0) por categoria
--              - order_items.order_id: ausente, usado em todos os embeds
--              - orders: filtros admin por status com ordenação por data
-- ============================================================

-- Catálogo público: SELECT ... WHERE is_active=true AND stock>0 (com ou sem category_id).
-- Partial index reduz tamanho e dá lookup direto para o caso comum.
CREATE INDEX IF NOT EXISTS products_active_in_stock_idx
  ON public.products (category_id)
  WHERE is_active = true AND stock > 0;

-- FK ausente: orders → order_items é o embed mais comum em todas as queries.
CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON public.order_items (order_id);

-- Admin list filtra por status (in (...)) ordenado por created_at DESC.
CREATE INDEX IF NOT EXISTS orders_status_created_at_idx
  ON public.orders (status, created_at DESC);

-- "Meus pedidos" do cliente: WHERE user_id=? ORDER BY created_at DESC.
-- Já existe idx_orders_user (user_id apenas); o composto ajuda na ordenação.
CREATE INDEX IF NOT EXISTS orders_user_created_at_idx
  ON public.orders (user_id, created_at DESC);
