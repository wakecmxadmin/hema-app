import React, { useEffect, useRef } from "react";
import { Animated, ViewStyle, StyleProp } from "react-native";

interface PulseViewProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  className?: string;
}

export function PulseView({ style, children, className }: PulseViewProps) {
  // 1. Criamos a referência da animação (0.4 = mais escuro / 1 = mais claro)
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // 2. Criamos o loop de pulsação infinito
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true, // Garante alta performance
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  return (
    <Animated.View
      className={className}
      style={[
        style,
        {
          opacity: pulseAnim,
          backgroundColor: "#E0E0E0", // A cor base do seu Skeleton
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
