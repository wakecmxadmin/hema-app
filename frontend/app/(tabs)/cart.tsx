import React, { useCallback, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Image,
  Animated,
  RefreshControl,
  ActivityIndicator, 
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Toast } from "@/util/toast";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Swipeable } from "react-native-gesture-handler";

import { useCart } from "@/context/CartContext";
import { CartItemSkeleton } from "@/components/CartItemSkeleton";
import { PriceSkeleton } from "@/components/PriceSkeleton";

// --- CART ITEM COMPONENT ---
const CartItemComponent = ({
  item,
  updateItem,
  removeItem,
  validateWeight,
}: any) => {
  const swipeableRef = useRef<Swipeable>(null);

  const basePrice =
    item.product.type === "unit"
      ? item.product.price || 0
      : (item.product.price_per_kg || 0) / 10;

  const itemTotalPrice =
    item.product.type === "unit"
      ? parseFloat((item.product.price || 0).toString()) * (item.quantity || 0)
      : (parseFloat((item.product.price_per_kg || 0).toString()) *
          (item.weight || 0)) /
        1000;

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const formattedUnitPrice = currencyFormatter.format(
    parseFloat(basePrice.toString()),
  );
  const formattedItemTotal = currencyFormatter.format(itemTotalPrice);

  const renderRightActions = (progress: any, dragX: any) => {
    const opacity = dragX.interpolate({
      inputRange: [-60, -10],
      outputRange: [1, 0],
      extrapolate: "clamp",
    });

    return (
      <View className="flex-1 bg-[#E30613] justify-center items-end rounded-[10px]">
        <Animated.View
          style={{
            opacity,
            alignItems: "center",
            justifyContent: "center",
            paddingRight: 24,
            height: "100%",
          }}
        >
          <Ionicons name="trash" size={26} color="#FFF" />
        </Animated.View>
      </View>
    );
  };

  return (
    <View style={{ marginBottom: 15 }}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        onSwipeableOpen={(direction) => {
          if (direction === "right") removeItem(item.id);
        }}
      >
        <View className="flex-row p-[14px] bg-white rounded-[16px] border border-[#F0F0F0] items-center shadow-sm">
          <View className="w-[76px] h-[76px] bg-[#F9F9F9] rounded-[12px] justify-center items-center overflow-hidden">
            {item.product.image_url ? (
              <Image
                source={{ uri: item.product.image_url }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="image-outline" size={20} color="#CCC" />
            )}
          </View>

          <View className="flex-1 ml-[14px] h-[76px] justify-between">
            <View className="flex-row justify-between items-start">
              <View className="flex-1">
                <Text
                  className="text-[15px] text-[#222] font-bold"
                  numberOfLines={1}
                >
                  {item.product.name}
                </Text>
                <Text className="text-[12px] text-[#888] mt-[2px] font-medium">
                  {formattedUnitPrice}{" "}
                  {item.product.type === "unit" ? "/un" : "/100g"}
                </Text>
              </View>
              <Text className="text-[16px] font-extrabold text-[#E30613]">
                {formattedItemTotal}
              </Text>
            </View>

            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center bg-[#F8F8F8] rounded-[20px] p-[3px] border border-[#EEEEEE]">
                <TouchableOpacity
                  onPress={() => {
                    if (item.product.type === "unit") {
                      updateItem(item.id, {
                        quantity: Math.max(1, (item.quantity || 0) - 1),
                      });
                    } else {
                      const newWeight = Math.max(50, (item.weight || 0) - 100);
                      if (newWeight === 50 && item.weight === 50)
                        validateWeight(49);
                      updateItem(item.id, { weight: newWeight });
                    }
                  }}
                  className="w-[28px] h-[28px] rounded-[14px] bg-white items-center justify-center shadow-sm"
                >
                  <Ionicons name="remove" size={16} color="#E30613" />
                </TouchableOpacity>

                <View
                  style={{
                    minWidth: 45,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <Text className="text-[14px] font-bold text-[#1A1A1A]">
                    {item.product.type === "unit" ? item.quantity : item.weight}
                  </Text>
                  {item.product.type !== "unit" && (
                    <Text className="text-[12px] font-bold text-[#888] ml-[1px]">
                      g
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => {
                    if (item.product.type === "unit") {
                      updateItem(item.id, {
                        quantity: (item.quantity || 0) + 1,
                      });
                    } else {
                      updateItem(item.id, { weight: (item.weight || 0) + 100 });
                    }
                  }}
                  className="w-[28px] h-[28px] rounded-[14px] bg-white items-center justify-center shadow-sm"
                >
                  <Ionicons name="add" size={16} color="#E30613" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => removeItem(item.id)}
                className="flex-row items-center p-[6px]"
              >
                <Ionicons name="trash-outline" size={16} color="#999" />
                <Text className="text-[12px] text-[#A0A0A0] font-semibold ml-1">
                  Remover
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Swipeable>
    </View>
  );
};

// --- CART SCREEN ---
export default function CartScreen() {
  const { removeItem, updateItem, refreshCart, items, loading } = useCart();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshCart();
    }, []),
  );

  const optimisticSubtotal = useMemo(() => {
    return items.reduce((acc, item) => {
      const price =
        item.product.type === "unit"
          ? item.product.price || 0
          : item.product.price_per_kg || 0;
      const total =
        item.product.type === "unit"
          ? parseFloat(price.toString()) * (item.quantity || 0)
          : (parseFloat(price.toString()) * (item.weight || 0)) / 1000;
      return acc + total;
    }, 0);
  }, [items]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshCart();
    setRefreshing(false);
  };

  // FUNÇÃO DE REMOÇÃO OTIMISTA
  const handleRemoveItem = (id: string) => {
    // 1. Feedback visual instantâneo
    Toast.show({ type: "success", text1: "Produto removido!" });

    setIsSyncing(true);
    removeItem(id).finally(() => setIsSyncing(false));
  };

  // FUNÇÃO DE UPDATE OTIMISTA
  const handleUpdateItem = (id: string, data: any) => {
    setIsSyncing(true);
    updateItem(id, data).finally(() => setIsSyncing(false));
  };

  function validateWeight(weight: number) {
    if (weight < 50) {
      Toast.show({ type: "error", text1: "O peso mínimo é de 50g" });
      return false;
    }
    return true;
  }

  const showListSkeleton = (loading && items.length === 0) || refreshing;
  const showInitialPriceSkeleton = loading && items.length === 0;

  const renderCartItem = ({ item }: any) => {
    if (showListSkeleton) return <CartItemSkeleton />;
    return (
      <CartItemComponent
        item={item}
        updateItem={handleUpdateItem}
        removeItem={handleRemoveItem}
        validateWeight={validateWeight}
      />
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <View className="flex-1">
        <StatusBar barStyle="dark-content" />

        <View className="flex-1 px-4">
          <View className="py-5 mb-2">
            <Text className="text-2xl font-extrabold text-[#111]">
              Meu Carrinho
            </Text>
          </View>

          <FlatList
            data={showListSkeleton ? [1, 2, 3] : items}
            renderItem={renderCartItem}
            keyExtractor={(item, index) =>
              showListSkeleton ? `skel-${index}` : item.id
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 150, flexGrow: 1 }}
            // Performance: Adicione esta linha para evitar gargalos em listas grandes
            removeClippedSubviews={true}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#E30613"]}
              />
            }
            ListEmptyComponent={
              !showListSkeleton ? (
                <View className="items-center mt-20 flex-1 justify-center">
                  <Ionicons name="cart-outline" size={64} color="#DDD" />
                  <Text className="text-base text-[#BBB] mt-2">
                    Seu carrinho está vazio.
                  </Text>
                </View>
              ) : null
            }
          />
        </View>

        {items.length > 0 && !showListSkeleton && (
          <View
            className="absolute bottom-0 left-0 right-0 p-6 pt-6 bg-white rounded-t-[32px]"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -10 },
              shadowOpacity: 0.08,
              shadowRadius: 15,
              elevation: 20,
            }}
          >
            <View className="flex-row justify-between items-center mb-5">
              <View className="flex-row items-center">
                <Text className="text-[16px] font-bold text-[#666]">
                  Subtotal
                </Text>
                {/* Loader discreto apenas para indicar que está salvando no banco */}
                {isSyncing && (
                  <ActivityIndicator
                    size="small"
                    color="#E30613"
                    style={{ marginLeft: 8 }}
                  />
                )}
              </View>

              {showInitialPriceSkeleton ? (
                <PriceSkeleton />
              ) : (
                <Text
                  // Removido o opacity: 0.5 que dava sensação de lag
                  className="text-[24px] font-extrabold text-[#E30613]"
                >
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(optimisticSubtotal)}
                </Text>
              )}
            </View>

            <TouchableOpacity
              className="bg-[#E30613] h-[56px] rounded-full items-center justify-center flex-row shadow-sm"
              activeOpacity={0.8}
              onPress={() => router.push("/checkout")}
            >
              <Text className="text-white text-[16px] font-bold uppercase tracking-wider">
                Finalizar Compra
              </Text>
              <Ionicons
                name="arrow-forward"
                size={20}
                color="#FFF"
                style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
