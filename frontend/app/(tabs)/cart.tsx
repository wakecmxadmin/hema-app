import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Image,
  TextInput,
  Animated,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Toast } from "@/util/toast";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Swipeable } from "react-native-gesture-handler";

// NativeWind styling – removed StyleSheet import
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
  const inputRef = useRef<TextInput>(null);
  const swipeableRef = useRef<Swipeable>(null);

  const basePrice =
    item.product.type === "unit"
      ? item.product.price || 0
      : item.product.price_per_kg || 0;

  const itemTotalPrice =
    item.product.type === "unit"
      ? parseFloat(basePrice.toString()) * (item.quantity || 0)
      : (parseFloat(basePrice.toString()) * (item.weight || 0)) / 1000;

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
      <View className="flex-1 bg-[#E31837] justify-center items-end rounded-[10px]">
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
        friction={1.5}
        rightThreshold={80}
        onSwipeableOpen={(direction) => {
          if (direction === "right") {
            removeItem(item.id);
          }
        }}
      >
        <View
          className="flex-row p-[14px] bg-white rounded-[16px] mb-[16px] border border-[#F0F0F0] items-center shadow-sm"
          style={{ marginBottom: 0 }}
        >
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
                  className="text-[15px] text-[#222] font-bold mr-[8px]"
                  numberOfLines={1}
                >
                  {item.product.name}
                </Text>
                <Text className="text-[12px] text-[#888] mt-[2px] font-medium">
                  {formattedUnitPrice}{" "}
                  {item.product.type === "unit" ? "/un" : "/kg"}
                </Text>
              </View>
              <Text className="text-[16px] font-extrabold text-[#E31837]">
                {formattedItemTotal}
              </Text>
            </View>

            <View className="flex-row justify-between items-center">
              <View className="min-w-[32px] items-center justify-center">
                {item.product.type === "unit" ? (
                  <View className="flex-row items-center bg-[#F8F8F8] rounded-[20px] p-[3px] border border-[#EEEEEE]">
                    <TouchableOpacity
                      onPress={() =>
                        updateItem(item.id, {
                          quantity: Math.max(1, (item.quantity || 0) - 1),
                        })
                      }
                      className="w-[28px] h-[28px] rounded-[14px] bg-white items-center justify-center shadow-sm"
                    >
                      <Ionicons name="remove" size={16} color="#E31837" />
                    </TouchableOpacity>

                    <View style={{ minWidth: 30, alignItems: "center" }}>
                      <Text className="text-[14px] font-bold text-[#1A1A1A]">
                        {item.quantity}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() =>
                        updateItem(item.id, {
                          quantity: (item.quantity || 0) + 1,
                        })
                      }
                      className="w-[28px] h-[28px] rounded-[14px] bg-white items-center justify-center shadow-sm"
                    >
                      <Ionicons name="add" size={16} color="#E31837" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="flex-row items-center bg-[#F8F8F8] rounded-[20px] px-[12px] py-[4px] border border-[#EEEEEE] h-[36px]">
                    <TextInput
                      ref={inputRef}
                      className="text-[14px] font-bold text-[#1A1A1A] min-w-[35px] text-right p-0 h-[28px]"
                      keyboardType="numeric"
                      defaultValue={String(item.weight)}
                      maxLength={4}
                      onEndEditing={(e) => {
                        const value = parseInt(e.nativeEvent.text) || 0;
                        if (value < 50) {
                          validateWeight(0);
                          updateItem(item.id, { weight: 50 });
                          if (inputRef.current)
                            inputRef.current.setNativeProps({ text: "50" });
                        } else {
                          updateItem(item.id, { weight: value });
                        }
                      }}
                    />
                    <Text className="text-[13px] font-bold text-[#888] ml-[2px] mr-[10px] mt-[1px]">
                      g
                    </Text>

                    <TouchableOpacity
                      className="w-[24px] h-[24px] rounded-[12px] bg-white items-center justify-center shadow-sm"
                      onPress={() => inputRef.current?.focus()}
                    >
                      <Ionicons name="pencil" size={14} color="#E31837" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TouchableOpacity
                onPress={() => removeItem(item.id)}
                className="flex-row items-center gap-[4px] p-[6px]"
              >
                <Ionicons name="trash-outline" size={16} color="#999" />
                <Text className="text-[12px] text-[#A0A0A0] font-semibold">
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
  const { removeItem, updateItem, refreshCart, items, cart, loading } =
    useCart();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshCart();
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshCart();
    setRefreshing(false);
  };

  const handleRemoveItem = async (id: string) => {
    setIsCalculating(true);
    await removeItem(id);
    setIsCalculating(false);
  };

  const handleUpdateItem = async (id: string, data: any) => {
    setIsCalculating(true);
    await updateItem(id, data);
    setIsCalculating(false);
  };

  function validateWeight(weight: number) {
    if (weight < 50) {
      Toast.show({ type: "error", text1: "O peso mínimo é de 50g" });
      return false;
    }
    return true;
  }

  const showListSkeleton = (loading && items.length === 0) || refreshing;
  const showPriceSkeleton = loading || refreshing || isCalculating;

  const renderCartItem = ({ item }: any) => {
    if (showListSkeleton) {
      return <CartItemSkeleton />;
    }
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

        {/* 1. Área da Lista que ocupa o espaço flexível */}
        <View className="flex-1 px-4">
          <View className="py-5 mb-2">
            <Text
              className="text-2xl font-extrabold text-[#111]"
              style={{ letterSpacing: -0.5 }}
            >
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
            /* Aumentei o padding bottom para garantir que o último item não fique escondido sob o rodapé */
            contentContainerStyle={{ paddingBottom: 120, flexGrow: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={showListSkeleton ? ["transparent"] : ["#E31837"]}
                tintColor={showListSkeleton ? "transparent" : "#E31837"}
              />
            }
            ListEmptyComponent={
              showListSkeleton ? null : (
                <View className="items-center mt-15 flex-1 justify-center">
                  <Ionicons name="cart-outline" size={64} color="#DDD" />
                  <Text className="text-base text-[#BBB] mt-2">
                    Seu carrinho está vazio.
                  </Text>
                </View>
              )
            }
          />
        </View>

        {/* 2. Área do Rodapé: Fixa na base usando absolute position */}
        {items.length > 0 && !showListSkeleton && (
          <View
            className="absolute bottom-0 left-0 right-0 p-6 pt-6 bg-white rounded-t-[32px]"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -10 },
              shadowOpacity: 0.08,
              shadowRadius: 15,
              elevation: 20, // Aumentei a elevação no Android
            }}
          >
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-[16px] font-bold text-[#666]">
                Subtotal
              </Text>
              {showPriceSkeleton ? (
                <PriceSkeleton />
              ) : (
                <Text className="text-[24px] font-extrabold text-[#E31837]">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(parseFloat(cart?.total_price || "0"))}
                </Text>
              )}
            </View>

            <TouchableOpacity
              className="bg-[#E31837] h-[56px] rounded-full items-center justify-center flex-row shadow-sm"
              activeOpacity={0.8}
              onPress={() => router.push("/checkout")}
              disabled={showPriceSkeleton}
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
