import React, { useEffect, useRef } from "react";
import { View, Animated } from "react-native";

export function ProductCardSkeleton({ isCarousel = false }) {
  // Criamos a referência para a animação
  const shimmerAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Definimos uma animação em loop de "vai e vem" (pulsação)
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [shimmerAnim]);

  // Estilo animado para aplicar nos blocos cinzas
  const animatedStyle = {
    opacity: shimmerAnim,
    backgroundColor: "#EBEBEB", // Um cinza um pouco mais moderno
  };

  return (
    <View
      className={`bg-[#FFFFFF] flex-1 overflow-hidden rounded-[12px] border border-[#EAEAEA] shadow-[0_4px_8px_rgba(0,0,0,0.06)] ${isCarousel ? "w-[180px] mb-0" : ""}`}
      style={{ elevation: 2 }}
    >
      {/* Imagem Animada */}
      <Animated.View style={[animatedStyle]} className="h-[150px] w-full border-b border-[#F0F0F0] items-center justify-center p-[10px]" />

      <View className="flex-1 justify-between p-[12px] pb-[8px]">
        <View>
          {/* Linha de Título 1 */}
          <Animated.View
            style={[
              {
                height: 14,
                borderRadius: 4,
                width: "90%",
                marginBottom: 6,
              },
              animatedStyle,
            ]}
          />
          {/* Linha de Título 2 */}
          <Animated.View
            style={[
              {
                height: 14,
                borderRadius: 4,
                width: "60%",
                marginBottom: 12,
              },
              animatedStyle,
            ]}
          />
          {/* Preço */}
          <Animated.View
            style={[
              {
                height: 20,
                borderRadius: 4,
                width: "40%",
              },
              animatedStyle,
            ]}
          />
        </View>

        {/* Botão Adicionar */}
        <Animated.View
          style={[
            {
              height: 32,
              borderRadius: 100,
              marginTop: 12,
            },
            animatedStyle,
          ]}
        />
      </View>
    </View>
  );
}
