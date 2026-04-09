import React from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

interface AuthRequiredModalProps {
  visible: boolean;
  onClose: () => void;
  message?: string;
}

export function AuthRequiredModal({
  visible,
  onClose,
  message,
}: AuthRequiredModalProps) {
  const router = useRouter();

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
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 32,
        }}
      >
        <View
          style={{
            width: "100%",
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            padding: 28,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: "#FEF2F2",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <MaterialCommunityIcons
              name="lock-outline"
              size={28}
              color="#D91A21"
            />
          </View>

          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: "#121212",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Login necessário
          </Text>

          <Text
            style={{
              fontSize: 14,
              color: "#666666",
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 28,
            }}
          >
            {message ||
              "Você precisa estar logado para acessar esta funcionalidade."}
          </Text>

          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push("/auth");
            }}
            activeOpacity={0.85}
            style={{
              width: "100%",
              height: 52,
              borderRadius: 12,
              backgroundColor: "#D91A21",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>
              Entrar na conta
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            style={{
              width: "100%",
              height: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#999999" }}>
              Agora não
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
