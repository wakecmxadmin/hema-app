import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  ScrollView,
  Image,
  Dimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Address, getAddresses } from "@/services/addresses";

interface HomeHeaderProps {
  onSearch: (query: string) => void;
}

// ─── Notification data ────────────────────────────────────────────────────────

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

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeHeader({ onSearch }: HomeHeaderProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const addressDropAnim = useRef(new Animated.Value(0)).current;
  const notifDropAnim = useRef(new Animated.Value(0)).current;
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    getAddresses().then((response) => {
      if (!mounted) return;
      if (response.success && response.data && response.data.length > 0) {
        setAddresses(response.data);
        const defaultAddr =
          response.data.find((a) => a.is_default) || response.data[0];
        setSelectedAddress(defaultAddr);
      }
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Animate address dropdown
  useEffect(() => {
    Animated.timing(addressDropAnim, {
      toValue: showAddressDropdown ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showAddressDropdown]);

  // Animate notification dropdown
  useEffect(() => {
    Animated.timing(notifDropAnim, {
      toValue: showNotifDropdown ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showNotifDropdown]);

  const toggleAddressDropdown = () => {
    if (addresses.length === 0) return;
    setShowNotifDropdown(false); // close the other
    setShowAddressDropdown((v) => !v);
  };

  const toggleNotifDropdown = () => {
    setShowAddressDropdown(false); // close the other
    setShowNotifDropdown((v) => !v);
  };

  const closeAll = () => {
    setShowAddressDropdown(false);
    setShowNotifDropdown(false);
  };

  const handleSearchChange = (text: string) => {
    setSearchValue(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => onSearch(text), 500);
  };

  const handleSearchClear = () => {
    setSearchValue("");
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    onSearch("");
  };

  const handleSearchSubmit = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    onSearch(searchValue);
  };

  const addressLabel = selectedAddress
    ? selectedAddress.label ||
      `${selectedAddress.street}, ${selectedAddress.number}`
    : null;

  const addressDetail = selectedAddress
    ? `${selectedAddress.street}, ${selectedAddress.number}`
    : null;

  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.read).length;
  const anyDropdownOpen = showAddressDropdown || showNotifDropdown;

  // Shared dropdown animation helpers
  const dropdownStyle = (anim: Animated.Value) => ({
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

  return (
    <View style={{ zIndex: 50, backgroundColor: "#FFFFFF" }}>
      {/* ── Hero block ─────────────────────────────────────────────────── */}
      <View
        className="bg-[#E30613] px-4 pt-4 pb-6"
        style={{
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          zIndex: 10,
        }}
      >
        {/* Row: logo + address + bell */}
        <View className="flex-row items-center gap-3 mb-6 z-20">
          {/* Logo */}
          <Image
            source={require("@/assets/images/adaptive-icon.png")}
            style={{ width: 48, height: 48, borderRadius: 24 }}
            resizeMode="cover"
          />

          {/* Address selector */}
          <TouchableOpacity
            className="flex-1"
            activeOpacity={0.75}
            onPress={toggleAddressDropdown}
          >
            <Text className="text-[10px] font-[600] text-white/65 uppercase tracking-widest leading-4">
              Entregar em
            </Text>
            <Animated.View
              className="flex-row items-center gap-1"
              style={{ opacity: fadeAnim }}
            >
              <View className="flex-1 flex-shrink">
                <Text
                  className="text-[15px] font-[800] text-white"
                  numberOfLines={1}
                >
                  {addressLabel ?? "Carregando..."}
                </Text>
                {selectedAddress && addressDetail !== addressLabel && (
                  <Text
                    className="text-[11px] text-white/70 mt-[1px]"
                    numberOfLines={1}
                  >
                    {addressDetail}
                  </Text>
                )}
              </View>
              {addresses.length > 0 && (
                <MaterialCommunityIcons
                  name={showAddressDropdown ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="rgba(255,255,255,0.8)"
                />
              )}
            </Animated.View>
          </TouchableOpacity>

          {/* Bell button */}
          <TouchableOpacity
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
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
            {/* Unread badge */}
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
                  borderColor: "#E30613",
                }}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#FFF",
            height: 50,
            paddingHorizontal: 16,
            gap: 8,
            borderRadius: 25,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 10,
            elevation: 6,
            marginBottom: 15,
          }}
        >
          <MaterialCommunityIcons name="magnify" size={22} color="#BBBBBB" />

          <TextInput
            style={{
              flex: 1,
              fontSize: 15,
              color: "#333333",
              height: "100%",
            }}
            placeholder="Buscar produtos..."
            placeholderTextColor="#BBBBBB"
            value={searchValue}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            onSubmitEditing={handleSearchSubmit}
            autoCorrect={false}
            autoCapitalize="none"
          />

          {searchValue.length > 0 && (
            <TouchableOpacity
              onPress={handleSearchClear}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color="#CCCCCC"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Backdrop (fecha ambos os dropdowns) ────────────────────────── */}
      {anyDropdownOpen && (
        <TouchableOpacity
          activeOpacity={1}
          style={{
            position: "absolute",
            top: 0,
            left: -100,
            width: SCREEN_WIDTH * 2,
            height: SCREEN_HEIGHT * 2,
            zIndex: 30,
          }}
          onPress={closeAll}
        />
      )}

      {/* ── Address dropdown ────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={showAddressDropdown ? "auto" : "none"}
        style={[
          {
            position: "absolute",
            top: 72,
            left: 60,
            right: 16,
            backgroundColor: "#FFF",
            borderRadius: 18,
            zIndex: 40,
            maxHeight: 300,
            overflow: "hidden",
            flexDirection: "column",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.14,
            shadowRadius: 14,
            elevation: 10,
          },
          dropdownStyle(addressDropAnim),
        ]}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#F5F5F5",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#1A1A1A" }}>
            Seus endereços
          </Text>
        </View>

        <ScrollView
          bounces={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          {addresses.map((addr) => {
            const isSelected = addr.id === selectedAddress?.id;
            return (
              <TouchableOpacity
                key={addr.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  marginHorizontal: 8,
                  marginTop: 4,
                  borderRadius: 12,
                  backgroundColor: isSelected ? "#FFF5F5" : "#FFF",
                }}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedAddress(addr);
                  setShowAddressDropdown(false);
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: isSelected ? "#FFE8EA" : "#F5F5F5",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                    flexShrink: 0,
                  }}
                >
                  <MaterialCommunityIcons
                    name="map-marker-outline"
                    size={17}
                    color={isSelected ? "#E30613" : "#888888"}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  {addr.label ? (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: "#E30613",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 3,
                      }}
                    >
                      {addr.label}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: "#1A1A1A",
                    }}
                    numberOfLines={1}
                  >
                    {addr.street}, {addr.number}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#888888",
                      marginTop: 2,
                    }}
                  >
                    {addr.neighborhood}
                  </Text>
                </View>

                {isSelected && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={19}
                    color="#E30613"
                    style={{ marginLeft: 8 }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* ── Notification dropdown ───────────────────────────────────────── */}
      <Animated.View
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
            maxHeight: 340,
            overflow: "hidden",
            flexDirection: "column",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.14,
            shadowRadius: 14,
            elevation: 10,
          },
          dropdownStyle(notifDropAnim),
        ]}
      >
        {/* Header */}
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: "#1A1A1A" }}>
              Notificações
            </Text>
            {unreadCount > 0 && (
              <View
                style={{
                  backgroundColor: "#E30613",
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
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          {MOCK_NOTIFICATIONS.map((notif) => (
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
                  color={!notif.read ? "#E30613" : "#888888"}
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
                    style={{ fontSize: 11, color: "#AAAAAA", flexShrink: 0 }}
                  >
                    {notif.time}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#666666",
                    lineHeight: 17,
                  }}
                  numberOfLines={2}
                >
                  {notif.body}
                </Text>
              </View>

              {!notif.read && (
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 3.5,
                    backgroundColor: "#E30613",
                    marginTop: 6,
                    marginLeft: 8,
                    flexShrink: 0,
                  }}
                />
              )}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
