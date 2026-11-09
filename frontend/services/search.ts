import { apiFetch, ApiResponse } from "./api";
import { Product } from "@/types/product";
import { ProductSort } from "@/types/sort";

export async function searchProducts(
  search_query: string,
  limit = 20,
  offset = 0,
  sort: ProductSort = "relevance",
): Promise<ApiResponse<Product[]>> {
  return apiFetch<Product[]>("/search/products", {
    method: "POST",
    body: JSON.stringify({
      search_query,
      limit,
      offset,
      sort,
    }),
  });
}
