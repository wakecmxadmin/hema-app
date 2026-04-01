import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Product } from "@/types/product";
import { Image } from "expo-image";

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onAdd: () => void;
  isCarousel?: boolean;
}

const formatName = (name: string) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export function ProductCard({
  product,
  onPress,
  onAdd,
  isCarousel = false,
}: ProductCardProps) {
  const isKg =
    product.price_per_kg !== null && product.price_per_kg !== undefined;

  // AJUSTE AQUI: Se for KG, divide por 10 para mostrar o preço de 100g
  const displayPrice = isKg ? (product.price_per_kg || 0) / 10 : product.price;

  // AJUSTE AQUI: Muda o sufixo de /kg para /100g
  const unitLabel = isKg ? " /100g" : " /un";

  const formattedPrice = displayPrice
    ? displayPrice.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })
    : "R$ 0,00";

  return (
    <TouchableOpacity
      className={`bg-[#FFFFFF] flex-1 overflow-hidden rounded-[12px] border border-[#EAEAEA] shadow-[0_4px_8px_rgba(0,0,0,0.06)] ${isCarousel ? "w-[180px] mb-0" : ""}`}
      style={{ elevation: 2 }}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {/* ... (resto do componente igual) ... */}
      <View className="h-[150px] w-full items-center justify-center border-b border-[#F0F0F0] bg-[#fff] p-[10px]">
        {product.image_url ? (
          <Image
            source={{ uri: product.image_url }}
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#F0F0F0",
            }}
            contentFit="cover"
            transition={500}
            cachePolicy="disk"
          />
        ) : (
          <View className="h-full w-full items-center justify-center bg-[#F5F5F5]">
            <MaterialCommunityIcons
              name="image-off-outline"
              size={32}
              color="#CCC"
            />
          </View>
        )}
      </View>

      <View className="flex-1 justify-between p-[12px] pb-[8px]">
        <View>
          <Text
            className="mb-[6px] min-h-[36px] text-[13px] leading-[18px] font-[600] text-[#222222]"
            numberOfLines={2}
          >
            {formatName(product.name)}
          </Text>
          <Text className="mb-[10px] text-[16px] font-[800] text-[#E31837]">
            {formattedPrice}
            <Text className="text-[11px] font-[600] text-[#888]">
              {unitLabel}
            </Text>
          </Text>
        </View>

        <TouchableOpacity
          className="mb-[4px] items-center justify-center rounded-[8px] bg-[#E31837] px-[10px] py-[10px]"
          onPress={onAdd}
        >
          <Text className="text-[13px] font-[800] uppercase text-[#ffffff]">
            Adicionar
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}
