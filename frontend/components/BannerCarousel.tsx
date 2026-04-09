import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Dimensions,
  TouchableOpacity,
  ViewToken,
} from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Product } from "@/types/product";

interface BannerCarouselProps {
  products: Product[];
  onPress: (id: string) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 32;
const CARD_GAP = 12;

const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function BannerCarousel({ products, onPress }: BannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  if (!products || products.length === 0) return null;

  return (
    <View className="mt-5 mb-3">
      {/* Section label */}
      <View className="px-4 mb-3 flex-row items-center gap-2">
        <View className="w-1 h-4 bg-brand rounded-full" />
        <Text className="text-[13px] font-[800] text-text-primary uppercase tracking-widest">
          Ofertas em Destaque
        </Text>
      </View>

      <FlatList
        data={products}
        horizontal
        pagingEnabled={false}
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => `banner-${item.id}`}
        contentContainerStyle={{
          paddingHorizontal: 16,
          gap: CARD_GAP,
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        renderItem={({ item }) => {
          const isKg =
            item.price_per_kg !== null && item.price_per_kg !== undefined;
          const price = isKg ? (item.price_per_kg || 0) / 10 : item.price;
          const unitLabel = isKg ? "/100g" : "/un";

          return (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => onPress(item.id)}
              style={{ width: CARD_WIDTH }}
            >
              {/* 1. CONTAINER EXTERNO: Responsável apenas pela sombra no iOS/Android. SEM overflow: hidden */}
              <View
                style={{
                  borderRadius: 16,
                  margin: 8,
                  marginBottom: 18,
                  backgroundColor: "#FFFFFF",
                  shadowColor: "#D91A21",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.18,
                  shadowRadius: 12,
                  elevation: 6,
                }}
              >
                {/* 2. CONTAINER INTERNO: Mascara o conteúdo para ficar com borda redonda. COM overflow: hidden */}
                <View
                  style={{
                    borderRadius: 16,
                    height: 200,
                    overflow: "hidden",
                    flexDirection: "row",
                  }}
                >
                  {/* Decorative accent stripe */}
                  <View
                    style={{
                      flex: 1,
                      padding: 20,
                      paddingLeft: 24,
                      justifyContent: "space-between",
                      backgroundColor: "#D91A21",
                    }}
                  >
                    {/* Badge */}
                    <View
                      style={{
                        alignSelf: "flex-start",
                        backgroundColor: "#FFFFFF",
                        borderRadius: 16,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 3,
                        elevation: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "900",
                          color: "#D91A21",
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        }}
                      >
                        Ofertas
                      </Text>
                    </View>

                    {/* Product name + price */}
                    <View>
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 17,
                          fontWeight: "800",
                          lineHeight: 22,
                          marginBottom: 10,
                        }}
                        numberOfLines={2}
                      >
                        {item.name
                          .toLowerCase()
                          .split(" ")
                          .map(
                            (word) =>
                              word.charAt(0).toUpperCase() + word.slice(1),
                          )
                          .join(" ")}
                      </Text>

                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "baseline",
                          gap: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 26,
                            fontWeight: "900",
                            color: "#FFFFFF",
                          }}
                        >
                          {formatPrice(price)}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: "rgba(255, 255, 255, 0.75)",
                          }}
                        >
                          {unitLabel}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Right image */}
                  <View
                    style={{
                      width: 180,
                      backgroundColor: "#FFFFFF",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 10,
                    }}
                  >
                    {item.image_url ? (
                      <Image
                        source={{ uri: item.image_url }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="contain"
                        transition={300}
                        cachePolicy="disk"
                      />
                    ) : (
                      <MaterialCommunityIcons
                        name="image-off-outline"
                        size={40}
                        color="#C2C2C2"
                      />
                    )}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Dot indicators */}
      {products.length > 1 && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            marginTop: 14,
            gap: 5,
          }}
        >
          {products.map((product, i) => (
            <View
              key={`dot-${product.id}`}
              style={{
                height: 6,
                borderRadius: 3,
                width: i === activeIndex ? 20 : 6,
                backgroundColor: i === activeIndex ? "#D91A21" : "#E0E0E0",
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
