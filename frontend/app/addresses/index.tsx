import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StatusBar,
  RefreshControl,
  Platform,
} from "react-native";
// 1. Importe o useSafeAreaInsets
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { Toast } from "@/util/toast";

import { getAddresses, deleteAddress } from "@/services/addresses";

export default function AddressListScreen() {
  const router = useRouter();
  // 2. Inicialize o hook dos insets
  const insets = useSafeAreaInsets();

  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ... (Funções fetchAddresses, onRefresh e handleDelete permanecem iguais)

  const fetchAddresses = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    const response = await getAddresses();
    if (response.success && response.data) {
      setAddresses(response.data);
    } else {
      setAddresses([]);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchAddresses(true);
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchAddresses(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      "Remover endereço",
      "Tem certeza que deseja excluir este endereço?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            const response = await deleteAddress(id);
            if (response.success) {
              Toast.show({ type: "success", text1: "Endereço removido!" });
              fetchAddresses();
            } else {
              Toast.show({
                type: "error",
                text1: "Erro ao remover",
                text2: response.message,
              });
            }
          },
        },
      ],
    );
  };

  const renderAddressItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      className="flex-row bg-white rounded-xl p-4 mb-3 border border-[#E5E7EB]"
      style={
        Platform.OS === "ios"
          ? {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
            }
          : { elevation: 2 }
      }
      onPress={() => router.push(`/addresses/${item.id}`)}
      activeOpacity={0.7}
    >
      <View className="flex-1">
        <View className="flex-row items-center mb-1">
          <Text className="text-[16px] font-bold text-[#111827] mr-2">
            {item.label || "Endereço"}
          </Text>
          {item.is_default && (
            <View className="bg-[#FFF1F2] px-2 py-0.5 rounded border border-[#FECDD3]">
              <Text className="text-[10px] font-bold text-[#E31837] uppercase">
                Principal
              </Text>
            </View>
          )}
        </View>
        <Text className="text-[14px] text-[#374151] leading-[20px]">
          {item.street}, {item.number}
        </Text>
        <Text className="text-[13px] text-[#6B7280] mt-0.5">
          {item.neighborhood} • {item.city}/{item.state}
        </Text>
        <Text className="text-[13px] text-[#6B7280] mt-0.5">
          {item.zip_code}
        </Text>
      </View>
      <View className="justify-between items-end ml-3">
        <TouchableOpacity onPress={() => handleDelete(item.id)} className="p-2">
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={22}
            color="#E31837"
          />
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={20} color="#CCC" />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      {/* HEADER */}
      <View className="flex-row items-center px-4 py-3 border-b border-[#F3F4F6] bg-white">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text className="flex-1 text-[18px] font-bold text-[#1A1A1A] text-center mr-8">
          Meus Endereços
        </Text>
        <View className="w-10" />
      </View>

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#E31837" />
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => item.id}
          renderItem={renderAddressItem}
          // 3. Aumentamos o paddingBottom para o último item não ficar atrás do botão
          contentContainerStyle={{
            padding: 16,
            paddingBottom:
              Platform.OS === "android" ? insets.bottom + 100 : 120,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#E31837"]}
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-[100px]">
              <MaterialCommunityIcons
                name="map-marker-off-outline"
                size={64}
                color="#CCC"
              />
              <Text className="mt-4 text-[16px] text-[#999]">
                Nenhum endereço cadastrado.
              </Text>
            </View>
          }
        />
      )}

      {/* BOTÃO FLUTUANTE COM AJUSTE PARA ANDROID */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#F3F4F6]"
        style={{
          paddingTop: 16,
          paddingHorizontal: 16,
          // 4. Aplicamos o ajuste dinâmico no padding bottom
          paddingBottom:
            Platform.OS === "android"
              ? insets.bottom > 0
                ? insets.bottom + 10
                : 20
              : insets.bottom || 20,
        }}
      >
        <TouchableOpacity
          className="flex-row bg-[#E31837] h-[56px] rounded-xl items-center justify-center gap-2 shadow-sm"
          onPress={() => router.push("/addresses/new")}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={24} color="#fff" />
          <Text className="text-white text-[16px] font-bold">
            Adicionar Novo Endereço
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
