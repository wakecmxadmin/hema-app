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

    const response = await updateProfile({
      name,
      phone,
      cpf,
    });

    if (response.success) {
      try {
        await AsyncStorage.setItem("@hema_user_name", name);
      } catch (e) {
        console.error("Erro ao salvar no AsyncStorage", e);
      }

      Toast.show({
        type: "success",
        text1: "Sucesso!",
        text2: response.message,
      });

      setTimeout(() => router.back(), 1500);
    } else {
      Toast.show({
        type: "error",
        text1: "Erro ao salvar",
        text2: response.message,
      });
      setSaving(false);
    }
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
      <StatusBar barStyle="dark-content" />

      {/* CABEÇALHO */}
      <View className="flex-row items-center justify-between p-4 bg-white border-b border-[#EEE]">
        <TouchableOpacity onPress={() => router.back()} className="p-2">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-[#1A1A1A]">Meus Dados</Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-grow p-5"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="mb-5">
          <Text className="text-sm font-semibold text-[#333] mb-2">
            Nome Completo
          </Text>
          <TextInput
            className="border border-[#DDD] rounded-lg p-[14px] text-base text-[#1A1A1A]"
            value={name}
            onChangeText={setName}
            autoCorrect={false}
            placeholder="Digite seu nome"
            editable={!saving}
          />
        </View>

        <View className="mb-5">
          <Text className="text-sm font-semibold text-[#333] mb-2">E-mail</Text>
          <TextInput
            className="border border-[#DDD] rounded-lg p-[14px] text-base bg-[#F5F5F5] text-[#888]"
            value={email}
            editable={false}
          />
        </View>

        <View className="mb-5">
          <Text className="text-sm font-semibold text-[#333] mb-2">
            Celular
          </Text>
          <TextInput
            className="border border-[#DDD] rounded-lg p-[14px] text-base text-[#1A1A1A]"
            placeholder="(00) 00000-0000"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            editable={!saving}
          />
        </View>

        <View className="mb-5">
          <Text className="text-sm font-semibold text-[#333] mb-2">CPF</Text>
          <TextInput
            className="border border-[#DDD] rounded-lg p-[14px] text-base text-[#1A1A1A]"
            placeholder="000.000.000-00"
            keyboardType="numeric"
            value={cpf}
            onChangeText={setCpf}
            maxLength={14}
            editable={!saving}
          />
        </View>
      </ScrollView>

      {/* RODAPÉ */}
      <View className="p-5 border-t border-[#EEE]">
        <TouchableOpacity
          className={`bg-[#E31837] p-4 rounded-lg items-center ${
            saving ? "opacity-70" : ""
          }`}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text className="text-white text-base font-bold">
              Salvar Alterações
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
