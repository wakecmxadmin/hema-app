import React, { useState } from "react";
import {
  View,
  ScrollView,
  StatusBar,
  Text,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useHomeData } from "@/hooks/useHomeData";
import { HomeHeader } from "@/components/HomeHeader";
import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/context/CartContext";
import { Product } from "@/types/product";
import { searchProducts } from "@/services/search";
import { CategoryCarousel } from "@/components/CategoryCarousel";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";

const SEARCH_LIMIT = 20;

export default function HomeScreen() {
  const router = useRouter();
  const { catalog, refreshing, onRefresh } = useHomeData();
  const { addItem } = useCart();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isSearchingMore, setIsSearchingMore] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreSearch, setHasMoreSearch] = useState(true);

  const handleAddToCart = async (product: Product) => {
    const isKg =
      product.price_per_kg !== null && product.price_per_kg !== undefined;
    const isUnit = product.type === "unit" || !isKg;

    const payload = {
      product_id: product.id,
      price: isUnit ? product.price : product.price_per_kg,
      ...(isUnit ? { quantity: 1 } : { weight: 50 }),
    };

    await addItem(payload);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const response = await searchProducts(query, SEARCH_LIMIT, 0);

    if (response.success && response.data) {
      setSearchResults(response.data);
      setSearchOffset(0);
      setHasMoreSearch(response.data.length === SEARCH_LIMIT);
    } else {
      setSearchResults([]);
    }

    setIsSearching(false);
  };

  const loadMoreSearchResults = async () => {
    if (!hasMoreSearch || isSearchingMore || !searchQuery.trim()) return;

    setIsSearchingMore(true);
    const nextOffset = searchOffset + SEARCH_LIMIT;

    const response = await searchProducts(
      searchQuery,
      SEARCH_LIMIT,
      nextOffset,
    );

    if (response.success && response.data) {
      setSearchResults((prev) => [...prev, ...(response.data || [])]);
      setSearchOffset(nextOffset);
      setHasMoreSearch(response.data.length === SEARCH_LIMIT);
    }

    setIsSearchingMore(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E31837]" edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor="#E31837" />

      <HomeHeader onSearch={handleSearch} />

      <ScrollView
        className="flex-1 bg-white"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={refreshing && catalog ? ["transparent"] : ["#E31837"]}
            tintColor={refreshing && catalog ? "transparent" : "#E31837"}
          />
        }
      >
        <CategoryCarousel />

        {/* 1. LOADING DA BUSCA (SKELETON EM GRADE) */}
        {isSearching ? (
          <View className="flex-row flex-wrap justify-between px-4 mt-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <View key={i} className="w-1/2 mb-4">
                <ProductCardSkeleton />
              </View>
            ))}
          </View>
        ) : searchQuery.trim() !== "" ? (
          /* 2. EXIBIÇÃO DOS RESULTADOS DA BUSCA */
          <View className="mx-0 mb-0">
            {searchResults.length > 0 &&
            (searchResults[0].similarity_score ?? 1) < 0.3 ? (
              <View style={{ marginBottom: 10 }}>
                <Text className="text-xl font-bold text-[#1A1A1A] mx-4 mt-4 mb-2">
                  Poxa, não encontramos "{searchQuery}"
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: "#666",
                    marginHorizontal: 18,
                    marginTop: -10,
                    marginBottom: 10,
                  }}
                >
                  Mas separamos algumas sugestões parecidas para você:
                </Text>
              </View>
            ) : searchResults.length > 0 ? (
              <Text className="text-xl font-bold text-[#1A1A1A] mx-4 mt-4 mb-2">
                Resultados para "{searchQuery}"
              </Text>
            ) : null}

            {/* Caso não encontre NADA */}
            {searchResults.length === 0 ? (
              <View className="items-center justify-center pt-15">
                <MaterialCommunityIcons
                  name="magnify-close"
                  size={48}
                  color="#CCC"
                />
                <Text className="mt-3 text-[#999] text-base">Nenhum produto encontrado</Text>
              </View>
            ) : (
              <>
                {/* Grade de Produtos */}
                <View className="flex-row flex-wrap justify-between mt-2 px-4">
                  {searchResults.map((product, index) => (
                    <View
                      key={`${product.id}-${index}`}
                      className="w-1/2 mb-4"
                    >
                      <ProductCard
                        product={product}
                        onPress={() =>
                          router.push({
                            pathname: "/product/[id]",
                            params: { id: product.id },
                          })
                        }
                        onAdd={() => handleAddToCart(product)}
                      />
                    </View>
                  ))}
                </View>

                {/* BOTÃO MOSTRAR MAIS */}
                {hasMoreSearch && (
                  <View className="py-7 items-center">
                    {isSearchingMore ? (
                      <ActivityIndicator size="small" color="#E31837" />
                    ) : (
                      <TouchableOpacity
                        onPress={loadMoreSearchResults}
                        className="bg-white py-3 px-10 rounded-full border border-[#E31837] mt-2 mb-5"
                        activeOpacity={0.7}
                      >
                        <Text className="text-[#E31837] font-bold text-sm">Mostrar Mais</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        ) : !catalog || refreshing ? (
          <View className="mt-5">
            {[1, 2].map((row) => (
              <View key={row}>
                <View className="h-5 w-38 bg-[#F0F0F0] ml-4 mb-4 rounded" />
                <View className="flex-row pl-4 gap-3 mb-6">
                  {[1, 2, 3].map((i) => (
                    <ProductCardSkeleton key={i} isCarousel={true} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          catalog?.map((category) => {
            if (!category.products || category.products.length === 0)
              return null;

            return (
              <View key={category.id} className="mx-0 mb-0">
                <View className="flex-row items-center justify-between mx-4 mt-4 mb-4">
                  <Text className="text-xl font-bold text-[#1A1A1A] mx-4 mt-4 mb-2">{category.name}</Text>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/category/[id]",
                        params: { id: category.id, name: category.name },
                      })
                    }
                  >
                    <Text style={{ color: "#E31837", fontWeight: "bold" }}>
                      Ver todos
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 8, paddingLeft: 18 }}
                >
                  {category.products.map((product, index) => (
                    <View
                      key={product.id}
                      className={index === category.products.length - 1 ? "mr-0" : "mr-3"}
                    >
                      <ProductCard
                        product={product}
                        isCarousel={true}
                        onPress={() =>
                          router.push({
                            pathname: "/product/[id]",
                            params: { id: product.id },
                          })
                        }
                        onAdd={() => handleAddToCart(product)}
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
