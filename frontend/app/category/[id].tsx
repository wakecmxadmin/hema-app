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
import { Toast } from "@/util/toast";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";
import { useCart } from "@/context/CartContext";

const LIMIT = 30;

export default function CategoryScreen() {
  const router = useRouter();
  const { addItem } = useCart();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    async function loadInitialProducts() {
      if (!id) return;
      setLoading(true);

      const response = await getProductsByCategory(id as string, LIMIT, 0);

      if (response.success && response.data) {
        setProducts(response.data);
        setOffset(0);
        setHasMore(response.data.length === LIMIT);
      } else {
        setProducts([]);
        setHasMore(false);
      }

      setLoading(false);
    }
    loadInitialProducts();
  }, [id]);

  const onRefresh = async () => {
    if (!id) return;
    setRefreshing(true);

    const response = await getProductsByCategory(id as string, LIMIT, 0);

    if (response.success && response.data) {
      setProducts(response.data);
      setOffset(0);
      setHasMore(response.data.length === LIMIT);
    }

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
    );

    if (response.success && response.data) {
      setProducts((prev) => [...prev, ...(response.data || [])]);
      setOffset(nextOffset);
      setHasMore(response.data.length === LIMIT);
    }

    setLoadingMore(false);
  };

  const handleAddToCart = useCallback(
    async (product: Product) => {
      const payload = {
        product_id: product.id,
        price: product.type === "unit" ? product.price : product.price_per_kg,
        ...(product.type === "unit" ? { quantity: 1 } : { weight: 100 }),
      };

      const success = await addItem(payload);
      if (success) {
        Toast.show({ type: "success", text1: "Adicionado ao carrinho!" });
      } else {
        Toast.show({ type: "error", text1: "Erro ao adicionar ao carrinho" });
      }
    },
    [addItem],
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

      {loading ? (
        <ScrollView
          className="flex-1 w-full"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row flex-wrap justify-between px-4 pt-4">
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
          contentContainerClassName="px-4 pt-4 pb-10"
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
