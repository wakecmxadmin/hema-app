import React, { useEffect, useState } from "react";
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

  const handleAddToCart = async (product: Product) => {
    const payload = {
      product_id: product.id,
      price: product.type === "unit" ? product.price : product.price_per_kg,
      ...(product.type === "unit" ? { quantity: 1 } : { weight: 50 }),
    };

    await addItem(payload);
  };

  const renderFooter = () => {
    if (!hasMore && products.length > 0) return null;

    return (
      <View className="py-5 items-center">
        {loadingMore ? (
          <ActivityIndicator size="small" color="#E30613" />
        ) : (
          hasMore &&
          products.length > 0 && (
            <TouchableOpacity
              onPress={loadMoreProducts}
              className="bg-[#F5F5F5] py-3 px-6 rounded-lg border border-[#EAEAEA]"
            >
              <Text className="text-[#E30613] font-semibold text-[14px]">
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
    <SafeAreaView className="flex-1 bg-[#F8F9FA]" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* HEADER */}
      <View
        className="flex-row items-center px-5 py-4 bg-white rounded-b-2xl z-10"
        style={headerShadow}
      >
        <TouchableOpacity
          className="p-2 bg-[#F0F0F0] rounded-full"
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text className="text-[22px] font-extrabold ml-3 capitalize text-[#1A1A1A] tracking-[0.3px]">
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
              colors={["#E30613"]}
              tintColor="#E30613"
            />
          }
          renderItem={({ item }) => (
            <View className="w-[48%]">
              <ProductCard
                product={item}
                onPress={() => router.push(`/product/${item.id}`)}
                onAdd={() => handleAddToCart(item)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center mt-20 px-6">
              <Ionicons name="basket-outline" size={64} color="#ccc" />
              <Text className="text-center mt-4 text-[#666] text-base leading-6">
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
