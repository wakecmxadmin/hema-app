export interface Product {
  id: string;
  name: string;
  description: string;
  type: "unit" | "weight";
  price: number;
  price_per_kg: number;
  image_url: string;
  similarity_score: number;
  stock: number;
}

export interface CategoryCatalog {
  id: string;
  name: string;
  products: Product[];
}
