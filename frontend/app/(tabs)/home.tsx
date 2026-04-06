import React, { useState } from "react";
import {
  View,
  ScrollView,
  StatusBar,
  Text,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from "react-native-reanimated";

const FEATURED_CARD_WIDTH = Math.round(Dimensions.get("window").width * 0.82);

// Height of the floating header — must match HomeHeader's rendered height.
export const HEADER_HEIGHT = 160;
const MAX_TRANSLATE_Y = 330;

import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useHomeData } from "@/hooks/useHomeData";
import { HomeHeader } from "@/components/HomeHeader";
import { BannerCarousel } from "@/components/BannerCarousel";
import { CategoryCarousel } from "@/components/CategoryCarousel";
import { SectionHeader } from "@/components/SectionHeader";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";
import { useCart } from "@/context/CartContext";
import { Product } from "@/types/product";
import { searchProducts } from "@/services/search";
import { Toast } from "@/util/toast";

const SEARCH_LIMIT = 20;

export default function HomeScreen() {
  const router = useRouter();
  const { catalog, refreshing, onRefresh } = useHomeData();
  const { addItem } = useCart();

  // ── Collapsible header via Reanimated ──
  const headerOffset = useSharedValue(0);
  const lastScrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = Math.max(event.contentOffset.y, 0);
      const diff = currentY - lastScrollY.value;

      headerOffset.value = Math.min(
        Math.max(headerOffset.value + diff, 0),
        MAX_TRANSLATE_Y,
      );

      lastScrollY.value = currentY;
    },
  });
  // ─────────────────────────────────────────────────────────────────────────

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

    await addItem({
      product_id: product.id,
      price: isUnit ? product.price : product.price_per_kg,
      ...(isUnit ? { quantity: 1 } : { weight: 50 }),
    });

    Toast.show({ type: "success", text1: "Adicionado ao carrinho!" });
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

  const navigateToProduct = (id: string) =>
    router.push({ pathname: "/product/[id]", params: { id } });

  const navigateToCategory = (id: string, name: string) =>
    router.push({ pathname: "/category/[id]", params: { id, name } });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#E30613" }}
      edges={["top"]}
    >
      <StatusBar barStyle="light-content" backgroundColor="#E30613" />

      <View style={{ flex: 1 }}>
        <Animated.ScrollView
          style={{ flex: 1, backgroundColor: "#FFFFFF" }}
          contentContainerStyle={{ paddingTop: HEADER_HEIGHT }}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressViewOffset={HEADER_HEIGHT}
              colors={refreshing && catalog ? ["transparent"] : ["#E30613"]}
              tintColor={refreshing && catalog ? "transparent" : "#E30613"}
            />
          }
        >
          {isSearching ? (
            <SearchSkeleton />
          ) : searchQuery.trim() !== "" ? (
            <SearchResults
              query={searchQuery}
              results={searchResults}
              hasMore={hasMoreSearch}
              isLoadingMore={isSearchingMore}
              onLoadMore={loadMoreSearchResults}
              onProductPress={navigateToProduct}
              onAddToCart={handleAddToCart}
            />
          ) : !catalog || refreshing ? (
            <CatalogSkeleton />
          ) : (
            <Catalog
              catalog={catalog}
              onProductPress={navigateToProduct}
              onCategoryPress={navigateToCategory}
              onAddToCart={handleAddToCart}
            />
          )}

          <View className="h-8" />
        </Animated.ScrollView>

        <HomeHeader onSearch={handleSearch} headerOffset={headerOffset} />
      </View>
    </SafeAreaView>
  );
}

function SearchSkeleton() {
  return (
    <View className="flex-row flex-wrap justify-between px-4 pt-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} className="w-[48%] mb-4">
          <ProductCardSkeleton />
        </View>
      ))}
    </View>
  );
}

