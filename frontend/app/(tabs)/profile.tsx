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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";

import { logout } from "../../services/auth";
import { uploadAvatar } from "../../services/profile";
import { Toast } from "@/util/toast";

const MENU_OPTIONS = [
  { id: "1", title: "Meus Pedidos", route: "/orders" },
  { id: "2", title: "Endereços de Entrega", route: "/addresses" },
  { id: "4", title: "Meus Dados", route: "/profile/details" },
  { id: "5", title: "Configurações", route: "/profile/settings" },
];

interface UserState {
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export default function ProfileScreen() {
  const [user, setUser] = useState<UserState>({
    name: "",
    email: "",
    avatarUrl: null,
  });

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const name = await AsyncStorage.getItem("@hema_user_name");
      const email = await AsyncStorage.getItem("@hema_user_email");
      const avatarUrl = await AsyncStorage.getItem("@hema_user_avatar");

      if (name && email) {
        setUser({ name, email, avatarUrl });
      }
    }

    loadProfile();
  }, []);

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
    if (permissionResult.granted === false) {
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
    const names = name.trim().split(" ");
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (
      names[0].charAt(0) + names[names.length - 1].charAt(0)
    ).toUpperCase();
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <View className="flex-1 bg-white">
        <StatusBar barStyle="dark-content" />
        <ScrollView
          className="flex-1 bg-white"
          showsVerticalScrollIndicator={false}
        >
          {/* SEÇÃO SUPERIOR: Avatar e Infos */}
          <View className="items-center py-10 bg-white border-b border-[#F2F2F2]">
            <TouchableOpacity onPress={handlePickImage} disabled={uploading}>
              <View className="w-[100px] h-[100px] rounded-full bg-[#F5F5F5] border border-[#EEE] mb-4 overflow-hidden justify-center items-center">
                {uploading ? (
                  <ActivityIndicator color="#E31837" />
                ) : user.avatarUrl ? (
                  <Image
                    source={{ uri: user.avatarUrl }}
                    className="w-full h-full"
                  />
                ) : (
                  <Text className="text-[40px] text-[#CCC] font-semibold">
                    {getInitials(user.name)}
                  </Text>
                )}
              </View>

              <View className="absolute bottom-2.5 right-2.5 bg-[#E31837] rounded-xl p-1">
                <MaterialCommunityIcons
                  name="camera-plus"
                  size={14}
                  color="#FFF"
                />
              </View>
            </TouchableOpacity>

            <Text className="text-[22px] font-bold text-[#1A1A1A]">
              {user.name}
            </Text>
            <Text className="text-sm text-[#666] mt-1">{user.email}</Text>
          </View>

          {/* Seção de Menu */}
          <View className="mt-5 px-4">
            {MENU_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item.id}
                className="flex-row items-center justify-between py-[18px] border-b border-[#F8F8F8]"
                activeOpacity={0.6}
                onPress={() => {
                  if (item.route) router.push(item.route as any);
                }}
              >
                <View className="flex-row items-center">
                  <Text className="text-base text-[#333] font-normal">
                    {item.title}
                  </Text>
                </View>
                <Text className="text-lg text-[#BBB] font-light">›</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Botão Sair */}
          <View className="mt-10 px-4 pb-10">
            <TouchableOpacity
              className="bg-[#E31837] py-[15px] rounded-full items-center justify-center"
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Text className="text-white text-base font-bold">
                Sair da Conta
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
