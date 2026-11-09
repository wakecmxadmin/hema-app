import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  ScrollView,
  StatusBar,
  Text,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
  FlatList,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  withTiming,
  useAnimatedStyle,
} from "react-native-reanimated";

const FEATURED_CARD_WIDTH = Math.round(Dimensions.get("window").width * 0.82);

// Height of the floating header — must match HomeHeader's rendered height.
export const HEADER_HEIGHT = 160;
const MAX_TRANSLATE_Y = 330;

import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useHomeData } from "@/hooks/useHomeData";
import { HomeHeader } from "@/components/HomeHeader";
import { BannerCarousel } from "@/components/BannerCarousel";
import { CategoryCarousel } from "@/components/CategoryCarousel";
import { SectionHeader } from "@/components/SectionHeader";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";
import { Product } from "@/types/product";
import { searchProducts } from "@/services/search";
import { SortChips } from "@/components/SortChips";
import { SEARCH_SORTS, ProductSort } from "@/types/sort";
import { useQuantityPicker } from "@/context/QuantityPickerContext";
import { QuickActions } from "@/components/QuickActions";

const SEARCH_LIMIT = 20;

export default function HomeScreen() {
  const router = useRouter();
  const { catalog, refreshing, onRefresh } = useHomeData();
  const { openQuantityPicker } = useQuantityPicker();

  // Reforça o StatusBar toda vez que a tela ganha foco (navegação entre tabs/telas)
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle("light-content", true);
      if (Platform.OS === "android") {
        StatusBar.setBackgroundColor("#D91A21", true);
        StatusBar.setTranslucent(false);
      }
    }, []),
  );

  const scrollRef = useRef<any>(null);
  const scrollToY = (y: number) =>
    scrollRef.current?.scrollTo({ y, animated: true });

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

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchingMore, setIsSearchingMore] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreSearch, setHasMoreSearch] = useState(true);
  const [searchSort, setSearchSort] = useState<ProductSort>(
    SEARCH_SORTS[0].value,
  );

  const handleAddToCart = useCallback(
    (product: Product) => {
      // Visitante também adiciona: a conta só é pedida ao fechar o pedido
      openQuantityPicker(product);
    },
    [openQuantityPicker],
  );

  const runSearch = async (query: string, sort: ProductSort) => {
    setIsSearching(true);

    const response = await searchProducts(query, SEARCH_LIMIT, 0, sort);

    if (response.success && response.data) {
      setSearchResults(response.data);
      setSearchOffset(0);
      setHasMoreSearch(response.data.length === SEARCH_LIMIT);
    } else {
      setSearchResults([]);
    }

    setIsSearching(false);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Um termo novo volta para relevância: a ordenação por preço escolhida na
    // busca anterior não diz nada sobre o que a pessoa acabou de digitar.
    const sort = SEARCH_SORTS[0].value;
    setSearchSort(sort);
    await runSearch(query, sort);
  };

  const handleSearchSortChange = async (sort: ProductSort) => {
    setSearchSort(sort);
    if (!searchQuery.trim()) return;
    await runSearch(searchQuery, sort);
  };

  const loadMoreSearchResults = async () => {
    if (!hasMoreSearch || isSearchingMore || !searchQuery.trim()) return;

    setIsSearchingMore(true);
    const nextOffset = searchOffset + SEARCH_LIMIT;

    const response = await searchProducts(
      searchQuery,
      SEARCH_LIMIT,
      nextOffset,
      searchSort,
    );

    if (response.success && response.data) {
      setSearchResults((prev) => [...prev, ...(response.data || [])]);
      setSearchOffset(nextOffset);
      setHasMoreSearch(response.data.length === SEARCH_LIMIT);
    }

    setIsSearchingMore(false);
  };

  const navigateToProduct = useCallback(
    (id: string) => router.push({ pathname: "/product/[id]", params: { id } }),
    [router],
  );

  const navigateToCategory = useCallback(
    (id: string, name: string) =>
      router.push({ pathname: "/category/[id]", params: { id, name } }),
    [router],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#D91A21" }}
      edges={["top"]}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#D91A21"
        translucent={false}
      />

      <View style={{ flex: 1 }}>
        <Animated.ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: "#FAF6F0" }}
          contentContainerStyle={{ paddingTop: HEADER_HEIGHT + 8 }}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressViewOffset={HEADER_HEIGHT}
              colors={refreshing && catalog ? ["transparent"] : ["#D91A21"]}
              tintColor={refreshing && catalog ? "transparent" : "#D91A21"}
            />
          }
        >
          {/* Cabeçalho da busca fora do ternário: durante a troca de ordenação
              `isSearching` vira true e, se os chips vivessem dentro de
              SearchResults, o chip recém-tocado desapareceria junto com a
              lista. A condição inclui `searchSort !== "relevance"` para que
              uma ordenação por preço que não devolveu nada ainda mostre os
              chips — senão o cliente fica sem caminho de volta. */}
          {searchQuery.trim() !== "" &&
            (isSearching ||
              searchResults.length > 0 ||
              searchSort !== "relevance") && (
              <SearchHeader
                query={searchQuery}
                results={searchResults}
                isSearching={isSearching}
                sort={searchSort}
                onSortChange={handleSearchSortChange}
              />
            )}

          {isSearching ? (
            <SearchSkeleton />
          ) : searchQuery.trim() !== "" ? (
            <SearchResults
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
              onScrollTo={scrollToY}
              onOrdersPress={() => router.push("/orders")}
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

interface SearchHeaderProps {
  query: string;
  results: Product[];
  isSearching: boolean;
  sort: ProductSort;
  onSortChange: (sort: ProductSort) => void;
}

/**
 * Título dos resultados + chips de ordenação.
 *
 * Separado de SearchResults porque precisa continuar na tela enquanto a busca
 * recarrega: é ele que segura os chips durante a troca de ordenação.
 */
function SearchHeader({
  query,
  results,
  isSearching,
  sort,
  onSortChange,
}: SearchHeaderProps) {
  // Score baixo = a busca não achou o termo e está mostrando aproximações.
  // Durante o recarregamento os resultados em tela são os antigos, então o
  // título cai no texto neutro em vez de acusar um "não encontramos" que pode
  // nem valer para a ordenação nova.
  const lowScore =
    !isSearching &&
    results.length > 0 &&
    (results[0].similarity_score ?? 1) < 0.3;

  return (
    <View>
      <View className="px-4 mt-5">
        {lowScore ? (
          <>
            <Text className="text-[18px] font-[800] text-text-primary">
              Não encontramos "{query}"
            </Text>
            <Text className="text-[13px] text-neutral-300 mt-1">
              Separamos algumas sugestões para você:
            </Text>
          </>
        ) : (
          <Text className="text-[18px] font-[800] text-text-primary">
            Resultados para "{query}"
          </Text>
        )}
      </View>

      <SortChips
        options={SEARCH_SORTS}
        value={sort}
        onChange={onSortChange}
        disabled={isSearching}
      />
    </View>
  );
}

interface SearchResultsProps {
  results: Product[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onProductPress: (id: string) => void;
  onAddToCart: (product: Product) => void;
}

function SearchResults({
  results,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onProductPress,
  onAddToCart,
}: SearchResultsProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 250 });
    translateY.value = withTiming(0, { duration: 250 });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      {results.length === 0 ? (
        <View className="items-center justify-center pt-16">
          <MaterialCommunityIcons name="magnify-close" size={52} color="#C2C2C2" />
          <Text className="mt-3 text-neutral-300 text-[15px]">
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
                  onPress={onProductPress}
                  onAdd={onAddToCart}
                />
              </View>
            ))}
          </View>
          {hasMore && (
            <View className="py-6 items-center">
              {isLoadingMore ? (
                <ActivityIndicator size="small" color="#D91A21" />
              ) : (
                <TouchableOpacity
                  onPress={onLoadMore}
                  className="bg-surface px-10 py-3 border-[1.5px] border-brand"
                  style={{ borderRadius: 25 }}
                  activeOpacity={0.7}
                >
                  <Text className="text-brand font-[700] text-[13px]">
                    Mostrar mais
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      )}
    </Animated.View>
  );
}

function CatalogSkeleton() {
  return (
    <View className="mt-2">
      <View
        className="mx-4 mt-4 mb-3 bg-neutral-100"
        style={{ height: 156, borderRadius: 16 }}
      />
      <View className="flex-row px-4 gap-2 py-3">
        {[100, 76, 116, 84].map((w, i) => (
          <View
            key={i}
            className="h-9 bg-neutral-100"
            style={{ width: w, borderRadius: 20 }}
          />
        ))}
      </View>
      <View className="px-4 mt-5 mb-3">
        <View className="h-3 w-16 bg-neutral-100 rounded mb-2" />
        <View className="h-5 w-36 bg-neutral-100 rounded" />
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
          <View className="h-5 w-36 bg-neutral-100 rounded mx-4 mb-3" />
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
  onScrollTo: (y: number) => void;
  onOrdersPress: () => void;
}

function Catalog({
  catalog,
  onProductPress,
  onCategoryPress,
  onAddToCart,
  onScrollTo,
  onOrdersPress,
}: CatalogProps) {
  const bannerProducts = catalog
    .filter((cat) => cat.products.length > 0)
    .flatMap((cat) => cat.products.slice(0, 2))
    .slice(0, 6);

  return (
    <>
      <QuickActions
        onCategoriesPress={() => onScrollTo(HEADER_HEIGHT + 380)}
        onOffersPress={() => onScrollTo(HEADER_HEIGHT + 100)}
        onOrdersPress={onOrdersPress}
        onNewPress={() => onScrollTo(HEADER_HEIGHT + 460)}
      />
      <BannerCarousel products={bannerProducts} onPress={onProductPress} />
      <CategoryCarousel />
      {catalog.map((category, categoryIndex) => {
        if (!category.products || category.products.length === 0) return null;
        const isFeatured = categoryIndex === 0;
        const isOdd = categoryIndex % 2 === 1;

        return (
          <View
            key={category.id}
            style={{
              backgroundColor: isOdd ? "#F2ECE2" : "#FAF6F0",
              paddingTop: isOdd ? 8 : 0,
              paddingBottom: 24,
            }}
          >
            {!isOdd && categoryIndex > 0 && (
              <View
                style={{
                  height: 1,
                  backgroundColor: "#EAE3D7",
                  marginHorizontal: 16,
                }}
              />
            )}
            <SectionHeader
              title={category.name}
              label={isFeatured ? "Destaques" : undefined}
              onSeeAll={() => onCategoryPress(category.id, category.name)}
            />
            {isFeatured ? (
              <FlatList
                data={category.products.slice(0, 5)}
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
                keyExtractor={(item) => item.id}
                initialNumToRender={2}
                windowSize={3}
                renderItem={({ item, index }) => (
                  <ProductCard
                    product={item}
                    isFeatured
                    animationDelay={index * 70}
                    onPress={onProductPress}
                    onAdd={onAddToCart}
                  />
                )}
              />
            ) : (
              <FlatList
                data={category.products}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                keyExtractor={(item) => item.id}
                initialNumToRender={3}
                windowSize={3}
                renderItem={({ item, index }) => (
                  <ProductCard
                    product={item}
                    isCarousel
                    animationDelay={index * 50}
                    onPress={onProductPress}
                    onAdd={onAddToCart}
                  />
                )}
              />
            )}
          </View>
        );
      })}
    </>
  );
}