interface SearchResultsProps {
  query: string;
  results: Product[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onProductPress: (id: string) => void;
  onAddToCart: (product: Product) => void;
}

function SearchResults({
  query,
  results,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onProductPress,
  onAddToCart,
}: SearchResultsProps) {
  const lowScore =
    results.length > 0 && (results[0].similarity_score ?? 1) < 0.3;
  return (
    <View>
      {results.length > 0 && (
        <View className="px-4 mt-5 mb-3">
          {lowScore ? (
            <>
              <Text className="text-[17px] font-[800] text-[#1A1A1A]">
                Não encontramos "{query}"
              </Text>
              <Text className="text-[13px] text-[#888888] mt-1">
                Separamos algumas sugestões para você:
              </Text>
            </>
          ) : (
            <Text className="text-[17px] font-[800] text-[#1A1A1A]">
              Resultados para "{query}"
            </Text>
          )}
        </View>
      )}

      {results.length === 0 ? (
        <View className="items-center justify-center pt-16">
          <MaterialCommunityIcons name="magnify-close" size={52} color="#DDD" />
          <Text className="mt-3 text-[#AAAAAA] text-[15px]">
            Nenhum produto encontrado
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-row flex-wrap justify-between px-4">
            {results.map((product, index) => (
              <View
                key={`${product.id}-${index}`}
                className="w-[48%] mb-[14px]"
              >
                <ProductCard
                  product={product}
                  animationDelay={Math.min(index * 45, 260)}
                  onPress={() => onProductPress(product.id)}
                  onAdd={() => onAddToCart(product)}
                />
              </View>
            ))}
          </View>
          {hasMore && (
            <View className="py-6 items-center">
              {isLoadingMore ? (
                <ActivityIndicator size="small" color="#E30613" />
              ) : (
                <TouchableOpacity
                  onPress={onLoadMore}
                  className="bg-white px-10 py-3 border-[1.5px] border-[#E30613]"
                  style={{ borderRadius: 25 }}
                  activeOpacity={0.7}
                >
                  <Text className="text-[#E30613] font-[700] text-[13px]">
                    Mostrar mais
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function CatalogSkeleton() {
  return (
    <View className="mt-2">
      <View
        className="mx-4 mt-4 mb-3 bg-[#F0F0F0]"
        style={{ height: 156, borderRadius: 16 }}
      />
      <View className="flex-row px-4 gap-2 py-3">
        {[100, 76, 116, 84].map((w, i) => (
          <View
            key={i}
            className="h-9 bg-[#F0F0F0]"
            style={{ width: w, borderRadius: 20 }}
          />
        ))}
      </View>
      <View className="px-4 mt-5 mb-3">
        <View className="h-3 w-16 bg-[#F0F0F0] rounded mb-2" />
        <View className="h-5 w-36 bg-[#F0F0F0] rounded" />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {[1, 2, 3].map((i) => (
          <ProductCardSkeleton key={i} isFeatured />
        ))}
      </ScrollView>
      {[1, 2].map((row) => (
        <View key={row} className="mt-6">
          <View className="h-5 w-36 bg-[#F0F0F0] rounded mx-4 mb-3" />
          <View className="flex-row gap-3 pl-4">
            {[1, 2, 3].map((i) => (
              <ProductCardSkeleton key={i} isCarousel />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

interface CatalogProps {
  catalog: { id: string; name: string; products: Product[] }[];
  onProductPress: (id: string) => void;
  onCategoryPress: (id: string, name: string) => void;
  onAddToCart: (product: Product) => void;
}

function Catalog({
  catalog,
  onProductPress,
  onCategoryPress,
  onAddToCart,
}: CatalogProps) {
  const bannerProducts = catalog
    .filter((cat) => cat.products.length > 0)
    .flatMap((cat) => cat.products.slice(0, 2))
    .slice(0, 6);

  return (
    <>
      <CategoryCarousel />
      <BannerCarousel products={bannerProducts} onPress={onProductPress} />
      {catalog.map((category, categoryIndex) => {
        if (!category.products || category.products.length === 0) return null;
        const isFeatured = categoryIndex === 0;

        return (
          <View key={category.id} className="mb-2">
            <SectionHeader
              title={category.name}
              label={isFeatured ? "Destaques" : undefined}
              onSeeAll={() => onCategoryPress(category.id, category.name)}
            />
            {isFeatured ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  gap: 12,
                  paddingBottom: 4,
                }}
                decelerationRate="fast"
                snapToInterval={FEATURED_CARD_WIDTH + 12}
                snapToAlignment="start"
              >
                {category.products.slice(0, 5).map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isFeatured
                    animationDelay={index * 70}
                    onPress={() => onProductPress(product.id)}
                    onAdd={() => onAddToCart(product)}
                  />
                ))}
              </ScrollView>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              >
                {category.products.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isCarousel
                    animationDelay={index * 50}
                    onPress={() => onProductPress(product.id)}
                    onAdd={() => onAddToCart(product)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        );
      })}
    </>
  );
}
