import { apiFetch, ApiResponse } from "./api";
import { Product, CategoryCatalog } from "../types/product";
import { ProductSort } from "../types/sort";

export async function getHomeCatalog(): Promise<
  ApiResponse<CategoryCatalog[]>
> {
  return apiFetch<CategoryCatalog[]>("/products/home", { method: "GET" });
}

export async function getProductById(
  id: string,
): Promise<ApiResponse<Product>> {
  return apiFetch<Product>(`/products/${id}`, { method: "GET" });
}

export async function getProductsByCategory(
  category: string,
  limit = 30,
  offset = 0,
  sort: ProductSort = "name_asc",
): Promise<ApiResponse<Product[]>> {
  return apiFetch<Product[]>(
    `/products/category/${category}?limit=${limit}&offset=${offset}&sort=${sort}`,
    { method: "GET" },
  );
}

export async function getSimilarProducts(
  id: string,
): Promise<ApiResponse<Product[]>> {
  return apiFetch<Product[]>(`/products/${id}/similar`, { method: "GET" });
}
