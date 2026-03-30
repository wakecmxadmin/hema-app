import React, { useEffect } from "react";
import { View, FlatList, StyleSheet, DimensionValue } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

interface ShimmerProps {
  width: DimensionValue;
  height: DimensionValue;
  borderRadius?: number;
}

const Shimmer = ({ width, height, borderRadius = 0 }: ShimmerProps) => {
  const translateX = useSharedValue(-1);

  useEffect(() => {
    translateX.value = withRepeat(withTiming(1, { duration: 1000 }), -1, false);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(translateX.value, [-1, 1], [-300, 300]),
      },
    ],
  }));

  return (
    <View
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: "#EAEAEA",
        overflow: "hidden",
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={["#EAEAEA", "#F5F5F5", "#EAEAEA"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

export default function SkeletonCard() {
  return (
    <View className="bg-[#FFFFFF] flex-1 overflow-hidden rounded-[12px] border border-[#EAEAEA] shadow-[0_4px_8px_rgba(0,0,0,0.06)]" style={{ elevation: 2 }}>
      {/* Imagem do Produto */}
      <Shimmer width="100%" height={150} borderRadius={0} />

      <View className="flex-1 justify-between p-[12px] pb-[8px] mt-[10px]">
        {/* Título */}
        <Shimmer width="80%" height={14} />

        {/* Espaçador */}
        <View className="mb-[8px]" />

        {/* Subtítulo/Preço */}
        <Shimmer width="40%" height={14} />

        <View className="mb-[12px]" />

        {/* Botão ou rodapé do card */}
        <Shimmer width="100%" height={32} borderRadius={0} />
      </View>
    </View>
  );
}

// 4. A Lista que renderiza os cards
export const SkeletonGrid = () => (
  <FlatList
    data={[1, 2, 3, 4, 5, 6]}
    renderItem={() => <SkeletonCard />}
    keyExtractor={(item) => item.toString()}
    numColumns={2}
    scrollEnabled={false}
    columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 16 }}
    contentContainerStyle={{ paddingHorizontal: 18 }}
  />
);
