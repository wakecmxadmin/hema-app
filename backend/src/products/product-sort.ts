/**
 * Critérios de ordenação aceitos nas listagens de produto.
 *
 * Fica num arquivo próprio porque a listagem de categoria (ProductsService) e a
 * busca (SearchService) precisam concordar sobre os mesmos valores — o
 * frontend manda a mesma string para as duas rotas.
 */
export const PRODUCT_SORTS = [
  'relevance',
  'name_asc',
  'price_asc',
  'price_desc',
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

/**
 * Converte o valor que chegou na query string num critério conhecido.
 *
 * Nunca lança: um `sort` desconhecido (link antigo, app desatualizado, alguém
 * brincando na URL) cai no padrão em vez de derrubar a listagem inteira. Isso
 * também mantém a coluna usada no ORDER BY vindo sempre de uma lista fixa, e
 * nunca de texto do cliente.
 */
export function parseProductSort(
  value: unknown,
  fallback: ProductSort,
): ProductSort {
  return PRODUCT_SORTS.includes(value as ProductSort)
    ? (value as ProductSort)
    : fallback;
}
