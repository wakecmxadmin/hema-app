import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import * as cartService from "@/services/cart";
import {
  addGuestItem,
  clearGuestCart,
  getGuestCart,
  removeGuestItem,
  updateGuestItem,
} from "@/services/guest-cart";
import { supabase } from "@/services/supabase";
import { setCachedToken } from "@/services/session-cache";
import { Product } from "@/types/product";
import { Toast } from "@/util/toast";

type Cart = any;
type CartItem = any;

type AddCartItemDTO = {
  product_id: string;
  quantity?: number;
  weight?: number;
  price: number;
};

type CartContextType = {
  cart: Cart | null;
  items: CartItem[];
  loading: boolean;
  cartCount: number;
  isAuthenticated: boolean;
  user: any | null;
  isStaff: boolean;
  refreshCart: () => Promise<void>;
  /** `product` é obrigatório enquanto o visitante não tem conta: o carrinho
   *  local guarda um snapshot para conseguir renderizar sem o backend. */
  addItem: (data: AddCartItemDTO, product?: Product) => Promise<boolean>;
  updateItem: (
    id: string,
    data: { quantity?: number; weight?: number },
  ) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  /** Sobe o carrinho local para o backend. Idempotente: chamadas simultâneas
   *  compartilham a mesma execução. */
  mergeGuestCart: () => Promise<void>;
};

const STAFF_EMAIL_DOMAINS = (
  process.env.EXPO_PUBLIC_STAFF_EMAIL_DOMAIN ?? "hemacereais.com.br,pinho.com.br,wakecomex.com"
)
  .split(",")
  .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

function deriveIsStaff(user: any | null | undefined): boolean {
  if (!user) return false;
  const email = (user.email ?? "").toLowerCase();
  const confirmed = !!user.email_confirmed_at;
  if (!confirmed) return false;
  return STAFF_EMAIL_DOMAINS.some((d) => email.endsWith(`@${d}`));
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  const isAuthenticated = !!session;
  const user = session?.user ?? null;
  const isStaff = deriveIsStaff(user);

  // Mantém o valor atual acessível dentro de callbacks que não devem ser
  // recriados a cada login/logout (o listener do Supabase, por exemplo).
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setCachedToken(s?.access_token ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
      setCachedToken(s?.access_token ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const cartCount = items.length;

  // REFRESH: Apenas sincroniza a tela com o backend silenciosamente
  const refreshCart = useCallback(async () => {
    if (!session) {
      // Visitante: a fonte de verdade é o armazenamento do aparelho
      setCart(null);
      setItems(await getGuestCart());
      setLoading(false);
      return;
    }

    setLoading(true);
    const response = await cartService.getCartService();

    if (response.success && response.data) {
      setCart(response.data.cart || {});
      setItems(response.data.items || []);
    }
    setLoading(false);
  }, [session]);

  // MERGE: sobe o carrinho do visitante assim que ele entra na conta
  const mergingRef = useRef<Promise<void> | null>(null);

  const mergeGuestCart = useCallback(async () => {
    if (mergingRef.current) return mergingRef.current;

    const run = async () => {
      const guestItems = await getGuestCart();
      if (guestItems.length === 0) return;

      const rejected: string[] = [];

      for (const item of guestItems) {
        const response = await cartService.addCartItemService({
          product_id: item.product_id,
          quantity: item.quantity,
          weight: item.weight,
          price: item.price,
        } as any);

        if (!response.success) {
          rejected.push(item.product?.name ?? "Produto");
        }
      }

      await clearGuestCart();

      if (rejected.length > 0) {
        Toast.show({
          type: "error",
          text1: "Alguns itens não puderam ser adicionados",
          text2: rejected.join(", "),
        });
      }
    };

    mergingRef.current = run().finally(() => {
      mergingRef.current = null;
    });

    return mergingRef.current;
  }, []);

  // ADD: Optimistic UI com tratamento de erro padronizado
  const addItem = useCallback(
    async (data: AddCartItemDTO, product?: Product) => {
      if (!isAuthenticated) {
        if (!product) {
          Toast.show({
            type: "error",
            text1: "Não foi possível adicionar ao carrinho",
          });
          return false;
        }
        setItems(await addGuestItem(data, product));
        return true;
      }

      const previousItems = [...items];

      // Optimistic Update: Adiciona um fake temporário
      const tempItem = {
        id: `temp-${Date.now()}`,
        product_id: data.product_id,
        quantity: data.quantity || 0,
        weight: data.weight || 0,
        product: product ?? {},
      };

      setItems((prev) => [...prev, tempItem]);

      const response = await cartService.addCartItemService(data);

      if (response.success) {
        await refreshCart(); // Puxa os IDs reais do banco
        return true;
      } else {
        // Rollback: Reverte para a lista anterior se deu erro
        setItems(previousItems);
        Toast.show({ type: "error", text1: response.message }); // "O peso é obrigatório"
        return false;
      }
    },
    [isAuthenticated, items, refreshCart],
  );

  // UPDATE: Optimistic UI com tratamento de erro padronizado
  const updateItem = useCallback(
    async (id: string, data: { quantity?: number; weight?: number }) => {
      if (!isAuthenticated) {
        setItems(await updateGuestItem(id, data));
        return;
      }

      const previousItems = [...items];
      const previousCart = cart;

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === id ? { ...item, ...data } : item,
        ),
      );

      const response = await cartService.updateCartItemService(id, data);

      if (response.success) {
        await refreshCart();
      } else {
        // Rollback
        setItems(previousItems);
        setCart(previousCart);
        Toast.show({ type: "error", text1: response.message });
      }
    },
    [isAuthenticated, items, cart, refreshCart],
  );

  // REMOVE: Optimistic UI com tratamento de erro padronizado
  const removeItem = useCallback(
    async (id: string) => {
      if (!isAuthenticated) {
        setItems(await removeGuestItem(id));
        return;
      }

      const previousItems = [...items];
      const previousCart = cart;

      setItems((currentItems) => currentItems.filter((item) => item.id !== id));

      const response = await cartService.removeCartItemService(id);

      if (response.success) {
        await refreshCart();
      } else {
        setItems(previousItems);
        setCart(previousCart);
        Toast.show({ type: "error", text1: response.message });
      }
    },
    [isAuthenticated, items, cart, refreshCart],
  );

  // Login feito por qualquer caminho do app leva o carrinho local junto
  const previousAuthRef = useRef<boolean | null>(null);

  useEffect(() => {
    const wasAuthenticated = previousAuthRef.current;
    previousAuthRef.current = isAuthenticated;

    if (wasAuthenticated === false && isAuthenticated) {
      mergeGuestCart().then(refreshCart);
    }
  }, [isAuthenticated, mergeGuestCart, refreshCart]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const value = useMemo(
    () => ({
      cart,
      items,
      loading,
      cartCount,
      isAuthenticated,
      user,
      isStaff,
      refreshCart,
      addItem,
      updateItem,
      removeItem,
      mergeGuestCart,
    }),
    [
      cart,
      items,
      loading,
      cartCount,
      isAuthenticated,
      user,
      isStaff,
      refreshCart,
      addItem,
      updateItem,
      removeItem,
      mergeGuestCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart deve ser usado dentro de CartProvider");
  }
  return context;
}
