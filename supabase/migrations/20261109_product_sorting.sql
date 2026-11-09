-- ============================================================
-- Migration: Ordenação de produtos por preço
-- Date: 2026-11-09
-- Description: Permite ordenar a listagem de categoria e os resultados de busca
--              por preço ("a creatina mais barata"), que antes só davam para
--              percorrer rolando a lista inteira — Suplementos sozinha tem ~596
--              produtos ativos em estoque.
--
--              `effective_price` existe porque o preço de um produto mora em
--              uma de duas colunas: `price` para os vendidos por unidade e
--              `price_per_kg` para os vendidos por peso (os dois são
--              mutuamente exclusivos — nenhum produto tem os dois ou nenhum).
--              Ordenar por `price` deixaria os 764 produtos por peso fora da
--              ordem, e ordenar pelas duas colunas em sequência separaria a
--              lista em dois blocos. A divisão por 10 converte R$/kg em
--              R$/100g, que é a unidade que o card mostra para esses produtos
--              (ProductCard.tsx), para a ordem bater com o preço que o cliente
--              lê na tela.
--
--              É GENERATED STORED, e não uma coluna comum mantida por trigger,
--              porque o cron do iFood faz upsert em `products` o dia todo: uma
--              coluna gerada nunca sai de sincronia com o preço e não exige que
--              o sync saiba da sua existência.
--
--              Os índices são parciais no mesmo predicado que a query da
--              listagem usa (is_active + stock > 0), então o ORDER BY sai do
--              índice em vez de ordenar a categoria inteira em memória.
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS effective_price numeric
  GENERATED ALWAYS AS (COALESCE(price, price_per_kg / 10)) STORED;

CREATE INDEX IF NOT EXISTS products_cat_price_idx
  ON public.products (category_id, effective_price)
  WHERE is_active = true AND stock > 0;

CREATE INDEX IF NOT EXISTS products_cat_name_idx
  ON public.products (category_id, name)
  WHERE is_active = true AND stock > 0;

-- ------------------------------------------------------------
-- search_products ganha `sort_by`.
--
-- A assinatura antiga é derrubada em vez de sobrecarregada: um parâmetro novo
-- com DEFAULT criaria uma segunda função de 3 argumentos e a chamada do backend
-- com (search_query, limit_count, offset_count) ficaria ambígua no PostgREST.
--
-- O default continua 'relevance' — na busca, ordenar por preço por padrão
-- jogaria fora o score que faz o termo digitado encontrar o produto certo.
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.search_products(text, integer, integer);

CREATE OR REPLACE FUNCTION public.search_products(
  search_query text,
  limit_count integer DEFAULT 20,
  offset_count integer DEFAULT 0,
  sort_by text DEFAULT 'relevance'
)
RETURNS TABLE(
  id uuid,
  name text,
  price numeric,
  price_per_kg numeric,
  image_url text,
  similarity_score double precision
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH
    normalized AS (
      SELECT unaccent(lower(search_query)) AS q
    ),
    products_base AS (
      SELECT
        p.id,
        p.name,
        p.price,
        p.price_per_kg,
        p.effective_price,
        p.image_url,
        unaccent(lower(p.name)) AS name_normalized
      FROM products p
      WHERE p.is_active = true
    ),
    scored AS (
      SELECT
        p.id,
        p.name,
        p.price,
        p.price_per_kg,
        p.effective_price,
        p.image_url,
        (
          CASE WHEN p.name_normalized LIKE (n.q || '%') THEN 1.2 ELSE 0 END
          + CASE WHEN p.name_normalized LIKE ('%' || n.q || '%') THEN 0.6 ELSE 0 END
          + greatest(
              similarity(p.name_normalized, n.q),
              word_similarity(p.name_normalized, n.q)
            )
          + CASE
              WHEN to_tsvector('portuguese', p.name) @@ plainto_tsquery('portuguese', search_query)
              THEN 0.8 ELSE 0
            END
          + CASE
              WHEN p.image_url IS NOT NULL AND p.image_url <> ''
              THEN 0.3 ELSE 0
            END
        )::double precision AS similarity_score
      FROM products_base p
      CROSS JOIN normalized n
    ),
    -- Ordenar por preço sem perder o filtro de relevância: quem não tem nada a
    -- ver com o termo buscado não deve aparecer só por ser barato. O corte usa
    -- o mesmo 0.3 que a home já trata como "não encontramos" (home.tsx).
    filtered AS (
      SELECT *
      FROM scored
      WHERE sort_by = 'relevance' OR scored.similarity_score >= 0.3
    )
  SELECT
    filtered.id,
    filtered.name::text,
    filtered.price,
    filtered.price_per_kg,
    filtered.image_url::text,
    filtered.similarity_score
  FROM filtered
  ORDER BY
    CASE WHEN sort_by = 'price_asc'  THEN filtered.effective_price END ASC  NULLS LAST,
    CASE WHEN sort_by = 'price_desc' THEN filtered.effective_price END DESC NULLS LAST,
    CASE WHEN sort_by = 'relevance'  THEN filtered.similarity_score END DESC,
    filtered.name ASC,
    -- Desempate final estável: sem ele, itens de mesmo preço/score podem trocar
    -- de lugar entre uma página e a seguinte e o "Mostrar mais" repete produto.
    filtered.id ASC
  LIMIT limit_count
  OFFSET offset_count;
END;
$function$;
