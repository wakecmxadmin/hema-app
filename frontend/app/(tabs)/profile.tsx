import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";

import { logout } from "../../services/auth";
import { uploadAvatar } from "../../services/profile";
import { Toast } from "@/util/toast";
import { useCart } from "@/context/CartContext";
import { AuthRequiredModal } from "@/components/AuthRequiredModal";

// ─── Menu config ──────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  route: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const MENU_SECTIONS: MenuSection[] = [
  {
    title: "Minha Conta",
    items: [
      {
        id: "dados",
        title: "Meus Dados",
        subtitle: "Nome, celular e CPF",
        icon: "account-circle-outline",
        iconBg: "#EFF6FF",
        iconColor: "#3B82F6",
        route: "/profile/details",
      },
      {
        id: "enderecos",
        title: "Endereços de Entrega",
        subtitle: "Gerenciar endereços cadastrados",
        icon: "map-marker-outline",
        iconBg: "#F0FDF4",
        iconColor: "#22C55E",
        route: "/addresses",
      },
    ],
  },
  {
    title: "Preferências",
    items: [
      {
        id: "config",
        title: "Configurações",
        subtitle: "Notificações e privacidade",
        icon: "cog-outline",
        iconBg: "#F5F5F5",
        iconColor: "#666666",
        route: "/profile/settings",
      },
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserState {
  name: string;
  email: string;
  avatarUrl?: string | null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { isAuthenticated } = useCart();
  const [user, setUser] = useState<UserState>({
    name: "",
    email: "",
    avatarUrl: null,
  });
  const [uploading, setUploading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    async function loadProfile() {
      const name = await AsyncStorage.getItem("@hema_user_name");
      const email = await AsyncStorage.getItem("@hema_user_email");
      const avatarUrl = await AsyncStorage.getItem("@hema_user_avatar");
      if (name && email) setUser({ name, email, avatarUrl });
    }
    loadProfile();
  }, [isAuthenticated]);

  const handleLogout = async () => {
    const response = await logout();
    if (response.success) {
      await AsyncStorage.clear();
      router.replace("/auth");
    } else {
      Toast.show({
        type: "error",
        text1: "Erro ao sair",
        text2: response.message,
      });
    }
  };

  const handlePickImage = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(
        "Permissão",
        "Precisamos de acesso à sua galeria para alterar a foto.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setUploading(true);
      const asset = result.assets[0];
      const fileData = {
        uri: asset.uri,
        type: asset.mimeType || "image/jpeg",
        name: asset.fileName || `avatar-${Date.now()}.jpg`,
      };

      const response = await uploadAvatar(fileData);
      if (response.success && response.data) {
        setUser((prev) => ({ ...prev, avatarUrl: response.data as string }));
        await AsyncStorage.setItem(
          "@hema_user_avatar",
          response.data as string,
        );
        Toast.show({ type: "success", text1: response.message });
      } else {
        Toast.show({ type: "error", text1: "Ops!", text2: response.message });
      }
      setUploading(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (
      parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase();
  };

  const cardShadow = {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F5F5F5" }}
      edges={["top"]}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Page title */}
        <View
          style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}
        >
          <Text style={{ fontSize: 26, fontWeight: "800", color: "#121212" }}>
            Perfil
          </Text>
        </View>

        {/* Avatar + user info */}
        <View
          style={{
            alignItems: "center",
            paddingVertical: 28,
            paddingHorizontal: 20,
          }}
        >
          <TouchableOpacity
            onPress={isAuthenticated ? handlePickImage : undefined}
            disabled={uploading || !isAuthenticated}
            activeOpacity={0.8}
          >
            {/* Avatar */}
            <View
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                borderWidth: 3,
                borderColor: "#FFFFFF",
                zIndex: 0,
                ...cardShadow,
              }}
            >
              {uploading ? (
                <ActivityIndicator color="#D91A21" size="large" />
              ) : user.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <Text
                  style={{ fontSize: 36, color: "#C2C2C2", fontWeight: "700" }}
                >
                  {getInitials(user.name)}
                </Text>
              )}
            </View>

            {/* Camera badge */}
            <View
              style={{
                position: "relative",
                bottom: 12,
                right: 2,
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: "#D91A21",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2.5,
                borderColor: "#F5F5F5",
                zIndex: 1,
              }}
            >
              <MaterialCommunityIcons
                name="camera-plus"
                size={14}
                color="#FFFFFF"
              />
            </View>
          </TouchableOpacity>

          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: "#121212",
              marginTop: 16,
              textAlign: "center",
            }}
            numberOfLines={1}
          >
            {isAuthenticated ? (user.name || "Carregando...") : "Visitante"}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "#C2C2C2",
              marginTop: 4,
              textAlign: "center",
            }}
            numberOfLines={1}
          >
            {isAuthenticated ? user.email : "Entre para acessar sua conta"}
          </Text>
        </View>

        {/* Menu sections */}
        {MENU_SECTIONS.map((section) => (
          <View key={section.title} style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: "#C2C2C2",
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 8,
                paddingHorizontal: 20,
              }}
            >
              {section.title}
            </Text>

            <View
              style={{
                marginHorizontal: 16,
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                overflow: "hidden",
                ...cardShadow,
              }}
            >
              {section.items.map((item, index) => {
                const isProtected = item.id === "dados" || item.id === "enderecos";
                const disabled = isProtected && !isAuthenticated;

                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={disabled ? 1 : 0.65}
                    onPress={disabled ? undefined : () => router.push(item.route as any)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderTopWidth: index > 0 ? 1 : 0,
                      borderTopColor: "#F5F5F5",
                      opacity: disabled ? 0.4 : 1,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: item.iconBg,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 14,
                        flexShrink: 0,
                      }}
                    >
                      <MaterialCommunityIcons
                        name={item.icon as any}
                        size={20}
                        color={item.iconColor}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: "#121212",
                          marginBottom: 2,
                        }}
                      >
                        {item.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: "#C2C2C2" }}>
                        {disabled ? "Faça login para acessar" : item.subtitle}
                      </Text>
                    </View>

                    <MaterialCommunityIcons
                      name={disabled ? "lock-outline" : "chevron-right"}
                      size={disabled ? 18 : 20}
                      color="#C2C2C2"
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {/* Logout / Login */}
        <View style={{ marginHorizontal: 16, marginTop: 4 }}>
          <TouchableOpacity
            style={{
              height: 56,
              borderRadius: 16,
              backgroundColor: "#D91A21",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
            }}
            onPress={isAuthenticated ? handleLogout : () => router.push("/auth")}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={isAuthenticated ? "logout" : "login"}
              size={20}
              color="#FFFFFF"
            />
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>
              {isAuthenticated ? "Sair da Conta" : "Entrar na Conta"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <AuthRequiredModal
        visible={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          router.navigate("/(tabs)/home" as any);
        }}
        message="Você precisa estar logado para acessar seu perfil."
      />
    </SafeAreaView>
  );
}
