import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Product } from "@/types/product";
import { optimizedImage } from "@/util/image-url";

/** Passo do peso em gramas — mesma regra do carrinho e do backend. */
const WEIGHT_STEP = 100;
const ITEM_HEIGHT = 52;
const VISIBLE_ITEMS = 5;
const LIST_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const LIST_PADDING = (LIST_HEIGHT - ITEM_HEIGHT) / 2;
/** Teto de opções na roda; acima disso o cliente ajusta pelo carrinho. */
const MAX_OPTIONS = 999;
/** Distância que o painel percorre ao entrar. */
const SHEET_TRAVEL = 480;

export type QuantitySelection = { quantity?: number; weight?: number };

interface QuantityPickerSheetProps {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  onConfirm: (product: Product, selection: QuantitySelection) => void;
}

const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatName = (name: string) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Unidade: 1, 2, 3… até o estoque.
 * Peso: 100g, 200g, 300g… até o estoque (o backend recusa abaixo de 100g).
 */
export function getQuantityOptions(product: Product): number[] {
  const stock = product.stock ?? 0;

  if (product.type === "unit") {
    const count = Math.min(Math.max(Math.floor(stock), 0), MAX_OPTIONS);
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  const steps = Math.floor((stock * 1000) / WEIGHT_STEP);
  const count = Math.min(Math.max(steps, 0), MAX_OPTIONS);
  return Array.from({ length: count }, (_, i) => (i + 1) * WEIGHT_STEP);
}

function optionLabel(product: Product, value: number) {
  if (product.type === "unit") return { value: String(value), suffix: "un" };
  if (value >= 1000) {
    return {
      value: (value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
      suffix: "kg",
    };
  }
  return { value: String(value), suffix: "g" };
}

export function QuantityPickerSheet({
  product,
  visible,
  onClose,
  onConfirm,
}: QuantityPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<number>>(null);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);

  // Layout animations do Reanimated não disparam de forma confiável dentro de
  // um Modal nativo, então a entrada é animada por shared value.
  const progress = useSharedValue(0);
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * SHEET_TRAVEL }],
  }));

  useEffect(() => {
    progress.value = visible
      ? withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) })
      : 0;
  }, [visible]);

  const options = useMemo(() => (product ? getQuantityOptions(product) : []), [product]);

  // Toda abertura volta para a opção padrão (1 un / 100 g).
  useEffect(() => {
    if (!visible) return;
    indexRef.current = 0;
    setIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [visible, product?.id]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!options.length) return;
      const raw = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
      const next = Math.min(Math.max(raw, 0), options.length - 1);
      if (next !== indexRef.current) {
        indexRef.current = next;
        setIndex(next);
        Haptics.selectionAsync();
      }
    },
    [options.length],
  );

  const scrollToIndex = useCallback((target: number) => {
    listRef.current?.scrollToOffset({
      offset: target * ITEM_HEIGHT,
      animated: true,
    });
  }, []);

  const renderItem = useCallback(
    ({ item, index: position }: { item: number; index: number }) => {
      if (!product) return null;
      const distance = Math.abs(position - index);
      const isSelected = distance === 0;
      const label = optionLabel(product, item);

      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => scrollToIndex(position)}
          style={{
            height: ITEM_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            opacity: distance === 0 ? 1 : distance === 1 ? 0.45 : 0.18,
            transform: [
              { scale: distance === 0 ? 1 : distance === 1 ? 0.88 : 0.76 },
            ],
          }}
        >
          <Text
            style={{
              fontSize: 26,
              fontWeight: isSelected ? "800" : "600",
              color: "#1A1613",
              letterSpacing: -0.6,
            }}
          >
            {label.value}
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: isSelected ? "#8A8079" : "#C2C2C2",
            }}
          >
            {label.suffix}
          </Text>
        </TouchableOpacity>
      );
    },
    [index, product, scrollToIndex],
  );

  if (!product) return null;

  const isUnit = product.type === "unit";
  const selectedValue = options[index] ?? options[0] ?? 0;
  const total = isUnit
    ? (product.price || 0) * selectedValue
    : ((product.price_per_kg || 0) / 1000) * selectedValue;
  const unitPrice = isUnit
    ? product.price || 0
    : (product.price_per_kg || 0) / 10;
  const unitLabel = isUnit ? "/un" : "/100g";
  const imageUri = product.image_url?.trim() || null;

  const handleConfirm = () => {
    if (!selectedValue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm(
      product,
      isUnit ? { quantity: selectedValue } : { weight: selectedValue },
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(26,22,19,0.45)",
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />

        <Animated.View
          style={[
            panelStyle,
            {
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 10,
              paddingHorizontal: 20,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
        >
          <View
            style={{
              alignSelf: "center",
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#EAE3D7",
              marginBottom: 18,
            }}
          />

          {/* Produto */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                overflow: "hidden",
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "#F2EBDF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {imageUri ? (
                <Image
                  source={{
                    uri:
                      optimizedImage(imageUri, { width: 160, resize: "cover" }) ??
                      imageUri,
                  }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="disk"
                  recyclingKey={imageUri}
                />
              ) : (
                <MaterialCommunityIcons
                  name="image-off-outline"
                  size={22}
                  color="#8A8079"
                />
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={2}
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: "#1A1613",
                  lineHeight: 19,
                  letterSpacing: -0.2,
                }}
              >
                {formatName(product.name)}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: "#8A8079",
                  marginTop: 2,
                }}
              >
                {formatPrice(unitPrice)}
                {unitLabel}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="close" size={22} color="#8A8079" />
            </TouchableOpacity>
          </View>

          {/* Roda de seleção */}
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: "#8A8079",
              letterSpacing: 0.6,
              textTransform: "uppercase",
              marginTop: 20,
            }}
          >
            {isUnit ? "Quantidade" : "Peso"}
          </Text>

          <View style={{ height: LIST_HEIGHT, marginTop: 6 }}>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: LIST_PADDING,
                height: ITEM_HEIGHT,
                borderRadius: 16,
                backgroundColor: "#FAF6F0",
                borderWidth: 1,
                borderColor: "#EAE3D7",
              }}
            />

            <FlatList
              ref={listRef}
              data={options}
              extraData={index}
              keyExtractor={(item) => String(item)}
              renderItem={renderItem}
              getItemLayout={(_, i) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * i,
                index: i,
              })}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              snapToAlignment="start"
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={handleScroll}
              contentContainerStyle={{ paddingVertical: LIST_PADDING }}
            />

            <LinearGradient
              pointerEvents="none"
              colors={["#FFFFFF", "rgba(255,255,255,0)"]}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: LIST_PADDING,
              }}
            />
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0)", "#FFFFFF"]}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: LIST_PADDING,
              }}
            />
          </View>

          {/* Total + confirmação */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginTop: 14,
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#8A8079" }}>
              Total
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: "#1A1613",
                letterSpacing: -0.5,
              }}
            >
              {formatPrice(total)}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!selectedValue}
            onPress={handleConfirm}
            style={{
              borderRadius: 999,
              paddingVertical: 16,
              backgroundColor: selectedValue ? "#1A1613" : "#C2C2C2",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: "#FFFFFF",
                letterSpacing: 0.3,
              }}
            >
              Adicionar ao carrinho
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
