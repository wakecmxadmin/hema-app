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

export function CategoryCarousel() {
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCategories() {
      setLoading(true);

      const response = await CategoryBadgesService.getCategories();

      if (response.success && response.data) {
        const cleanedAndSortedData = response.data
          .filter((item: any) => item.name && item.name.trim().length > 0)
          .sort((a: any, b: any) => b.name.localeCompare(a.name));

        setCategories(cleanedAndSortedData);
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
      <View
        style={{ height: 52, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator size="small" color="#D91A21" />
      </View>
    );
  }

  if (categories.length === 0) return null;

  return (
    <View style={{ paddingVertical: 12 }}>
      <FlatList
        data={categories}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.72}
            onPress={() =>
              router.push({
                pathname: "/category/[id]",
                params: { id: item.id, name: item.name },
              })
            }
            style={{
              backgroundColor: "#F5F5F5",
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: "#E0E0E0",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: "#121212",
              }}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
