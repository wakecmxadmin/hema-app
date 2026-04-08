import React from "react";
import { View } from "react-native";
import { PulseView } from "./PulseView"; // Nosso motor de animação

export function CartItemSkeleton() {
  return (
    <View className="mb-[15px]">
      <View className="mb-0 flex-row items-center border border-neutral-200 rounded-card bg-surface p-[14px]">
        {/* Imagem Quadrada */}
        <PulseView className="h-[76px] w-[76px] overflow-hidden rounded-btn items-center justify-center bg-neutral-100" />

        <View className="ml-[14px] flex-1 h-[76px] justify-between">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-[10px]">
              {/* Nome do Produto */}
              <PulseView
                style={{
                  height: 16,
                  width: "80%",
                  borderRadius: 4,
                  marginBottom: 8,
                }}
              />
              {/* Preço Unitário */}
              <PulseView
                style={{ height: 12, width: "40%", borderRadius: 4 }}
              />
            </View>
            {/* Preço Total da Linha */}
            <PulseView style={{ height: 18, width: 60, borderRadius: 4 }} />
          </View>

          <View className="flex-row items-center justify-between mt-[15px]">
            {/* Controles de Quantidade */}
            <View className="flex-row items-center gap-[10px]">
              <PulseView style={{ height: 28, width: 28, borderRadius: 14 }} />
              <PulseView style={{ height: 16, width: 20, borderRadius: 4 }} />
              <PulseView style={{ height: 28, width: 28, borderRadius: 14 }} />
            </View>

            {/* Botão Remover */}
            <PulseView style={{ height: 16, width: 60, borderRadius: 4 }} />
          </View>
        </View>
      </View>
    </View>
  );
}
