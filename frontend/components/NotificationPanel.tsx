import React, { useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  ScrollView,
  TouchableWithoutFeedback,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Notification {
  id: string;
  icon: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    icon: "check-circle-outline",
    title: "Pedido confirmado",
    body: "Seu pedido #2481 foi confirmado e está sendo preparado.",
    time: "Agora",
    read: false,
  },
  {
    id: "2",
    icon: "truck-delivery-outline",
    title: "Saiu para entrega",
    body: "Seu pedido #2475 saiu para entrega. Fique de olho!",
    time: "30 min",
    read: false,
  },
  {
    id: "3",
    icon: "star-outline",
    title: "Avalie seu pedido",
    body: "Como foi sua experiência com o pedido #2470? Deixe sua avaliação.",
    time: "Ontem",
    read: true,
  },
  {
    id: "4",
    icon: "package-variant-closed",
    title: "Pedido entregue",
    body: "Seu pedido #2465 foi entregue com sucesso. Bom proveito!",
    time: "2 dias",
    read: true,
  },
];

interface NotificationPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function NotificationPanel({ visible, onClose }: NotificationPanelProps) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 60,
          friction: 12,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 400,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.read).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          className="absolute inset-0 bg-black/50"
          style={{ opacity: backdropAnim }}
        />
      </TouchableWithoutFeedback>

      {/* Panel */}
      <Animated.View
        className="absolute bottom-0 left-0 right-0 bg-white"
        style={{
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          maxHeight: "72%",
          transform: [{ translateY: slideAnim }],
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 16,
        }}
      >
        {/* Drag handle */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-[#E0E0E0]" />
        </View>

        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
          <View className="flex-row items-center gap-2">
            <Text className="text-[17px] font-[800] text-[#1A1A1A]">
              Notificações
            </Text>
            {unreadCount > 0 && (
              <View className="bg-[#E30613] rounded-full px-2 py-[2px]">
                <Text className="text-[11px] font-[700] text-white">
                  {unreadCount}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={onClose}
            className="w-8 h-8 rounded-full bg-[#F5F5F5] items-center justify-center"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="close" size={18} color="#555" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} className="pb-8">
          {MOCK_NOTIFICATIONS.map((notif) => (
            <View
              key={notif.id}
              className={`flex-row items-start px-5 py-4 border-b border-[#F8F8F8] ${
                !notif.read ? "bg-[#FFF5F5]" : "bg-white"
              }`}
            >
              <View
                className={`w-10 h-10 rounded-full items-center justify-center mr-3 flex-shrink-0 ${
                  !notif.read ? "bg-[#FFE8EA]" : "bg-[#F5F5F5]"
                }`}
              >
                <MaterialCommunityIcons
                  name={notif.icon as any}
                  size={19}
                  color={!notif.read ? "#E30613" : "#888888"}
                />
              </View>

              <View className="flex-1">
                <View className="flex-row items-center justify-between mb-[3px]">
                  <Text
                    className="text-[13px] font-[700] text-[#1A1A1A] flex-1 mr-2"
                    numberOfLines={1}
                  >
                    {notif.title}
                  </Text>
                  <Text className="text-[11px] text-[#AAAAAA] flex-shrink-0">
                    {notif.time}
                  </Text>
                </View>
                <Text
                  className="text-[12px] text-[#666666] leading-[17px]"
                  numberOfLines={2}
                >
                  {notif.body}
                </Text>
              </View>

              {!notif.read && (
                <View className="w-2 h-2 rounded-full bg-[#E30613] mt-1.5 ml-2 flex-shrink-0" />
              )}
            </View>
          ))}

          <View className="h-8" />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
