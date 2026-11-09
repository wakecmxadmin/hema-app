/**
 * Critérios de ordenação das listagens de produto.
 *
 * Os valores são os mesmos strings que o backend aceita (`product-sort.ts`),
 * porque vão crus na query string de /products/category e no corpo de
 * /search/products.
 */
export type ProductSort = "relevance" | "name_asc" | "price_asc" | "price_desc";

export interface SortOption {
  value: ProductSort;
  label: string;
}

/** Ordem dos chips na tela de categoria. O padrão é o primeiro. */
export const CATEGORY_SORTS: SortOption[] = [
  { value: "name_asc", label: "A-Z" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
];

/**
 * Ordem dos chips na busca. Começa em relevância porque ordenar por preço um
 * resultado de busca sem considerar o termo digitado devolve qualquer coisa
 * barata, e não o que a pessoa procurou.
 */
export const SEARCH_SORTS: SortOption[] = [
  { value: "relevance", label: "Relevância" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
];
