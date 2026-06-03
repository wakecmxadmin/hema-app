import React, { useCallback, useEffect } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { Product } from "@/types/product";
import { optimizedImage } from "@/util/image-url";

interface ProductCardProps {
  product: Product;
  onPress: (id: string) => void;
  onAdd: (product: Product) => void;
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
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    const config = { duration: 340, easing: Easing.out(Easing.quad) };
    opacity.value = withDelay(delay, withTiming(1, config));
    translateY.value = withDelay(delay, withTiming(0, config));
  }, []);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}

function ProductCardImpl({
  product,
  onPress,
  onAdd,
  isCarousel = false,
  isFeatured = false,
  animationDelay = 0,
}: ProductCardProps) {
  const animStyle = useEntryAnimation(animationDelay);

  const handlePress = useCallback(() => {
    onPress(product.id);
  }, [onPress, product.id]);

  const handleAdd = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(product);
  }, [onAdd, product]);

  const isKg =
    product.price_per_kg !== null && product.price_per_kg !== undefined;
  const displayPrice = isKg ? (product.price_per_kg || 0) / 10 : product.price;
  const unitLabel = isKg ? "/100g" : "/un";
  const formattedPrice = displayPrice ? formatPrice(displayPrice) : "R$ 0,00";
  const imageUri = product.image_url?.trim() || null;

  // ── FEATURED card (landscape, for horizontal scroll) ──────────────────────
  if (isFeatured) {
    const cardWidth = SCREEN_WIDTH * 0.82;

    return (
      <Animated.View style={[animStyle, { width: cardWidth }]}>
        <TouchableOpacity
          className="bg-surface overflow-hidden"
          style={{
            borderRadius: 20,
            flexDirection: "row",
            height: 140,
            shadowColor: "#1A1613",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 3,
            elevation: 2,
          }}
          onPress={handlePress}
          activeOpacity={0.87}
        >
          {/* Image */}
          <View
            className="bg-white flex-shrink-0"
            style={{ width: 130 }}
          >
            {imageUri ? (
              <Image
                source={{ uri: optimizedImage(imageUri, { width: 320, resize: "cover" }) }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={200}
                cachePolicy="disk"
                recyclingKey={imageUri}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <MaterialCommunityIcons
                  name="image-off-outline"
                  size={26}
                  color="#8A8079"
                />
              </View>
            )}
          </View>

          {/* Content */}
          <View className="flex-1 p-3 justify-between">
            <Text
              style={{ fontSize: 13, fontWeight: "700", color: "#1A1613", lineHeight: 19, letterSpacing: -0.2 }}
              numberOfLines={2}
            >
              {formatName(product.name)}
            </Text>

            <View>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3, marginBottom: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#8A8079" }}>R$</Text>
                <Text style={{ fontSize: 17, fontWeight: "800", color: "#1A1613", letterSpacing: -0.4 }}>
                  {formattedPrice.replace("R$ ", "").replace("R$ ", "")}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: "500", color: "#8A8079" }}>{unitLabel}</Text>
              </View>

              <TouchableOpacity
                style={{
                  borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12,
                  backgroundColor: "#1A1613", alignItems: "center", justifyContent: "center",
                }}
                onPress={handleAdd}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.3 }}>
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
            borderRadius: 20,
            shadowColor: "#1A1613",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 3,
            elevation: 2,
          }}
          onPress={handlePress}
          activeOpacity={0.87}
        >
          <View className="bg-white" style={{ height: 126, width: "100%" }}>
            {imageUri ? (
              <Image
                source={{ uri: optimizedImage(imageUri, { width: 320, resize: "cover" }) }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={200}
                cachePolicy="disk"
                recyclingKey={imageUri}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <MaterialCommunityIcons
                  name="image-off-outline"
                  size={22}
                  color="#8A8079"
                />
              </View>
            )}
          </View>

          <View className="p-2">
            <Text
              style={{ fontSize: 12, fontWeight: "600", color: "#1A1613", lineHeight: 16, marginBottom: 4, letterSpacing: -0.1, minHeight: 32 }}
              numberOfLines={2}
            >
              {formatName(product.name)}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2, marginBottom: 8 }}>
              <Text style={{ fontSize: 9, fontWeight: "600", color: "#8A8079" }}>R$</Text>
              <Text style={{ fontSize: 15, fontWeight: "800", color: "#1A1613", letterSpacing: -0.3 }}>
                {formattedPrice.replace("R$ ", "").replace("R$ ", "")}
              </Text>
              <Text style={{ fontSize: 9, fontWeight: "400", color: "#8A8079" }}>{unitLabel}</Text>
            </View>

            <TouchableOpacity
              style={{
                borderRadius: 999, paddingVertical: 8,
                backgroundColor: "#1A1613", alignItems: "center", justifyContent: "center",
              }}
              onPress={handleAdd}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.3 }}>
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
          borderRadius: 20,
          shadowColor: "#1A1613",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 3,
          elevation: 2,
        }}
        onPress={handlePress}
        activeOpacity={0.87}
      >
        <View
          className="bg-white w-full items-center justify-center"
          style={{ height: 138 }}
        >
          {imageUri ? (
            <Image
              source={{ uri: optimizedImage(imageUri, { width: 360, resize: "cover" }) }}
              style={{ width: "100%", height: "100%", backgroundColor: "#FFFFFF" }}
              contentFit="cover"
              transition={200}
              cachePolicy="disk"
              recyclingKey={imageUri}
            />
          ) : (
            <View className="flex-1 w-full items-center justify-center bg-white">
              <MaterialCommunityIcons
                name="image-off-outline"
                size={30}
                color="#8A8079"
              />
            </View>
          )}
        </View>

        <View className="p-3">
          <Text
            style={{ fontSize: 13, fontWeight: "600", color: "#1A1613", lineHeight: 18, marginBottom: 4, letterSpacing: -0.2, minHeight: 36 }}
            numberOfLines={2}
          >
            {formatName(product.name)}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3, marginBottom: 10 }}>
            <Text style={{ fontSize: 9, fontWeight: "600", color: "#8A8079" }}>R$</Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#1A1613", letterSpacing: -0.4 }}>
              {formattedPrice.replace("R$ ", "").replace("R$ ", "")}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: "400", color: "#8A8079" }}>{unitLabel}</Text>
          </View>

          <TouchableOpacity
            style={{
              borderRadius: 999, paddingVertical: 10,
              backgroundColor: "#1A1613", alignItems: "center", justifyContent: "center",
            }}
            onPress={handleAdd}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.3 }}>
              Adicionar
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export const ProductCard = React.memo(ProductCardImpl);
