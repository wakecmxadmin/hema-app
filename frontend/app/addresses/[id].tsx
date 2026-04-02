import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Switch,
  StatusBar,
} from "react-native";
// 1. Importe o useSafeAreaInsets
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Toast } from "@/util/toast";
import {
  getAddresses,
  getAddressByCep,
  createAddress,
  updateAddress,
} from "@/services/addresses";

export default function AddressFormScreen() {
  const router = useRouter();
  // 2. Inicialize o hook
  const insets = useSafeAreaInsets();

  const { id } = useLocalSearchParams<{ id: string }>();
  const isEditing = id && id !== "new";

  const [loading, setLoading] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State (Mantido igual)
  const [label, setLabel] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (isEditing) loadAddressData();
  }, [id]);

  // ... (Funções loadAddressData, handleCepSearch e handleSave permanecem iguais)
  const loadAddressData = async () => {
    setLoading(true);
    const response = await getAddresses();
    if (response.success && response.data) {
      const addr = response.data.find((a: any) => a.id === id);
      if (addr) {
        setLabel(addr.label || "");
        setZipCode(addr.zip_code || "");
        setStreet(addr.street || "");
        setNumber(addr.number || "");
        setComplement(addr.complement || "");
        setNeighborhood(addr.neighborhood || "");
        setCity(addr.city || "");
        setState(addr.state || "");
        setIsDefault(addr.is_default || false);
      } else {
        Alert.alert("Erro", "Endereço não encontrado.");
        router.back();
      }
    }
    setLoading(false);
  };

  const handleCepSearch = async () => {
    const cleanCep = zipCode.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    setLoadingCep(true);
    const response = await getAddressByCep(cleanCep);
    if (response.success && response.data) {
      setStreet(response.data.street);
      setNeighborhood(response.data.neighborhood);
      setCity(response.data.city);
      setState(response.data.state);
      Toast.show({ type: "success", text1: "CEP encontrado" });
    }
    setLoadingCep(false);
  };

  const handleSave = async () => {
    if (!zipCode || !street || !number || !neighborhood || !city || !state) {
      Alert.alert("Atenção", "Preencha todos os campos obrigatórios (*).");
      return;
    }
    const executeSave = async () => {
      setSaving(true);
      const payload = {
        label,
        zip_code: zipCode,
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        is_default: isDefault,
      };
      const response = isEditing
        ? await updateAddress(id as string, payload)
        : await createAddress(payload);
      if (response.success) {
        Toast.show({
          type: "success",
          text1: isEditing ? "Endereço atualizado!" : "Endereço adicionado!",
        });
        router.back();
      } else {
        Toast.show({
          type: "error",
          text1: "Erro ao salvar",
          text2: response.message,
        });
      }
      setSaving(false);
    };
    if (isDefault) {
      setSaving(true);
      const response = await getAddresses();
      if (response.success && response.data) {
        const existingDefault = response.data.find(
          (a: any) => a.is_default === true && a.id !== id,
        );
        if (existingDefault) {
          setSaving(false);
          Alert.alert(
            "Alterar padrão?",
            `O endereço "${existingDefault.label || "Meu Endereço"}" já é o padrão. Deseja tornar este o seu principal?`,
            [
              { text: "Cancelar", style: "cancel" },
              { text: "Sim, alterar", onPress: () => executeSave() },
            ],
          );
          return;
        }
      }
    }
    executeSave();
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#E30613" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-[#F3F4F6] bg-white">
          <TouchableOpacity onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
          <Text className="flex-1 text-[18px] font-bold text-[#1A1A1A] text-center mr-8">
            {isEditing ? "Editar Endereço" : "Novo Endereço"}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
          <Text className="text-[13px] font-bold text-[#9CA3AF] tracking-[1px] mb-3 mt-2">
            IDENTIFICAÇÃO DO LOCAL
          </Text>
          <View className="bg-[#F9FAFB] rounded-[10px] border border-[#E5E7EB] px-3">
            <TextInput
              placeholder="Ex: Minha Casa, Trabalho..."
              className="h-[50px] text-[15px] text-[#111827]"
              value={label}
              onChangeText={setLabel}
            />
          </View>

          {/* ... (Demais campos de input permanecem iguais) */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-[#374151] mb-2 mt-4">
                CEP *
              </Text>
              <View className="bg-[#F9FAFB] rounded-[10px] border border-[#E5E7EB] px-3">
                <TextInput
                  placeholder="00000-000"
                  keyboardType="numeric"
                  maxLength={9}
                  className="h-[50px] text-[15px] text-[#111827]"
                  value={zipCode}
                  onChangeText={setZipCode}
                  onBlur={handleCepSearch}
                />
              </View>
            </View>
            {loadingCep && (
              <ActivityIndicator
                size="small"
                color="#E30613"
                style={{ marginTop: 25 }}
              />
            )}
          </View>

          <Text className="text-[14px] font-semibold text-[#374151] mb-2 mt-4">
            Rua/Avenida *
          </Text>
          <View className="bg-[#F9FAFB] rounded-[10px] border border-[#E5E7EB] px-3">
            <TextInput
              placeholder="Av. Paulista..."
              className="h-[50px] text-[15px] text-[#111827]"
              value={street}
              onChangeText={setStreet}
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-[#374151] mb-2 mt-4">
                Número *
              </Text>
              <View className="bg-[#F9FAFB] rounded-[10px] border border-[#E5E7EB] px-3">
                <TextInput
                  placeholder="100"
                  className="h-[50px] text-[15px] text-[#111827]"
                  value={number}
                  onChangeText={setNumber}
                />
              </View>
            </View>
            <View className="flex-[2]">
              <Text className="text-[14px] font-semibold text-[#374151] mb-2 mt-4">
                Complemento
              </Text>
              <View className="bg-[#F9FAFB] rounded-[10px] border border-[#E5E7EB] px-3">
                <TextInput
                  placeholder="Apto, Bloco..."
                  className="h-[50px] text-[15px] text-[#111827]"
                  value={complement}
                  onChangeText={setComplement}
                />
              </View>
            </View>
          </View>

          <Text className="text-[14px] font-semibold text-[#374151] mb-2 mt-4">
            Bairro *
          </Text>
          <View className="bg-[#F9FAFB] rounded-[10px] border border-[#E5E7EB] px-3">
            <TextInput
              placeholder="Ex: Centro"
              className="h-[50px] text-[15px] text-[#111827]"
              value={neighborhood}
              onChangeText={setNeighborhood}
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-[2]">
              <Text className="text-[14px] font-semibold text-[#374151] mb-2 mt-4">
                Cidade *
              </Text>
              <View className="bg-[#F9FAFB] rounded-[10px] border border-[#E5E7EB] px-3">
                <TextInput
                  placeholder="Ex: São Paulo"
                  className="h-[50px] text-[15px] text-[#111827]"
                  value={city}
                  onChangeText={setCity}
                />
              </View>
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-[#374151] mb-2 mt-4">
                UF *
              </Text>
              <View className="bg-[#F9FAFB] rounded-[10px] border border-[#E5E7EB] px-3">
                <TextInput
                  placeholder="SP"
                  maxLength={2}
                  autoCapitalize="characters"
                  className="h-[50px] text-[15px] text-[#111827]"
                  value={state}
                  onChangeText={setState}
                />
              </View>
            </View>
          </View>

          <View className="flex-row items-center justify-between py-5 mt-6 border-t border-[#F3F4F6]">
            <View className="flex-1">
              <Text className="text-[16px] font-semibold text-[#111827]">
                Tornar como padrão
              </Text>
              <Text className="text-[13px] text-[#6B7280] mt-0.5">
                Este endereço será o principal em suas compras.
              </Text>
            </View>
            <Switch
              value={isDefault}
              onValueChange={setIsDefault}
              trackColor={{ false: "#D1D5DB", true: "#FECDD3" }}
              thumbColor={isDefault ? "#E30613" : "#F9FAFB"}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* RODAPÉ COM AJUSTE DINÂMICO */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#F3F4F6]"
        style={{
          paddingTop: 16,
          paddingHorizontal: 16,
          // 3. Ajuste fino do padding inferior baseado nos insets do sistema
          paddingBottom:
            Platform.OS === "android"
              ? insets.bottom > 0
                ? insets.bottom + 10
                : 20
              : insets.bottom || 20,
        }}
      >
        <TouchableOpacity
          className={`h-[56px] rounded-xl items-center justify-center shadow-sm ${
            saving ? "bg-[#FCA5A5]" : "bg-[#E30613]"
          }`}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-[16px] font-bold">
              {isEditing ? "Salvar Alterações" : "Adicionar Endereço"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
