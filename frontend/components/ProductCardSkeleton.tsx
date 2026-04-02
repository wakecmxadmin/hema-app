import React, { useEffect, useRef } from "react";
import { View, Animated } from "react-native";

interface ProductCardSkeletonProps {
  isCarousel?: boolean;
  isFeatured?: boolean;
}

export function ProductCardSkeleton({
  isCarousel = false,
  isFeatured = false,
}: ProductCardSkeletonProps) {
  const shimmerAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
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

  const animatedStyle = {
    opacity: shimmerAnim,
    backgroundColor: "#EBEBEB",
  };

  // ── FEATURED skeleton ───────────────────────────────────────────────────────
  if (isFeatured) {
    return (
      <View
        style={{
          backgroundColor: "#FFF",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#EAEAEA",
          flexDirection: "row",
          overflow: "hidden",
          height: 136,
          elevation: 2,
        }}
      >
        <Animated.View style={[animatedStyle, { width: 132 }]} />
        <View style={{ flex: 1, padding: 14, justifyContent: "space-between" }}>
          <View>
            <Animated.View
              style={[
                animatedStyle,
                { height: 14, borderRadius: 4, width: "90%", marginBottom: 6 },
              ]}
            />
            <Animated.View
              style={[
                animatedStyle,
                { height: 14, borderRadius: 4, width: "70%", marginBottom: 6 },
              ]}
            />
            <Animated.View
              style={[
                animatedStyle,
                { height: 14, borderRadius: 4, width: "50%" },
              ]}
            />
          </View>
          <View>
            <Animated.View
              style={[
                animatedStyle,
                {
                  height: 20,
                  borderRadius: 4,
                  width: "50%",
                  marginBottom: 8,
                },
              ]}
            />
            <Animated.View
              style={[animatedStyle, { height: 34, borderRadius: 8 }]}
            />
          </View>
        </View>
      </View>
    );
  }

  // ── CAROUSEL skeleton ───────────────────────────────────────────────────────
  if (isCarousel) {
    return (
      <View
        style={{
          backgroundColor: "#FFF",
          width: 158,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#EAEAEA",
          overflow: "hidden",
          elevation: 2,
        }}
      >
        <Animated.View
          style={[animatedStyle, { height: 128, width: "100%" }]}
        />
        <View style={{ padding: 10 }}>
          <Animated.View
            style={[
              animatedStyle,
              { height: 12, borderRadius: 4, width: "90%", marginBottom: 5 },
            ]}
          />
          <Animated.View
            style={[
              animatedStyle,
              { height: 12, borderRadius: 4, width: "60%", marginBottom: 8 },
            ]}
          />
          <Animated.View
            style={[
              animatedStyle,
              { height: 18, borderRadius: 4, width: "50%", marginBottom: 8 },
            ]}
          />
          <Animated.View
            style={[animatedStyle, { height: 32, borderRadius: 7 }]}
          />
        </View>
      </View>
    );
  }

  // ── GRID skeleton (default) ─────────────────────────────────────────────────
  return (
    <View
      style={{
        backgroundColor: "#FFF",
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#EAEAEA",
        overflow: "hidden",
        elevation: 2,
      }}
    >
      <Animated.View style={[animatedStyle, { height: 140, width: "100%" }]} />
      <View style={{ padding: 12 }}>
        <Animated.View
          style={[
            animatedStyle,
            { height: 14, borderRadius: 4, width: "90%", marginBottom: 5 },
          ]}
        />
        <Animated.View
          style={[
            animatedStyle,
            { height: 14, borderRadius: 4, width: "60%", marginBottom: 10 },
          ]}
        />
        <Animated.View
          style={[
            animatedStyle,
            { height: 18, borderRadius: 4, width: "45%", marginBottom: 10 },
          ]}
        />
        <Animated.View
          style={[animatedStyle, { height: 36, borderRadius: 8 }]}
        />
      </View>
    </View>
  );
}
