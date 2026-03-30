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
import { formatProductPrice } from "@/util/formatProductPrice";
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

  const headerPositionStyle = {
    top: Platform.OS === "ios" ? 50 : 30,
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white">
        <TouchableOpacity
          className="absolute left-4 z-10 bg-white rounded-[20px] p-2"
          style={headerPositionStyle}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <ProductDetailsSkeleton />
      </View>
    );
  }

  if (!product) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <Text className="text-[#333]">Produto não encontrado.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-5">
          <Text className="text-[#E31837] font-bold">Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleAddToCart = async () => {
    if (!product) return;

    const payload = {
      product_id: product.id,
      price: product.type === "unit" ? product.price : product.price_per_kg,
      ...(product.type === "unit" ? { quantity: 1 } : { weight: 50 }),
    };

    await addItem(payload);
  };

  return (
    <View className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" />

      {/* Botão de Voltar Flutuante sobre a Imagem */}
      <TouchableOpacity
        className="absolute left-4 z-10 bg-white/80 rounded-[20px] p-2"
        style={headerPositionStyle}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>

      <ScrollView
        contentContainerClassName="pb-[100px]"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#E31837"]}
            tintColor="#E31837"
          />
        }
      >
        {/* IMAGEM DO PRODUTO */}
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

        {/* DETALHES */}
        <View className="p-5">
          <Text className="text-[#E31837] text-[12px] font-bold uppercase mb-2">
            Produto
          </Text>
          <Text className="text-[22px] font-bold text-[#1A1A1A] mb-3">
            {product.name}
          </Text>

          <View className="flex-row items-baseline mb-6">
            <Text className="text-[28px] font-bold text-[#E31837]">
              {formatProductPrice(product)}
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
            {product.description ||
              "Nenhuma descrição disponível para este produto."}
          </Text>

          {product.description && (
            <TouchableOpacity
              onPress={() => setShowFullDescription(!showFullDescription)}
              className="py-1"
            >
              <Text className="text-[#E31837] font-bold text-[14px]">
                {showFullDescription ? "Ler menos" : "Ler mais..."}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* PRODUTOS SIMILARES */}
        {similarProducts.length > 0 && (
          <View className="m-5">
            <Text className="text-[16px] font-bold mb-2.5">
              Produtos similares
            </Text>

            {similarProducts.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => router.push(`/product/${item.id}`)}
                className="flex-row mb-3"
              >
                <Image
                  source={{ uri: item.image_url }}
                  className="w-[60px] h-[60px] rounded-lg"
                />
                <View className="ml-2.5 flex-1">
                  <Text numberOfLines={2}>{item.name}</Text>
                  <Text className="font-bold">{formatProductPrice(item)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* RODAPÉ FIXO */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white p-4 border-t border-[#EAEAEA] flex-row gap-[15px]"
        style={{ paddingBottom: Platform.OS === "ios" ? 30 : 16 }}
      >
        <TouchableOpacity
          className="flex-1 bg-[#E31837] h-[50px] rounded-lg justify-center items-center"
          activeOpacity={0.8}
          onPress={handleAddToCart}
        >
          <Text className="text-white text-[16px] font-bold">
            ADICIONAR AO CARRINHO
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
