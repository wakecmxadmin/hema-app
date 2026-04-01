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

export default function ProductDetailsScreen() {
  const router = useRouter();
  const { addItem } = useCart();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // --- NOVA FUNÇÃO: Capitalizar primeira letra de cada palavra ---
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
    const payload = {
      product_id: product.id,
      price: product.type === "unit" ? product.price : product.price_per_kg,
      ...(product.type === "unit" ? { quantity: 1 } : { weight: 100 }),
    };
    await addItem(payload);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white">
        <TouchableOpacity
          className="absolute left-4 z-10 bg-white rounded-[20px] p-2"
          style={{ top: Platform.OS === "ios" ? 50 : 30 }}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <ProductDetailsSkeleton />
      </View>
    );
  }

  if (!product) return null;

  const mainPriceInfo = formatDisplayPrice(product);

  return (
    <View className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" />

      <TouchableOpacity
        className="absolute left-4 z-10 bg-white/80 rounded-[20px] p-2"
        style={{ top: Platform.OS === "ios" ? 50 : 30 }}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>

      <ScrollView
        contentContainerClassName="pb-[120px]" // Aumentado para não cobrir o conteúdo final
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#E31837"]}
          />
        }
      >
        <View className="w-full aspect-square bg-white justify-center items-center pt-[70px]">
          {product.image_url ? (
            <Image
              source={{ uri: product.image_url.trim() }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="image-outline" size={60} color="#DDD" />
          )}
        </View>

        <View className="p-5">
          <Text className="text-[#E31837] text-[12px] font-bold uppercase mb-2">
            Produto
          </Text>

          {/* NOME FORMATADO */}
          <Text className="text-[22px] font-bold text-[#1A1A1A] mb-3">
            {formatName(product.name)}
          </Text>

          <View className="flex-row items-baseline mb-6">
            <Text className="text-[28px] font-bold text-[#E31837]">
              {mainPriceInfo.price}
            </Text>
            <Text className="text-[16px] font-bold text-[#888] ml-1">
              {mainPriceInfo.label}
            </Text>
          </View>

          <View className="h-[1px] bg-[#EAEAEA] my-5" />
          <Text className="text-[16px] font-bold text-[#333] mb-2.5">
            Descrição
          </Text>
          <Text
            className="text-[14px] leading-[20px] text-[#666] mb-1"
            numberOfLines={showFullDescription ? undefined : 3}
          >
            {product.description || "Nenhuma descrição disponível."}
          </Text>
          {product.description && (
            <TouchableOpacity
              onPress={() => setShowFullDescription(!showFullDescription)}
            >
              <Text className="text-[#E31837] font-bold text-[14px]">
                {showFullDescription ? "Ler menos" : "Ler mais..."}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {similarProducts.length > 0 && (
          <View className="m-5">
            <Text className="text-[16px] font-bold mb-2.5">
              Produtos similares
            </Text>
            {similarProducts.map((item) => {
              const similarPriceInfo = formatDisplayPrice(item);
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => router.push(`/product/${item.id}`)}
                  className="flex-row mb-4 items-center"
                >
                  <Image
                    source={{ uri: item.image_url }}
                    className="w-[60px] h-[60px] rounded-lg"
                  />
                  <View className="ml-3 flex-1">
                    {/* NOME FORMATADO NOS SIMILARES TAMBÉM */}
                    <Text numberOfLines={1} className="text-[#333] font-medium">
                      {formatName(item.name)}
                    </Text>
                    <Text className="font-bold text-[#E31837]">
                      {similarPriceInfo.price}
                      <Text className="text-[11px] text-[#888]">
                        {" "}
                        {similarPriceInfo.label}
                      </Text>
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* RODAPÉ COM AJUSTE PARA ANDROID */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white p-4 border-t border-[#EAEAEA]"
        style={{
          // Aumentamos o padding para 32 no Android para subir o botão
          paddingBottom: Platform.OS === "ios" ? 30 : 50,
        }}
      >
        <TouchableOpacity
          className="bg-[#E31837] h-[50px] rounded-lg justify-center items-center shadow-sm"
          onPress={handleAddToCart}
          activeOpacity={0.8}
        >
          <Text className="text-white text-[16px] font-bold">
            ADICIONAR AO CARRINHO
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
