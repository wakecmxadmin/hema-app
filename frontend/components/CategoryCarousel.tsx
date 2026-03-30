import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { CategoryBadgesService } from "@/services/category";

const categoryOrder = ["Whey", "Creatina", "Snacks e Barras", "Pré-Treinos"];

export function CategoryCarousel() {
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCategories() {
      setLoading(true);

      const response = await CategoryBadgesService.getCategories();

      if (response.success && response.data) {
        const sortedData = [...response.data].sort((a, b) => {
          const indexA = categoryOrder.indexOf(a.name);
          const indexB = categoryOrder.indexOf(b.name);

          if (indexA === -1) return 1;
          if (indexB === -1) return -1;

          return indexA - indexB;
        });

        setCategories(sortedData);
      } else {
        console.log(
          "Erro ao carregar categorias no carrossel:",
          response.message,
        );
      }

      setLoading(false);
    }

    loadCategories();
  }, []);

  if (loading) {
    return (
      <View className="h-[40px] items-center justify-center">
        <ActivityIndicator size="small" color="#E31837" />
      </View>
    );
  }

  if (categories.length === 0) return null;

  return (
    <View className="my-[5px] mb-0 py-[10px]">
      <FlatList
        data={categories}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            className="rounded-[25px] bg-[#E31837] px-[20px] py-[10px] shadow-[0_2px_3px_rgba(227,24,55,0.2)]"
            style={{ elevation: 4 }}
            onPress={() =>
              router.push({
                pathname: "/category/[id]",
                params: { id: item.id, name: item.name },
              })
            }
          >
            <Text className="text-[14px] font-[700] capitalize text-[#FFFFFF]">{item.name}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
