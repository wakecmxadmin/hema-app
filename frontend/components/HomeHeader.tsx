import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated as RNAnimated,
  ScrollView,
  Image,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useNotifications } from "@/context/NotificationsContext";
import { formatNotificationTime } from "@/services/notifications";
import { SearchBar } from "@/components/SearchBar";

interface HomeHeaderProps {
  onSearch: (query: string) => void;
  headerOffset: SharedValue<number>;
}


const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeHeader({ onSearch, headerOffset }: HomeHeaderProps) {
  const { notifications, unreadCount, dismiss, markAllRead } = useNotifications();
  const [userName, setUserName] = useState<string | null>(null);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const fadeAnim = useRef(new RNAnimated.Value(0)).current;
  const notifDropAnim = useRef(new RNAnimated.Value(0)).current;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem("@hema_user_name").then((name) => {
      if (!mounted) return;
      if (name) {
        setUserName(name.split(" ")[0]);
      }
      RNAnimated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    RNAnimated.timing(notifDropAnim, {
      toValue: showNotifDropdown ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showNotifDropdown]);

  const toggleNotifDropdown = () => {
    setShowNotifDropdown((v) => {
      if (!v) markAllRead();
      return !v;
    });
  };
  const closeAll = () => setShowNotifDropdown(false);

  const dropdownStyle = (anim: RNAnimated.Value) => ({
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [-10, 0],
        }),
      },
    ],
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -headerOffset.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          elevation: 8,
          backgroundColor: "#D91A21",
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 10,
        },
        animatedStyle,
      ]}
    >
      <View
        style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }}
      >
        <View className="flex-row items-center gap-3 mb-6">
          <Image
            source={require("@/assets/images/adaptive-icon.png")}
            style={{ width: 48, height: 48, borderRadius: 24 }}
            resizeMode="cover"
          />

          <View style={{ flex: 1, justifyContent: "center", marginLeft: 4 }}>
            <Text
              style={{
                fontSize: 12, 
                fontWeight: "600",
                color: "rgba(255,255,255,0.75)",
                textTransform: "uppercase",
                letterSpacing: 1, 
                marginBottom: -2, 
              }}
            >
              {greeting}
            </Text>

            <RNAnimated.View style={{ opacity: fadeAnim }}>
              <Text
                style={{
                  fontSize: 20, 
                  fontWeight: "700",
                  color: "#FFF",
                  letterSpacing: -0.5, 
                }}
                numberOfLines={1}
              >
                {userName ?? "Seja Bem vindo!"}
              </Text>
            </RNAnimated.View>
          </View>

          <TouchableOpacity
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: showNotifDropdown
                ? "rgba(255,255,255,0.32)"
                : "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
            }}
            activeOpacity={0.7}
            onPress={toggleNotifDropdown}
          >
            <MaterialCommunityIcons
              name="bell-outline"
              size={22}
              color="#FFF"
            />
            {unreadCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#FFF",
                  borderWidth: 1.5,
                  borderColor: "#D91A21",
                }}
              />
            )}
          </TouchableOpacity>
        </View>

        <SearchBar
          onSearch={onSearch}
          height={50}
          borderRadius={25}
          elevation={6}
          backgroundColor="#FFF"
          iconColor="#BBBBBB"
          fontSize={15}
          textColor="#333333"
          showWrapper={false}
        />
      </View>

      {/* ── Backdrop CORRIGIDO PARA O IOS ───────────────────────────────── */}
      {showNotifDropdown && (
        <TouchableOpacity
          activeOpacity={1}
          style={{
            position: "absolute",
            top: 0,
            left: -100,
            width: SCREEN_WIDTH * 2,
            height: SCREEN_HEIGHT * 2,
            zIndex: 30,
            backgroundColor: "transparent",
          }}
          onPress={closeAll}
        />
      )}

      {/* ── Notification dropdown ───────────────────────────────────────── */}
      <RNAnimated.View
        pointerEvents={showNotifDropdown ? "auto" : "none"}
        style={[
          {
            position: "absolute",
            top: 72,
            left: 16,
            right: 16,
            backgroundColor: "#FFF",
            borderRadius: 18,
            zIndex: 40,
            elevation: 20,
            maxHeight: 340,
            overflow: "hidden",
            flexDirection: "column",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.14,
            shadowRadius: 14,
          },
          dropdownStyle(notifDropAnim),
        ]}
      >
        <View
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#F5F5F5",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "800", color: "#1A1A1A" }}
              >
                Notificações
              </Text>
              {unreadCount > 0 && (
                <View
                  style={{
                    backgroundColor: "#D91A21",
                    borderRadius: 10,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{ fontSize: 11, fontWeight: "700", color: "#FFF" }}
                  >
                    {unreadCount}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={() => setShowNotifDropdown(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: "#F5F5F5",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialCommunityIcons name="close" size={15} color="#555" />
            </TouchableOpacity>
          </View>

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {notifications.length === 0 ? (
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: 28,
                  paddingHorizontal: 16,
                }}
              >
                <MaterialCommunityIcons
                  name="bell-off-outline"
                  size={32}
                  color="#D0D0D0"
                />
                <Text
                  style={{ fontSize: 13, color: "#AAAAAA", marginTop: 8 }}
                >
                  Nenhuma notificação
                </Text>
              </View>
            ) : (
              notifications.map((notif) => (
                <View
                  key={notif.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    marginHorizontal: 8,
                    marginTop: 4,
                    borderRadius: 12,
                    backgroundColor: !notif.read ? "#FFF5F5" : "#FFF",
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: !notif.read ? "#FFE8EA" : "#F5F5F5",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                      flexShrink: 0,
                    }}
                  >
                    <MaterialCommunityIcons
                      name={notif.icon as any}
                      size={17}
                      color={!notif.read ? "#D91A21" : "#888888"}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 3,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: "#1A1A1A",
                          flex: 1,
                          marginRight: 8,
                        }}
                        numberOfLines={1}
                      >
                        {notif.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#AAAAAA",
                          flexShrink: 0,
                        }}
                      >
                        {formatNotificationTime(notif.createdAt)}
                      </Text>
                    </View>
                    <Text
                      style={{ fontSize: 12, color: "#666666", lineHeight: 17 }}
                      numberOfLines={2}
                    >
                      {notif.body}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => dismiss(notif.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginLeft: 8, marginTop: 2, flexShrink: 0 }}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={14}
                      color="#CCCCCC"
                    />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </RNAnimated.View>
    </Animated.View>
  );
}
