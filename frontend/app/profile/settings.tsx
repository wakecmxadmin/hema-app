import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Toast } from "@/util/toast";
import { getCurrentUser } from "@/services/auth";
import { updateProfile, deleteAccount } from "@/services/profile";

export default function SettingsScreen() {
  const router = useRouter();

  const [notifications, setNotifications] = useState(true);
  const [promotions, setPromotions] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const response = await getCurrentUser();

      if (response.success && response.data) {
        const user = response.data;
        const userSettings = user.user_metadata?.settings;
        if (userSettings) {
          setNotifications(userSettings.notifications ?? true);
          setPromotions(userSettings.promotions ?? false);
        }
      }

      setLoading(false);
    }
    loadSettings();
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);

    const response = await updateProfile({
      settings: {
        notifications,
        promotions,
      },
    });

    if (response.success) {
      Toast.show({ type: "success", text1: "Configurações salvas!" });
    } else {
      Toast.show({
        type: "error",
        text1: "Erro ao salvar",
        text2: response.message,
      });
    }
    setSaving(false);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Excluir Conta",
      "Tem certeza? Todos os seus dados de pedidos e endereços serão removidos permanentemente.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            const response = await deleteAccount();

            if (response.success) {
              Toast.show({ type: "success", text1: "Conta removida." });
              // A navegação será tratada pelo AuthGuard, mas forçamos aqui para garantir
              router.replace("/auth");
            } else {
              Toast.show({
                type: "error",
                text1: "Erro ao excluir",
                text2: response.message,
              });
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#E31837" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      {/* CABEÇALHO */}
      <View className="flex-row items-center justify-between p-4 bg-white border-b border-[#EEE]">
        <TouchableOpacity onPress={() => router.back()} className="p-2">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-[#1A1A1A]">Configurações</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 p-5">
        <Text className="text-sm font-bold text-[#666] mb-2.5 uppercase">
          Notificações
        </Text>
        <View className="bg-white rounded-xl px-4 mb-6 border border-[#EEE]">
          <View className="flex-row justify-between items-center py-4 border-b border-[#F5F5F5]">
            <Text className="text-base text-[#333]">
              Atualizações do Pedido
            </Text>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ true: "#E31837", false: "#DDD" }}
            />
          </View>
          <View className="flex-row justify-between items-center py-4">
            <Text className="text-base text-[#333]">Promoções e Ofertas</Text>
            <Switch
              value={promotions}
              onValueChange={setPromotions}
              trackColor={{ true: "#E31837", false: "#DDD" }}
            />
          </View>
        </View>

        <Text className="text-sm font-bold text-[#666] mb-2.5 uppercase">
          Privacidade e Conta
        </Text>
        <View className="bg-white rounded-xl px-4 mb-6 border border-[#EEE]">
          <TouchableOpacity
            className="flex-row justify-between items-center py-4"
            onPress={handleDeleteAccount}
          >
            <Text className="text-base text-[#E31837] font-semibold">
              Excluir minha conta
            </Text>
            <MaterialCommunityIcons
              name="delete-outline"
              size={20}
              color="#E31837"
            />
          </TouchableOpacity>
        </View>

        <Text className="text-center text-[#999] mt-10">
          Versão do Aplicativo: 1.0.2 (Beta)
        </Text>
      </ScrollView>

      {/* RODAPÉ */}
      <View className="p-5 border-t border-[#EEE]">
        <TouchableOpacity
          className={`bg-[#E31837] p-4 rounded-lg items-center ${
            saving ? "opacity-70" : ""
          }`}
          onPress={handleSaveSettings}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text className="text-white text-base font-bold">
              Salvar Preferências
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
