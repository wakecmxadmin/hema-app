import React, { useRef, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Text,
  Animated,
  FlatList,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Suggestion {
  label: string;
  category?: string;
}

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  /** Pill height in px. Default: 44 */
  height?: number;
  /** Border radius in px. Default: 22 */
  borderRadius?: number;
  /** Android elevation + iOS shadow. Default: 0 (flat). */
  elevation?: number;
  /** Background color for the pill. Default: #F5F5F5 */
  backgroundColor?: string;
  /** Icon and placeholder color. Default: #C2C2C2 */
  iconColor?: string;
  /** Input text size. Default: 14 */
  fontSize?: number;
  /** Input text color. Default: #121212 */
  textColor?: string;
  /** Whether to show the bottom border + wrapper padding. Default: true */
  showWrapper?: boolean;
  /** Popular/autocomplete suggestions shown in expanded panel */
  suggestions?: Suggestion[];
}

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: "Bala de Goma Fruit Slices", category: "Doce" },
  { label: "Colágeno hidrolisado", category: "Suplemento" },
  { label: "Farinha de mamão", category: "Natural" },
  { label: "Chia orgânica", category: "Grão" },
  { label: "Whey protein", category: "Suplemento" },
  { label: "Creme de arroz", category: "Farinha" },
];

const MAX_RECENTS = 5;
const ITEM_ANIM_COUNT = 20;

