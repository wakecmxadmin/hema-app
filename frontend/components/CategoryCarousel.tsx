import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { CategoryBadgesService } from "@/services/category";

const SKELETON_WIDTHS = [80, 60, 100, 72];

export function CategoryCarousel() {
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      <View style={{ paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 8 }}>
          {SKELETON_WIDTHS.map((w, i) => (
            <View
              key={i}
              style={{
                width: w,
                height: 40,
                borderRadius: 22,
                backgroundColor: "#EAE3D7",
              }}
            />
          ))}
        </View>
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
        renderItem={({ item }) => {
          const isActive = selectedId === item.id.toString();
          return (
            <TouchableOpacity
              activeOpacity={0.72}
              onPress={() => {
                setSelectedId(item.id.toString());
                router.push({
                  pathname: "/category/[id]",
                  params: { id: item.id, name: item.name },
                });
              }}
              style={{
                backgroundColor: isActive ? "#1A1613" : "#FFFFFF",
                borderRadius: 22,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderWidth: isActive ? 0 : 1,
                borderColor: "#EAE3D7",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: isActive ? "#FFFFFF" : "#1A1613",
                }}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
