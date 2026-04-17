import React, { useCallback, useRef, useState, useMemo } from "react";
import * as Haptics from "expo-haptics";
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
import { AuthRequiredModal } from "@/components/AuthRequiredModal";
import { EmptyState } from "@/components/EmptyState";

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
      <View className="flex-1 bg-brand justify-center items-end rounded-btn">
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
    <View style={{ marginBottom: 12 }}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        onSwipeableOpen={(direction) => {
          if (direction === "right") removeItem(item.id);
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#E0E0E0",
            padding: 12,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          {/* Imagem */}
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 8,
              backgroundColor: "#F5F5F5",
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginRight: 12,
            }}
          >
            {item.product.image_url ? (
              <Image
                source={{ uri: item.product.image_url }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="image-outline" size={22} color="#C2C2C2" />
            )}
          </View>

          {/* Conteúdo */}
          <View style={{ flex: 1 }}>
            {/* Linha 1: Nome + Lixeira */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
              <Text
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: "700",
                  color: "#121212",
                  lineHeight: 20,
                  marginRight: 8,
                }}
                numberOfLines={2}
              >
                {item.product.name}
              </Text>
              <TouchableOpacity
                onPress={() => removeItem(item.id)}
                style={{ padding: 2, marginTop: 1 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={17} color="#C2C2C2" />
              </TouchableOpacity>
            </View>

            {/* Linha 2: Preço unitário */}
            <Text
              style={{
                fontSize: 12,
                color: "#C2C2C2",
                fontWeight: "500",
                marginTop: 3,
              }}
            >
              {formattedUnitPrice}{" "}
              {item.product.type === "unit" ? "/un" : "/100g"}
            </Text>

            {/* Linha 3: Total + Controle de quantidade */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: "#D91A21",
                }}
              >
                {formattedItemTotal}
              </Text>

              {/* Controle de quantidade */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F5F5F5",
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "#E0E0E0",
                  paddingHorizontal: 4,
                  paddingVertical: 3,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
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
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                >
                  <Ionicons name="remove" size={14} color="#D91A21" />
                </TouchableOpacity>

                <View
                  style={{
                    minWidth: 42,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#121212" }}>
                    {item.product.type === "unit" ? item.quantity : item.weight}
                  </Text>
                  {item.product.type !== "unit" && (
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#C2C2C2", marginLeft: 1 }}>
                      g
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    if (item.product.type === "unit") {
                      const maxStock = item.product.stock ?? Infinity;
                      const next = (item.quantity || 0) + 1;
                      if (next > maxStock) {
                        Toast.show({
                          type: "error",
                          text1: `Apenas ${maxStock} unidades disponíveis`,
                        });
                        return;
                      }
                      updateItem(item.id, { quantity: next });
                    } else {
                      const maxStockGrams = (item.product.stock ?? Infinity) * 1000;
                      const next = (item.weight || 0) + 100;
                      if (next > maxStockGrams) {
                        Toast.show({
                          type: "error",
                          text1: `Disponível apenas ${item.product.stock} kg deste produto`,
                        });
                        return;
                      }
                      updateItem(item.id, { weight: next });
                    }
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                >
                  <Ionicons name="add" size={14} color={
                    (item.product.type === "unit"
                      ? (item.quantity || 0) >= (item.product.stock ?? Infinity)
                      : (item.weight || 0) >= ((item.product.stock ?? Infinity) * 1000))
                      ? "#E0E0E0"
                      : "#D91A21"
                  } />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Swipeable>
    </View>
  );
};

// --- CART SCREEN ---
export default function CartScreen() {
  const { removeItem, updateItem, refreshCart, items, loading, isAuthenticated } = useCart();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refreshCart();
      } else {
        setShowAuthModal(true);
      }
    }, [isAuthenticated]),
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

  const handleRemoveItem = async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Toast.show({ type: "success", text1: "Produto removido!" });
    setIsSyncing(true);
    await removeItem(id);
    setIsSyncing(false);
  };

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
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="flex-1">
        <StatusBar barStyle="dark-content" />

        <View className="flex-1 px-4">
          <View className="flex-row items-center" style={{ paddingVertical: 16, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#121212" />
            </TouchableOpacity>
            <Text className="flex-1 text-center text-[20px] font-extrabold text-text-primary">
              Meu Carrinho
            </Text>
            <View style={{ width: 36 }} />
          </View>

          <FlatList
            data={showListSkeleton ? [1, 2, 3] : items}
            renderItem={renderCartItem}
            keyExtractor={(item, index) =>
              showListSkeleton ? `skel-${index}` : item.id
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 150, flexGrow: 1 }}
            removeClippedSubviews={true}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#D91A21"]}
              />
            }
            ListEmptyComponent={
              !showListSkeleton ? (
                <EmptyState
                  icon="cart-outline"
                  title="Carrinho vazio"
                  subtitle="Adicione produtos para continuar comprando."
                />
              ) : null
            }
          />
        </View>

        {items.length > 0 && !showListSkeleton && (
          <View
            className="absolute bottom-0 left-0 right-0 p-6 pt-6 bg-surface"
            style={{
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -10 },
              shadowOpacity: 0.08,
              shadowRadius: 15,
              elevation: 20,
            }}
          >
            <View className="flex-row justify-between items-center mb-5">
              <View className="flex-row items-center">
                <Text className="text-[16px] font-bold text-text-secondary">
                  Subtotal
                </Text>
                {isSyncing && (
                  <ActivityIndicator
                    size="small"
                    color="#D91A21"
                    style={{ marginLeft: 8 }}
                  />
                )}
              </View>

              {showInitialPriceSkeleton ? (
                <PriceSkeleton />
              ) : (
                <Text className="text-[24px] font-extrabold text-brand">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(optimisticSubtotal)}
                </Text>
              )}
            </View>

            <TouchableOpacity
              className="bg-brand h-14 rounded-full items-center justify-center flex-row"
              activeOpacity={0.8}
              onPress={() => router.push("/checkout")}
            >
              <Text className="text-brand-on text-[16px] font-bold uppercase tracking-wider">
                Finalizar Compra
              </Text>
              <Ionicons
                name="arrow-forward"
                size={20}
                color="#FFFFFF"
                style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
      <AuthRequiredModal
        visible={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          router.navigate("/(tabs)/home" as any);
        }}
        message="Você precisa estar logado para acessar o carrinho."
      />
    </SafeAreaView>
  );
}
