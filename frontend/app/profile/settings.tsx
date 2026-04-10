import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Platform,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Toast } from "@/util/toast";
import { getCurrentUser } from "@/services/auth";
import { updateProfile, deleteAccount } from "@/services/profile";

// ─── Toggle row ───────────────────────────────────────────────────────────────

interface ToggleRowProps {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  isLast?: boolean;
}

function ToggleRow({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  value,
  onChange,
  isLast = false,
}: ToggleRowProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: "#E0E0E0",
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 14,
          flexShrink: 0,
        }}
      >
        <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
      </View>

      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#121212", marginBottom: 2 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: "#C2C2C2", lineHeight: 17 }}>
          {subtitle}
        </Text>
      </View>

      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: "#D91A21", false: "#E0E0E0" }}
        thumbColor={Platform.OS === "android" ? "#FFFFFF" : undefined}
        ios_backgroundColor="#E0E0E0"
      />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();

  const [notifications, setNotifications] = useState(true);
  const [promotions, setPromotions] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadSettings = useCallback(async () => {
    const response = await getCurrentUser();
    if (response.success && response.data) {
      const userSettings = response.data.user_metadata?.settings;
      if (userSettings) {
        setNotifications(userSettings.notifications ?? true);
        setPromotions(userSettings.promotions ?? false);
      }
    }
  }, []);

  useEffect(() => {
    loadSettings().finally(() => setLoading(false));
  }, [loadSettings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSettings();
    setRefreshing(false);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    Toast.show({ type: "success", text1: "Configurações salvas!" });

    const response = await updateProfile({ settings: { notifications, promotions } });
    if (!response.success) {
      Toast.show({ type: "error", text1: "Erro ao salvar", text2: response.message });
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
      <View style={{ flex: 1, backgroundColor: "#F5F5F5", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#D91A21" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F5" }} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: "#F5F5F5",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: "#E0E0E0",
            alignItems: "center",
            justifyContent: "center",
          }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color="#121212" />
        </TouchableOpacity>

        <Text style={{ fontSize: 17, fontWeight: "800", color: "#121212" }}>
          Configurações
        </Text>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#D91A21"]}
            tintColor="#D91A21"
          />
        }
      >
        {/* Notificações */}
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: "#C2C2C2",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 8,
            paddingHorizontal: 4,
          }}
        >
          Notificações
        </Text>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 20,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          <ToggleRow
            icon="bell-ring-outline"
            iconBg="#EFF6FF"
            iconColor="#3B82F6"
            title="Atualizações do Pedido"
            subtitle="Receba alertas sobre o status dos seus pedidos"
            value={notifications}
            onChange={setNotifications}
          />
          <ToggleRow
            icon="tag-outline"
            iconBg="#FFF7ED"
            iconColor="#F97316"
            title="Promoções e Ofertas"
            subtitle="Fique por dentro das melhores ofertas"
            value={promotions}
            onChange={setPromotions}
            isLast
          />
        </View>

        {/* Privacidade */}
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: "#C2C2C2",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 8,
            paddingHorizontal: 4,
          }}
        >
          Privacidade e Conta
        </Text>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 24,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                backgroundColor: "#FEF2F2",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 14,
                flexShrink: 0,
              }}
            >
              <MaterialCommunityIcons name="delete-outline" size={20} color="#EF4444" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#EF4444", marginBottom: 2 }}>
                Excluir minha conta
              </Text>
              <Text style={{ fontSize: 12, color: "#C2C2C2", lineHeight: 17 }}>
                Remove todos os dados permanentemente
              </Text>
            </View>

            <MaterialCommunityIcons name="chevron-right" size={20} color="#C2C2C2" />
          </TouchableOpacity>
        </View>

        {/* App version */}
        <Text
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#C2C2C2",
            marginTop: 4,
          }}
        >
          Versão 1.0.2 (Beta)
        </Text>
      </ScrollView>

      {/* Footer */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 16,
          backgroundColor: "#F5F5F5",
        }}
      >
        <TouchableOpacity
          style={{
            backgroundColor: saving ? "#B50000" : "#D91A21",
            height: 56,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
          }}
          onPress={handleSaveSettings}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>
                Salvar Preferências
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
