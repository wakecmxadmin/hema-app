-- ============================================================
-- Migration: RPC get_home_catalog
-- Date: 2026-06-03
-- Description: Substitui 6 queries sequenciais por uma única função que
--              retorna até 5 categorias com seus 10 primeiros produtos
--              (ativos, em estoque, com imagem). Reduz RTT de ~6 para 1.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_home_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH ranked_products AS (
    SELECT
      p.id, p.name, p.price, p.price_per_kg, p.image_url, p.type, p.stock,
      p.category_id,
      ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.id) AS rn
    FROM public.products p
    WHERE p.is_active = true
      AND p.stock > 0
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
