import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  Platform,
} from "react-native";

import { useCart } from "@/context/CartContext";
import { Product } from "@/types/product";
import { getProductById, getSimilarProducts } from "@/services/products";
import { Toast } from "@/util/toast";
import { ProductDetailsSkeleton } from "@/components/ProductDetailSkeleton";
import { AuthRequiredModal } from "@/components/AuthRequiredModal";

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { addItem, isAuthenticated } = useCart();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const formatName = (name: string) => {
    if (!name) return "";
    return name
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatDisplayPrice = (prod: Product) => {
    const isWeighted = prod.type !== "unit";
    const priceValue = isWeighted
      ? (prod.price_per_kg || 0) / 10
      : prod.price || 0;

    const formatted = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(priceValue);

    return {
      price: formatted,
      label: isWeighted ? " /100g" : " /un",
    };
  };

  async function fetchData() {
    if (!id) return;
    const [productRes, similarRes] = await Promise.all([
      getProductById(id as string),
      getSimilarProducts(id as string),
    ]);

    if (productRes.success && productRes.data) {
      setProduct(productRes.data);
    } else {
      Toast.show({ type: "error", text1: "Oops!", text2: productRes.message });
    }

    if (similarRes.success && similarRes.data) {
      setSimilarProducts(similarRes.data);
    }
  }

  useEffect(() => {
    async function initialLoad() {
      setLoading(true);
      await fetchData();
      setLoading(false);
    }
    initialLoad();
  }, [id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleAddToCart = async () => {
    if (!product) return;
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
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
  };

  if (loading) {
    return (
      <View className="flex-1 bg-surface">
        <TouchableOpacity
          className="absolute left-4 z-10 bg-surface rounded-card p-2"
          style={{ top: Platform.OS === "ios" ? 50 : 30 }}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#121212" />
        </TouchableOpacity>
        <ProductDetailsSkeleton />
      </View>
    );
  }

  if (!product) return null;

  const mainPriceInfo = formatDisplayPrice(product);

  return (
    <View className="flex-1 bg-surface">
      <StatusBar barStyle="dark-content" />

      <TouchableOpacity
        className="absolute left-4 z-10 bg-surface/80 rounded-card p-2"
        style={{ top: Platform.OS === "ios" ? 50 : 30 }}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={24} color="#121212" />
      </TouchableOpacity>

      <ScrollView
        contentContainerClassName="pb-[120px]"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#D91A21"]}
          />
        }
      >
        <View className="w-full aspect-square bg-surface justify-center items-center pt-[70px]">
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url.trim() }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="image-outline" size={60} color="#C2C2C2" />
          )}
        </View>

        <View className="p-5">
          <Text className="text-brand text-[12px] font-bold uppercase mb-2">
            Produto
          </Text>

          <Text className="text-[22px] font-bold text-text-primary mb-3">
            {formatName(product.name)}
          </Text>

          <View className="flex-row items-baseline mb-6">
            <Text className="text-[28px] font-bold text-brand">
              {mainPriceInfo.price}
            </Text>
            <Text className="text-[16px] font-bold text-neutral-300 ml-1">
              {mainPriceInfo.label}
            </Text>
          </View>

          <View className="h-[1px] bg-neutral-200 my-5" />
          <Text className="text-[16px] font-bold text-text-primary mb-3">
            Descrição
          </Text>
          <Text
            className="text-[14px] leading-[20px] text-text-secondary mb-1"
            numberOfLines={showFullDescription ? undefined : 3}
          >
            {product.description || "Nenhuma descrição disponível."}
          </Text>
          {product.description && (
            <TouchableOpacity
              onPress={() => setShowFullDescription(!showFullDescription)}
            >
              <Text className="text-brand font-bold text-[14px]">
                {showFullDescription ? "Ler menos" : "Ler mais..."}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {similarProducts.length > 0 && (
          <View className="mt-6 mb-4">
            <Text className="text-[16px] font-bold text-text-primary mb-3 px-5">
              Produtos similares
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            >
              {similarProducts.map((item) => {
                const similarPriceInfo = formatDisplayPrice(item);
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => router.push(`/product/${item.id}`)}
                    activeOpacity={0.8}
                    style={{
                      width: 130,
                      backgroundColor: "#FFFFFF",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#F0F0F0",
                      overflow: "hidden",
                    }}
                  >
                    <Image
                      source={{ uri: item.image_url }}
                      style={{ width: 130, height: 110, backgroundColor: "#F8F8F8" }}
                      resizeMode="cover"
                    />
                    <View style={{ padding: 10 }}>
                      <Text
                        numberOfLines={2}
                        style={{ fontSize: 12, color: "#333", fontWeight: "500", lineHeight: 16, minHeight: 32 }}
                      >
                        {formatName(item.name)}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#D91A21", marginTop: 4 }}>
                        {similarPriceInfo.price}
                        <Text style={{ fontSize: 10, fontWeight: "400", color: "#AAAAAA" }}>
                          {" "}{similarPriceInfo.label}
                        </Text>
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-surface p-4 border-t border-neutral-200"
        style={{
          paddingBottom: Platform.OS === "ios" ? 30 : 50,
        }}
      >
        <TouchableOpacity
          className="bg-brand h-[50px] rounded-btn justify-center items-center"
          onPress={handleAddToCart}
          activeOpacity={0.8}
        >
          <Text className="text-brand-on text-[16px] font-bold">
            ADICIONAR AO CARRINHO
          </Text>
        </TouchableOpacity>
      </View>

      <AuthRequiredModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message="Você precisa estar logado para adicionar produtos ao carrinho."
      />
    </View>
  );
}
