import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface DeliveryScheduleModalProps {
  visible: boolean;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}

const RULES: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  text: React.ReactNode;
}[] = [
  {
    icon: "calendar-check",
    text: (
      <>
        <Text style={{ fontWeight: "700" }}>Segunda a sexta</Text>, entregas
        entre <Text style={{ fontWeight: "700" }}>14h e 21h</Text>.
      </>
    ),
  },
  {
    icon: "clock-fast",
    text: (
      <>
        Pedidos feitos até <Text style={{ fontWeight: "700" }}>12h</Text> são
        entregues no mesmo dia. Depois disso, no próximo dia útil.
      </>
    ),
  },
  {
    icon: "calendar-remove",
    text: (
      <>
        <Text style={{ fontWeight: "700" }}>
          Sábado, domingo e feriado não têm entrega.
        </Text>
      </>
    ),
  },
];

export function DeliveryScheduleModal({
  visible,
  onConfirm,
  onClose,
  loading = false,
}: DeliveryScheduleModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={loading ? undefined : onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
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
              name="truck-delivery-outline"
              size={30}
              color="#D91A21"
            />
          </View>

          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: "#121212",
              textAlign: "center",
              marginBottom: 6,
            }}
          >
            Horários de entrega
          </Text>

          <Text
            style={{
              fontSize: 14,
              color: "#666666",
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 20,
            }}
          >
            Confira antes de confirmar seu pedido.
          </Text>

          <View style={{ width: "100%", marginBottom: 24 }}>
            {RULES.map((rule, index) => (
              <View
                key={rule.icon}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  backgroundColor: "#FAF6F0",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: index === RULES.length - 1 ? 0 : 10,
                }}
              >
                <MaterialCommunityIcons
                  name={rule.icon}
                  size={20}
                  color="#D91A21"
                  style={{ marginTop: 1 }}
                />
                <Text
                  style={{
                    flex: 1,
                    marginLeft: 12,
                    fontSize: 14,
                    lineHeight: 20,
                    color: "#121212",
                  }}
                >
                  {rule.text}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={onConfirm}
            activeOpacity={0.85}
            disabled={loading}
            style={{
              width: "100%",
              height: 52,
              borderRadius: 12,
              backgroundColor: "#D91A21",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text
                style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}
              >
                Entendi, confirmar pedido
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            disabled={loading}
            style={{
              width: "100%",
              height: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#999999" }}>
              Voltar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