export function SearchBar({
  onSearch,
  placeholder = "Buscar produtos...",
  height = 44,
  borderRadius = 22,
  elevation = 0,
  backgroundColor = "#F5F5F5",
  iconColor = "#C2C2C2",
  fontSize = 14,
  textColor = "#121212",
  showWrapper = true,
  suggestions = DEFAULT_SUGGESTIONS,
}: SearchBarProps) {
  const insets = useSafeAreaInsets();

  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const panelY = useRef(new Animated.Value(24)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef(
    Array.from({ length: ITEM_ANIM_COUNT }, () => new Animated.Value(0))
  ).current;

  const openExpanded = () => {
    setExpanded(true);
    setQuery(value);
    itemAnims.forEach((a) => a.setValue(0));

    Animated.parallel([
      Animated.timing(scrimOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(panelY, { toValue: 0, tension: 70, friction: 13, useNativeDriver: true }),
      Animated.timing(panelOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      const visibleCount = Math.min(
        recents.length + suggestions.length + 2,
        ITEM_ANIM_COUNT
      );
      Animated.stagger(
        45,
        itemAnims.slice(0, visibleCount).map((a) =>
          Animated.spring(a, { toValue: 1, tension: 90, friction: 13, useNativeDriver: true })
        )
      ).start();
      setTimeout(() => inputRef.current?.focus(), 60);
    });
  };

  const closeExpanded = () => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(scrimOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(panelOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      setExpanded(false);
      setQuery("");
      panelY.setValue(24);
    });
  };

  const commitSearch = (term: string) => {
    const trimmed = term.trim();
    if (trimmed) {
      setValue(trimmed);
      onSearch(trimmed);
      setRecents((prev) => {
        const filtered = prev.filter((r) => r !== trimmed);
        return [trimmed, ...filtered].slice(0, MAX_RECENTS);
      });
    } else {
      setValue("");
      onSearch("");
    }
    closeExpanded();
  };

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onSearch(text), 300);
  };

  const handleClearPill = () => {
    setValue("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onSearch("");
  };

  const filteredRecents = query
    ? recents.filter((r) => r.toLowerCase().includes(query.toLowerCase()))
    : recents;

  const filteredSuggestions = query
    ? suggestions.filter((s) => s.label.toLowerCase().includes(query.toLowerCase()))
    : suggestions;

  type ListItem =
    | { key: string; kind: "header"; label: string; animIdx: number }
    | { key: string; kind: "recent"; label: string; animIdx: number }
    | { key: string; kind: "suggestion"; label: string; category?: string; animIdx: number };

  const listData: ListItem[] = [];
  let aidx = 0;

  if (filteredRecents.length > 0) {
    listData.push({ key: "h-recent", kind: "header", label: "Buscas recentes", animIdx: aidx++ });
    filteredRecents.forEach((r, i) => {
      listData.push({ key: `r-${i}`, kind: "recent", label: r, animIdx: aidx++ });
    });
  }

  if (filteredSuggestions.length > 0) {
    const popLabel = query ? `Resultados para "${query}"` : "Populares agora";
    listData.push({ key: "h-pop", kind: "header", label: popLabel, animIdx: aidx++ });
    filteredSuggestions.forEach((s, i) => {
      listData.push({ key: `s-${i}`, kind: "suggestion", ...s, animIdx: aidx++ });
    });
  }

  // ── Idle pill ─────────────────────────────────────────────────────────────
  const pillShadow =
    elevation > 0
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 } as { width: number; height: number },
          shadowOpacity: 0.18,
          shadowRadius: 10,
          elevation,
        }
      : {};

  const pill = (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={openExpanded}
      style={[styles.pill, { height, borderRadius, backgroundColor }, pillShadow]}
    >
      <MaterialCommunityIcons
        name="magnify"
        size={height >= 48 ? 22 : 20}
        color={iconColor}
      />
      <Text
        style={[styles.pillText, { fontSize, color: value ? textColor : iconColor }]}
        numberOfLines={1}
      >
        {value || placeholder}
      </Text>
      {value.length > 0 && (
        <TouchableOpacity
          onPress={handleClearPill}
          hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
        >
          <MaterialCommunityIcons name="close-circle" size={18} color={iconColor} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <>
      {showWrapper ? <View style={styles.wrapper}>{pill}</View> : pill}

      <Modal
        visible={expanded}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeExpanded}
      >
        <View style={styles.modalRoot}>
          {/* Scrim */}
          <TouchableWithoutFeedback onPress={closeExpanded}>
            <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]} />
          </TouchableWithoutFeedback>

          {/* Panel */}
          <Animated.View
            style={[
              styles.panel,
              {
                paddingTop: (Platform.OS === "android" ? 0 : insets.top) + 12,
                transform: [{ translateY: panelY }],
                opacity: panelOpacity,
              },
            ]}
          >
            {/* Search input row */}
            <View style={styles.searchRow}>
              <TouchableOpacity
                onPress={closeExpanded}
                style={styles.backBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="arrow-left" size={22} color="#121212" />
              </TouchableOpacity>

              <View
                style={[
                  styles.expandedPill,
                  { borderRadius: Math.min(borderRadius, 14) },
                ]}
              >
                <MaterialCommunityIcons name="magnify" size={20} color="#D91A21" />
                <TextInput
                  ref={inputRef}
                  style={[styles.expandedInput, { fontSize }]}
                  placeholder={placeholder}
                  placeholderTextColor="#C2C2C2"
                  value={query}
                  onChangeText={handleQueryChange}
                  returnKeyType="search"
                  onSubmitEditing={() => commitSearch(query)}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {query.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setQuery("");
                      onSearch("");
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons name="close-circle" size={18} color="#C2C2C2" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Suggestions */}
            <FlatList
              data={listData}
              keyExtractor={(item) => item.key}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              renderItem={({ item }) => {
                const anim = itemAnims[Math.min(item.animIdx, ITEM_ANIM_COUNT - 1)];
                const translateY = anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                });

                if (item.kind === "header") {
                  return (
                    <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
                      <Text style={styles.sectionLabel}>{item.label}</Text>
                    </Animated.View>
                  );
                }

                if (item.kind === "recent") {
                  return (
                    <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
                      <TouchableOpacity
                        style={styles.row}
                        onPress={() => commitSearch(item.label)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.rowIcon}>
                          <MaterialCommunityIcons
                            name="clock-outline"
                            size={16}
                            color="#8A8079"
                          />
                        </View>
                        <Text style={styles.rowLabel} numberOfLines={1}>
                          {item.label}
                        </Text>
                        <MaterialCommunityIcons
                          name="arrow-top-left"
                          size={15}
                          color="#C2C2C2"
                        />
                      </TouchableOpacity>
                    </Animated.View>
                  );
                }

                return (
                  <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => commitSearch(item.label)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.rowIcon, styles.rowIconAmber]}>
                        <MaterialCommunityIcons
                          name="magnify"
                          size={16}
                          color="#C97B1F"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowLabel} numberOfLines={1}>
                          {item.label}
                        </Text>
                        {item.category ? (
                          <Text style={styles.rowCategory}>{item.category}</Text>
                        ) : null}
                      </View>
                      <MaterialCommunityIcons
                        name="arrow-top-left"
                        size={15}
                        color="#C2C2C2"
                      />
                    </TouchableOpacity>
                  </Animated.View>
                );
              }}
              ListEmptyComponent={
                query ? (
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="magnify" size={36} color="#EAE3D7" />
                    <Text style={styles.emptyText}>
                      Nenhum resultado para "{query}"
                    </Text>
                  </View>
                ) : null
              }
            />
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAE3D7",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  pillText: {
    flex: 1,
    paddingVertical: 0,
  },
  // Modal
  modalRoot: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26,22,19,0.32)",
  },
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FAF6F0",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  expandedPill: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D91A21",
    shadowColor: "#C97B1F",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  expandedInput: {
    flex: 1,
    color: "#121212",
    paddingVertical: 0,
    includeFontPadding: false,
  } as any,
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#C97B1F",
    textTransform: "uppercase",
    letterSpacing: 1.6,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EAE3D7",
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconAmber: {
    backgroundColor: "#FAEFD9",
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    color: "#1A1613",
    fontWeight: "500",
  },
  rowCategory: {
    fontSize: 11,
    color: "#8A8079",
    marginTop: 1,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 48,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: "#8A8079",
    textAlign: "center",
  },
});
