import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

type Props = {
  text1?: string;
  text2?: string;
};

export function SuccessToast({ text1, text2 }: Props) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#E9F9F1",
        padding: 16,
        borderRadius: 16,
        marginHorizontal: 20,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#22C55E",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 14,
        }}
      >
        <Ionicons name="checkmark" size={24} color="#FFF" />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: "#14532D",
            fontWeight: "bold",
            fontSize: 14,
          }}
        >
          {text1}
        </Text>

        {text2 ? (
          <Text
            style={{
              color: "#166534",
              fontSize: 12,
              marginTop: 4,
            }}
            numberOfLines={1}
          >
            {text2}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function ErrorToast({ text1, text2 }: Props) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FDECEC",
        padding: 16,
        borderRadius: 16,
        marginHorizontal: 20,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#EF4444",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 14,
        }}
      >
        <Ionicons name="close" size={24} color="#FFF" />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: "#7F1D1D",
            fontWeight: "bold",
            fontSize: 14,
          }}
        >
          {text1}
        </Text>

        {text2 ? (
          <Text
            style={{
              color: "#991B1B",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            {text2}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
