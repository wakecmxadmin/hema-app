import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Toast } from "@/util/toast";
import { getCurrentUser } from "@/services/auth";
import { updateProfile, getProfileData } from "@/services/profile";

// ─── Shared field component ───────────────────────────────────────────────────

interface FieldProps {
  label: string;
  icon: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  maxLength?: number;
  disabled?: boolean;
  editable?: boolean;
}

function Field({
  label,
  icon,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  maxLength,
  disabled = false,
  editable = true,
}: FieldProps) {
  const isReadOnly = disabled || !editable;

  return (
    <View style={{ marginBottom: 4 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: "#AAAAAA",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginBottom: 8,
          paddingHorizontal: 4,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: isReadOnly ? "#F0F0F0" : "#F5F5F5",
          borderRadius: 14,
          paddingHorizontal: 16,
          height: 54,
          borderWidth: 1.5,
          borderColor: isReadOnly ? "#EBEBEB" : "transparent",
        }}
      >
        <MaterialCommunityIcons
          name={icon as any}
          size={20}
          color={isReadOnly ? "#CCCCCC" : "#AAAAAA"}
          style={{ marginRight: 12 }}
        />
        <TextInput
          style={{
            flex: 1,
            fontSize: 15,
            color: isReadOnly ? "#AAAAAA" : "#1A1A1A",
            fontWeight: isReadOnly ? "500" : "600",
          }}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#CCCCCC"
          keyboardType={keyboardType}
          maxLength={maxLength}
          editable={!isReadOnly}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {isReadOnly && (
          <MaterialCommunityIcons name="lock-outline" size={16} color="#CCCCCC" />
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PersonalDetailsScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      const userResponse = await getCurrentUser();
      if (userResponse.success && userResponse.data) {
        setEmail(userResponse.data.email || "");
      }

      const profileResponse = await getProfileData();
      if (profileResponse.success && profileResponse.data) {
        setName(profileResponse.data.name || "");
        setPhone(profileResponse.data.phone || "");
        setCpf(profileResponse.data.cpf || "");
      } else {
        Toast.show({
          type: "error",
          text1: "Erro ao carregar dados",
          text2: profileResponse.message,
        });
      }

      setLoading(false);
    }
    loadData();
  }, []);

  const handleSave = async () => {
    Keyboard.dismiss();

    if (!name.trim() || !email.trim()) {
      return Toast.show({
        type: "error",
        text1: "Nome e E-mail são obrigatórios",
      });
    }

    setSaving(true);

    const response = await updateProfile({ name, phone, cpf });

    if (response.success) {
      try {
        await AsyncStorage.setItem("@hema_user_name", name);
      } catch (e) {
        console.error("Erro ao salvar no AsyncStorage", e);
      }
      Toast.show({ type: "success", text1: "Sucesso!", text2: response.message });
      setTimeout(() => router.back(), 1500);
    } else {
      Toast.show({ type: "error", text1: "Erro ao salvar", text2: response.message });
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F7F7F8", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#E30613" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F7F7F8" }} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F8" />

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: "#F7F7F8",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "#EBEBEB",
            alignItems: "center",
            justifyContent: "center",
          }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color="#1A1A1A" />
        </TouchableOpacity>

        <Text style={{ fontSize: 17, fontWeight: "800", color: "#1A1A1A" }}>
          Meus Dados
        </Text>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Form card */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            padding: 20,
            gap: 16,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          <Field
            label="Nome Completo"
            icon="account-outline"
            value={name}
            onChange={setName}
            placeholder="Digite seu nome"
            editable={!saving}
          />

          <Field
            label="E-mail"
            icon="email-outline"
            value={email}
            disabled
          />

          <Field
            label="Celular"
            icon="phone-outline"
            value={phone}
            onChange={setPhone}
            placeholder="(00) 00000-0000"
            keyboardType="phone-pad"
            editable={!saving}
          />

          <Field
            label="CPF"
            icon="card-account-details-outline"
            value={cpf}
            onChange={setCpf}
            placeholder="000.000.000-00"
            keyboardType="numeric"
            maxLength={14}
            editable={!saving}
          />
        </View>

        {/* Info note */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 16,
            paddingHorizontal: 4,
          }}
        >
          <MaterialCommunityIcons name="information-outline" size={15} color="#BBBBBB" />
          <Text style={{ fontSize: 12, color: "#BBBBBB", flex: 1, lineHeight: 17 }}>
            O e-mail não pode ser alterado. Entre em contato com o suporte se necessário.
          </Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 16,
          backgroundColor: "#F7F7F8",
        }}
      >
        <TouchableOpacity
          style={{
            backgroundColor: saving ? "#F0A0A6" : "#E30613",
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
          }}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="check" size={20} color="#FFF" />
              <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "700" }}>
                Salvar Alterações
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
