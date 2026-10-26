import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  getQuantityOptions,
  QuantityPickerSheet,
  QuantitySelection,
} from "@/components/QuantityPickerSheet";
import { useCart } from "@/context/CartContext";
import { Product } from "@/types/product";
import { Toast } from "@/util/toast";

type QuantityPickerContextType = {
  /** Abre a roda de seleção; o item só entra no carrinho após a confirmação. */
  openQuantityPicker: (product: Product) => void;
};

const QuantityPickerContext = createContext<QuantityPickerContextType | null>(
  null,
);

export function QuantityPickerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { addItem } = useCart();
  // `product` segue montado depois de fechar para o sheet sair com animação.
  const [product, setProduct] = useState<Product | null>(null);
  const [visible, setVisible] = useState(false);

  const openQuantityPicker = useCallback((next: Product) => {
    if (!next) return;
    // Sem opções na roda = estoque zerado ou abaixo do mínimo de 100g
    if (getQuantityOptions(next).length === 0) {
      Toast.show({
        type: "error",
        text1:
          (next.stock ?? 0) <= 0
            ? "Produto sem estoque disponível"
            : "Estoque insuficiente para este produto",
      });
      return;
    }
    setProduct(next);
    setVisible(true);
  }, []);

  const handleClose = useCallback(() => setVisible(false), []);

  const handleConfirm = useCallback(
    async (selected: Product, selection: QuantitySelection) => {
      setVisible(false);

      const success = await addItem(
        {
          product_id: selected.id,
          price:
            selected.type === "unit" ? selected.price : selected.price_per_kg,
          ...selection,
        },
        selected,
      );

      if (success) {
        Toast.show({ type: "success", text1: "Adicionado ao carrinho!" });
      }
      // Erros já são exibidos pelo CartContext com a mensagem do backend
    },
    [addItem],
  );

  const value = useMemo(() => ({ openQuantityPicker }), [openQuantityPicker]);

  return (
    <QuantityPickerContext.Provider value={value}>
      {children}
      <QuantityPickerSheet
        product={product}
        visible={visible}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    </QuantityPickerContext.Provider>
  );
}

export function useQuantityPicker() {
  const context = useContext(QuantityPickerContext);
  if (!context) {
    throw new Error(
      "useQuantityPicker deve ser usado dentro de QuantityPickerProvider",
    );
  }
  return context;
}
