import AsyncStorage from "@react-native-async-storage/async-storage";

import { Product } from "@/types/product";

const STORAGE_KEY = "@hema_guest_cart";

/**
 * Snapshot do produto gravado junto com o item. O carrinho do convidado não
 * consulta o backend, então a tela precisa destes campos para renderizar e
 * para limitar a quantidade ao estoque conhecido no momento da adição.
 */
export type GuestCartProduct = Pick<
  Product,
  "id" | "name" | "type" | "price" | "price_per_kg" | "image_url" | "stock"
>;

export type GuestCartItem = {
  id: string;
  product_id: string;
  quantity?: number;
  weight?: number;
  price: number;
  product: GuestCartProduct;
};

export type GuestCartItemInput = {
  product_id: string;
  quantity?: number;
  weight?: number;
  price: number;
};

function snapshot(product: Product): GuestCartProduct {
  return {
    id: product.id,
    name: product.name,
    type: product.type,
    price: product.price,
    price_per_kg: product.price_per_kg,
    image_url: product.image_url,
    stock: product.stock,
  };
}

function newLocalId(): string {
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getGuestCart(): Promise<GuestCartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persist(items: GuestCartItem[]): Promise<GuestCartItem[]> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error("Erro ao salvar o carrinho local", error);
  }
  return items;
}

/** Soma na linha existente quando o mesmo produto já está no carrinho. */
export async function addGuestItem(
  data: GuestCartItemInput,
  product: Product,
): Promise<GuestCartItem[]> {
  const items = await getGuestCart();
  const existing = items.find((item) => item.product_id === data.product_id);

  if (existing) {
    if (data.quantity) {
      existing.quantity = (existing.quantity || 0) + data.quantity;
    }
    if (data.weight) {
      existing.weight = (existing.weight || 0) + data.weight;
    }
    existing.price = data.price;
    existing.product = snapshot(product);
    return persist([...items]);
  }

  return persist([
    ...items,
    {
      id: newLocalId(),
      product_id: data.product_id,
      quantity: data.quantity,
      weight: data.weight,
      price: data.price,
      product: snapshot(product),
    },
  ]);
}

export async function updateGuestItem(
  id: string,
  data: { quantity?: number; weight?: number },
): Promise<GuestCartItem[]> {
  const items = await getGuestCart();
  return persist(
    items.map((item) => (item.id === id ? { ...item, ...data } : item)),
  );
}

export async function removeGuestItem(id: string): Promise<GuestCartItem[]> {
  const items = await getGuestCart();
  return persist(items.filter((item) => item.id !== id));
}

export async function clearGuestCart(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Erro ao limpar o carrinho local", error);
  }
}
