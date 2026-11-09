import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ScrollView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { getProductsByCategory } from "@/services/products";
import { Product } from "@/types/product";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";
import { useQuantityPicker } from "@/context/QuantityPickerContext";
import { SortChips } from "@/components/SortChips";
import { CATEGORY_SORTS, ProductSort } from "@/types/sort";

const LIMIT = 30;

export default function CategoryScreen() {
  const router = useRouter();
  const { openQuantityPicker } = useQuantityPicker();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [sort, setSort] = useState<ProductSort>(CATEGORY_SORTS[0].value);

  // Carrega a primeira página. Usada na entrada da tela, na troca de
  // ordenação e no pull-to-refresh — os três precisam zerar o offset, senão a
  // lista continua paginando de onde a ordenação anterior tinha parado.
  const loadFirstPage = useCallback(
    async (nextSort: ProductSort) => {
      if (!id) return;

      const response = await getProductsByCategory(
        id as string,
        LIMIT,
        0,
        nextSort,
      );

      if (response.success && response.data) {
        setProducts(response.data);
        setOffset(0);
        setHasMore(response.data.length === LIMIT);
      } else {
        setProducts([]);
        setHasMore(false);
      }
    },
    [id],
  );

  // Roda na entrada da tela e a cada troca de ordenação. Enquanto carrega, a
  // FlatList dá lugar ao skeleton e remonta zerada depois — é o que devolve a
  // lista ao topo, em vez de deixar o cliente no meio de produtos que acabaram
  // de trocar de posição.
  useEffect(() => {
    async function loadProducts() {
      if (!id) return;
      setLoading(true);
      await loadFirstPage(sort);
      setLoading(false);
    }
    loadProducts();
  }, [id, sort, loadFirstPage]);

  const onRefresh = async () => {
    if (!id) return;
    setRefreshing(true);
    await loadFirstPage(sort);
    setRefreshing(false);
  };

  const loadMoreProducts = async () => {
    if (!hasMore || loadingMore || !id) return;

    setLoadingMore(true);
    const nextOffset = offset + LIMIT;

    const response = await getProductsByCategory(
      id as string,
      LIMIT,
      nextOffset,
      sort,
    );

    if (response.success && response.data) {
      setProducts((prev) => [...prev, ...(response.data || [])]);
      setOffset(nextOffset);
      setHasMore(response.data.length === LIMIT);
    }

    setLoadingMore(false);
  };

  const handleAddToCart = useCallback(
    (product: Product) => {
      // Visitante também adiciona: a conta só é pedida ao fechar o pedido
      openQuantityPicker(product);
    },
    [openQuantityPicker],
  );

  const navigateToProduct = useCallback(
    (id: string) => router.push(`/product/${id}` as any),
    [router],
  );

  const renderFooter = () => {
    if (!hasMore && products.length > 0) return null;

    return (
      <View className="py-5 items-center">
        {loadingMore ? (
          <ActivityIndicator size="small" color="#D91A21" />
        ) : (
          hasMore &&
          products.length > 0 && (
            <TouchableOpacity
              onPress={loadMoreProducts}
              className="bg-neutral-100 py-3 px-6 rounded-btn border border-neutral-200"
            >
              <Text className="text-brand font-semibold text-[14px]">
                Mostrar Mais
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>
    );
  };

  // Estilo de sombra do header
  const headerShadow = Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
    },
    android: {
      elevation: 4,
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAF6F0" }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* HEADER */}
      <View
        className="flex-row items-center px-5 py-4 bg-surface rounded-b-card z-10"
        style={headerShadow}
      >
        <TouchableOpacity
          style={{ padding: 8, backgroundColor: "#FAF6F0", borderRadius: 999, borderWidth: 1, borderColor: "#EAE3D7" }}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#121212" />
        </TouchableOpacity>
        <Text className="text-xl font-bold ml-3 capitalize text-text-primary tracking-[0.3px]">
          {name}
        </Text>
      </View>

      {/* Ordenação fora do bloco de loading: some durante o skeleton e o chip
          que acabou de ser tocado piscaria para fora da tela. */}
      <SortChips
        options={CATEGORY_SORTS}
        value={sort}
        onChange={setSort}
        disabled={loading}
      />

      {loading ? (
        <ScrollView
          className="flex-1 w-full"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row flex-wrap justify-between px-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <View key={i} className="w-[48%] mb-4">
                <ProductCardSkeleton />
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          className="flex-1 w-full"
          data={products}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          numColumns={2}
          contentContainerClassName="px-4 pb-10"
          columnWrapperClassName="justify-between mb-4"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#D91A21"]}
              tintColor="#D91A21"
            />
          }
          renderItem={({ item }) => (
            <View className="w-[48%]">
              <ProductCard
                product={item}
                onPress={navigateToProduct}
                onAdd={handleAddToCart}
              />
            </View>
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center mt-20 px-6">
              <Ionicons name="basket-outline" size={64} color="#C2C2C2" />
              <Text className="text-center mt-4 text-text-secondary text-base leading-6">
                Poxa, ainda não temos produtos na categoria "{name}".
              </Text>
            </View>
          }
          ListFooterComponent={renderFooter}
        />
      )}
    </SafeAreaView>
  );
}
