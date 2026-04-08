import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Animated, Dimensions } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onAdd: () => void;
  isCarousel?: boolean;
  isFeatured?: boolean;
  animationDelay?: number;
}

const SCREEN_WIDTH = Dimensions.get("window").width;

const formatName = (name: string) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function useEntryAnimation(delay: number) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 340,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 340,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return { opacity: fadeAnim, transform: [{ translateY: slideAnim }] };
}

export function ProductCard({
  product,
  onPress,
  onAdd,
  isCarousel = false,
  isFeatured = false,
  animationDelay = 0,
}: ProductCardProps) {
  const animStyle = useEntryAnimation(animationDelay);

  const isKg =
    product.price_per_kg !== null && product.price_per_kg !== undefined;
  const displayPrice = isKg ? (product.price_per_kg || 0) / 10 : product.price;
  const unitLabel = isKg ? "/100g" : "/un";
  const formattedPrice = displayPrice ? formatPrice(displayPrice) : "R$ 0,00";

  // ── FEATURED card (landscape, for horizontal scroll) ──────────────────────
  if (isFeatured) {
    const cardWidth = SCREEN_WIDTH * 0.82;

    return (
      <Animated.View style={[animStyle, { width: cardWidth }]}>
        <TouchableOpacity
          className="bg-surface overflow-hidden"
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#E0E0E0",
            flexDirection: "row",
            height: 140,
            elevation: 2,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
          }}
          onPress={onPress}
          activeOpacity={0.87}
        >
          {/* Image */}
          <View
            className="bg-neutral-100 flex-shrink-0"
            style={{ width: 130 }}
          >
            {product.image_url ? (
              <Image
                source={{ uri: product.image_url }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={350}
                cachePolicy="disk"
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <MaterialCommunityIcons
                  name="image-off-outline"
                  size={26}
                  color="#C2C2C2"
                />
              </View>
            )}
          </View>

          {/* Content */}
          <View className="flex-1 p-3 justify-between">
            <Text
              className="text-[13px] font-[700] text-text-primary leading-[19px]"
              numberOfLines={2}
            >
              {formatName(product.name)}
            </Text>

            <View>
              <Text className="text-[17px] font-[800] text-brand">
                {formattedPrice}
                <Text className="text-[10px] font-[500] text-neutral-300">
                  {" "}
                  {unitLabel}
                </Text>
              </Text>

              <TouchableOpacity
                className="mt-2 items-center justify-center bg-brand"
                style={{ borderRadius: 8, paddingVertical: 9 }}
                onPress={onAdd}
              >
                <Text className="text-[12px] font-[800] text-brand-on uppercase tracking-wider">
                  Adicionar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── CAROUSEL card ──────────────────────────────────────────────────────────
  if (isCarousel) {
    return (
      <Animated.View style={animStyle}>
        <TouchableOpacity
          className="bg-surface overflow-hidden"
          style={{
            width: 156,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#E0E0E0",
            elevation: 2,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 5,
          }}
          onPress={onPress}
          activeOpacity={0.87}
        >
          <View className="bg-neutral-100" style={{ height: 126, width: "100%" }}>
            {product.image_url ? (
              <Image
                source={{ uri: product.image_url }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={350}
                cachePolicy="disk"
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <MaterialCommunityIcons
                  name="image-off-outline"
                  size={22}
                  color="#C2C2C2"
                />
              </View>
            )}
          </View>

          <View className="p-2">
            <Text
              className="text-[12px] font-[600] text-text-primary leading-[16px] mb-1"
              numberOfLines={2}
              style={{ minHeight: 32 }}
            >
              {formatName(product.name)}
            </Text>

            <Text className="text-[15px] font-[800] text-brand mb-2">
              {formattedPrice}
              <Text className="text-[10px] font-[400] text-neutral-300">
                {" "}
                {unitLabel}
              </Text>
            </Text>

            <TouchableOpacity
              className="items-center justify-center bg-brand"
              style={{ borderRadius: 8, paddingVertical: 8 }}
              onPress={onAdd}
            >
              <Text className="text-[11px] font-[800] text-brand-on uppercase tracking-wider">
                Adicionar
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── GRID card (search results / default) ──────────────────────────────────
  return (
    <Animated.View style={[animStyle, { flex: 1 }]}>
      <TouchableOpacity
        className="bg-surface flex-1 overflow-hidden"
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#E0E0E0",
          elevation: 2,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 5,
        }}
        onPress={onPress}
        activeOpacity={0.87}
      >
        <View
          className="bg-neutral-100 w-full items-center justify-center"
          style={{ height: 138 }}
        >
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url }}
              style={{ width: "100%", height: "100%", backgroundColor: "#F5F5F5" }}
              contentFit="cover"
              transition={350}
              cachePolicy="disk"
            />
          ) : (
            <View className="flex-1 w-full items-center justify-center bg-neutral-100">
              <MaterialCommunityIcons
                name="image-off-outline"
                size={30}
                color="#C2C2C2"
              />
            </View>
          )}
        </View>

        <View className="p-3">
          <Text
            className="text-[13px] font-[600] text-text-primary leading-[18px] mb-1"
            numberOfLines={2}
            style={{ minHeight: 36 }}
          >
            {formatName(product.name)}
          </Text>

          <Text className="text-[16px] font-[800] text-brand mb-2">
            {formattedPrice}
            <Text className="text-[11px] font-[400] text-neutral-300">
              {" "}
              {unitLabel}
            </Text>
          </Text>

          <TouchableOpacity
            className="items-center justify-center bg-brand"
            style={{ borderRadius: 8, paddingVertical: 10 }}
            onPress={onAdd}
          >
            <Text className="text-[13px] font-[800] text-brand-on uppercase tracking-wider">
              Adicionar
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
