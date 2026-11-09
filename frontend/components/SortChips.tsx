import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ProductSort, SortOption } from "@/types/sort";

interface SortChipsProps {
  options: SortOption[];
  value: ProductSort;
  onChange: (value: ProductSort) => void;
  /** Desabilita os chips enquanto a lista está recarregando. */
  disabled?: boolean;
}

/**
 * Barra de ordenação usada na listagem de categoria e nos resultados de busca.
 *
 * Fica num componente só para as duas telas não divergirem — o cliente que
 * aprendeu a achar "Menor preço" na categoria encontra o mesmo controle,
 * no mesmo lugar, na busca.
 */
function SortChipsImpl({
  options,
  value,
  onChange,
  disabled = false,
}: SortChipsProps) {
  const handlePress = useCallback(
    (next: ProductSort) => {
      // Tocar no chip já ativo não deve disparar um refetch da lista inteira.
      if (next === value) return;
      Haptics.selectionAsync();
      onChange(next);
    },
    [onChange, value],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        gap: 8,
        alignItems: "center",
      }}
      style={{ flexGrow: 0, paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}
    >
      <Ionicons name="swap-vertical" size={16} color="#8A8178" />

      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive, disabled }}
            accessibilityLabel={`Ordenar por ${option.label}`}
            activeOpacity={0.72}
            disabled={disabled}
            onPress={() => handlePress(option.value)}
            style={{
              backgroundColor: isActive ? "#1A1613" : "#FFFFFF",
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingVertical: 9,
              borderWidth: isActive ? 0 : 1,
              borderColor: "#EAE3D7",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: isActive ? "#FFFFFF" : "#1A1613",
              }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export const SortChips = React.memo(SortChipsImpl);
