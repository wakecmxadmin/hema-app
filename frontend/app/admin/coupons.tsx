import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { CouponsService, Coupon } from "@/services/coupons";
import { useCart } from "@/context/CartContext";

const COLORS = {
  bg: "#FAF6F0",
  card: "#FFFFFF",
  border: "#EAE3D7",
  text: "#1A1613",
  muted: "#5C544C",
  brand: "#D91A21",
  ok: "#137333",
  warn: "#B26A00",
};

function situacaoDoCoupon(
  coupon: Coupon,
): { label: string; tone: "ok" | "warn" | "default" } {
  if (!coupon.is_active) return { label: "Desativado", tone: "default" };
  if (coupon.expires_at && new Date(coupon.expires_at) <= new Date()) {
    return { label: "Expirado", tone: "warn" };
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { label: "Esgotado", tone: "warn" };
  }
  return { label: "Ativo", tone: "ok" };
}

/** Aceita DD/MM/AAAA e devolve o fim daquele dia em ISO — vazio é válido (sem validade). */
function parseExpiresAt(value: string): string | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    23,
    59,
    59,
  );
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDate(iso: string | null) {
  if (!iso) return "Sem validade";
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Inverso de parseExpiresAt — reconstrói o DD/MM/AAAA pra preencher o form ao editar. */
function isoToInputDate(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: "700",
          color: COLORS.muted,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
  color: COLORS.text,
  backgroundColor: "#FFFFFF",
};

export default function CouponsAdminScreen() {
  const router = useRouter();
  const { isStaff } = useCart();

  const scrollRef = useRef<ScrollView>(null);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [isSingleUse, setIsSingleUse] = useState(false);
  const [maxUses, setMaxUses] = useState("");
  const [minOrderTotal, setMinOrderTotal] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const fetchCoupons = useCallback(async () => {
    const response = await CouponsService.adminList();
    if (response.success && response.data) setCoupons(response.data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (isStaff) fetchCoupons();
    else setLoading(false);
  }, [isStaff, fetchCoupons]);

  const resetForm = () => {
    setCode("");
    setDescription("");
    setDiscountPercent("");
    setIsSingleUse(false);
    setMaxUses("");
    setMinOrderTotal("");
    setExpiresAt("");
    setEditingId(null);
  };

  const closeForm = () => {
    resetForm();
    setShowForm(false);
  };

  const startEdit = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setCode(coupon.code);
    setDescription(coupon.description ?? "");
    setDiscountPercent(String(coupon.discount_percent));
    setIsSingleUse(coupon.max_uses === 1);
    setMaxUses(
      coupon.max_uses !== null && coupon.max_uses !== 1
        ? String(coupon.max_uses)
        : "",
    );
    setMinOrderTotal(
      coupon.min_order_total !== null ? String(coupon.min_order_total) : "",
    );
    setExpiresAt(isoToInputDate(coupon.expires_at));
    setShowForm(true);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleSubmit = async () => {
    const trimmedCode = code.trim();
    const percent = Number(discountPercent.replace(",", "."));
    const parsedExpiresAt = parseExpiresAt(expiresAt);

    if (!trimmedCode) {
      return Alert.alert("Atenção", "Informe o código do cupom.");
    }
    if (!percent || percent <= 0 || percent > 100) {
      return Alert.alert("Atenção", "Informe um desconto entre 1% e 100%.");
    }
    if (parsedExpiresAt === null) {
      return Alert.alert(
        "Atenção",
        "Data de validade inválida. Use o formato DD/MM/AAAA.",
      );
    }

    // O form sempre reflete o valor atual do cupom (na edição) — um campo
    // deixado vazio significa "limpar", por isso manda `null` e não
    // `undefined` (que o backend interpreta como "não mexer" no PATCH).
    const payload = {
      description: description.trim() || null,
      discount_percent: percent,
      is_single_use: isSingleUse,
      max_uses:
        !isSingleUse && maxUses.trim() ? Number(maxUses.trim()) : undefined,
      min_order_total: minOrderTotal.trim()
        ? Number(minOrderTotal.replace(",", "."))
        : null,
      expires_at: parsedExpiresAt ?? null,
    };

    setCreating(true);
    const response = editingId
      ? await CouponsService.adminUpdate(editingId, payload)
      : await CouponsService.adminCreate({ ...payload, code: trimmedCode });
    setCreating(false);

    if (response.success) {
      closeForm();
      fetchCoupons();
    } else {
      Alert.alert(
        editingId ? "Erro ao salvar cupom" : "Erro ao criar cupom",
        response.message,
      );
    }
  };

  const handleToggle = async (coupon: Coupon) => {
    const nextActive = !coupon.is_active;
    const response = await CouponsService.adminToggle(coupon.id, nextActive);
    if (response.success) {
      setCoupons((prev) =>
        prev.map((c) =>
          c.id === coupon.id ? { ...c, is_active: nextActive } : c,
        ),
      );
    } else {
      Alert.alert("Erro", response.message);
    }
  };

  if (!isStaff) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <MaterialCommunityIcons name="shield-lock-outline" size={56} color={COLORS.brand} />
          <Text style={{ fontSize: 18, fontWeight: "800", color: COLORS.text, marginTop: 16 }}>
            Acesso restrito
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.muted, marginTop: 4, textAlign: "center" }}>
            Esta área é exclusiva para a equipe da Hema Cereais.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 14,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.text, marginLeft: 4, flex: 1 }}>
          Cupons de Desconto
        </Text>
        <TouchableOpacity
          onPress={() => (showForm ? closeForm() : setShowForm(true))}
          hitSlop={10}
          activeOpacity={0.7}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: showForm ? COLORS.border : COLORS.brand,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MaterialCommunityIcons
            name={showForm ? "close" : "plus"}
            size={20}
            color={showForm ? COLORS.text : "#FFFFFF"}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchCoupons();
              }}
              tintColor={COLORS.brand}
            />
          }
        >
          {showForm ? (
            <View
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: COLORS.border,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.muted, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>
                {editingId ? "Editar cupom" : "Novo cupom"}
              </Text>

              <Field label={editingId ? "Código (não pode ser alterado)" : "Código"}>
                <TextInput
                  value={code}
                  onChangeText={(t) => setCode(t.toUpperCase())}
                  placeholder="Ex: SORTEIO50"
                  placeholderTextColor="#A8A29E"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!editingId}
                  style={[inputStyle, editingId ? { backgroundColor: COLORS.bg, color: COLORS.muted } : null]}
                />
              </Field>

              <Field label="Descrição (uso interno, opcional)">
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Ex: Influencer Fulano"
                  placeholderTextColor="#A8A29E"
                  style={inputStyle}
                />
              </Field>

              <Field label="Desconto (%)">
                <TextInput
                  value={discountPercent}
                  onChangeText={setDiscountPercent}
                  placeholder="Ex: 10"
                  placeholderTextColor="#A8A29E"
                  keyboardType="numeric"
                  style={inputStyle}
                />
              </Field>

              <Field label="Modalidade">
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setIsSingleUse(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      alignItems: "center",
                      borderColor: !isSingleUse ? COLORS.brand : COLORS.border,
                      backgroundColor: !isSingleUse ? `${COLORS.brand}0D` : "#FFFFFF",
                    }}
                  >
                    <Text style={{ fontWeight: "700", fontSize: 13, color: !isSingleUse ? COLORS.brand : COLORS.text }}>
                      Recorrente
                    </Text>
                    <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                      Parceiros/influencers
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIsSingleUse(true)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      alignItems: "center",
                      borderColor: isSingleUse ? COLORS.brand : COLORS.border,
                      backgroundColor: isSingleUse ? `${COLORS.brand}0D` : "#FFFFFF",
                    }}
                  >
                    <Text style={{ fontWeight: "700", fontSize: 13, color: isSingleUse ? COLORS.brand : COLORS.text }}>
                      Uso único
                    </Text>
                    <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                      Ex: sorteio
                    </Text>
                  </TouchableOpacity>
                </View>
              </Field>

              {!isSingleUse && (
                <Field label="Limite total de usos (vazio = ilimitado)">
                  <TextInput
                    value={maxUses}
                    onChangeText={setMaxUses}
                    placeholder="Ex: 100"
                    placeholderTextColor="#A8A29E"
                    keyboardType="numeric"
                    style={inputStyle}
                  />
                </Field>
              )}

              <Field label="Valor mínimo do pedido (opcional)">
                <TextInput
                  value={minOrderTotal}
                  onChangeText={setMinOrderTotal}
                  placeholder="Ex: 80,00"
                  placeholderTextColor="#A8A29E"
                  keyboardType="numeric"
                  style={inputStyle}
                />
              </Field>

              <Field label="Validade (opcional, DD/MM/AAAA)">
                <TextInput
                  value={expiresAt}
                  onChangeText={setExpiresAt}
                  placeholder="Ex: 31/12/2026"
                  placeholderTextColor="#A8A29E"
                  keyboardType="numbers-and-punctuation"
                  style={inputStyle}
                />
              </Field>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={creating}
                activeOpacity={0.85}
                style={{
                  backgroundColor: COLORS.brand,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ fontSize: 14.5, fontWeight: "800", color: "#FFFFFF" }}>
                    {editingId ? "Salvar alterações" : "Criar cupom"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : coupons.length === 0 ? (
            <Text style={{ textAlign: "center", color: COLORS.muted, marginTop: 40, fontSize: 13.5 }}>
              Nenhum cupom cadastrado ainda.
            </Text>
          ) : (
            coupons.map((coupon) => {
              const situacao = situacaoDoCoupon(coupon);
              const toneColor =
                situacao.tone === "ok" ? COLORS.ok : situacao.tone === "warn" ? COLORS.warn : COLORS.muted;

              return (
                <View
                  key={coupon.id}
                  style={{
                    backgroundColor: COLORS.card,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.text }}>
                        {coupon.code}
                      </Text>
                      {!!coupon.description && (
                        <Text style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 2 }}>
                          {coupon.description}
                        </Text>
                      )}
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 8,
                        backgroundColor: `${toneColor}1A`,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "800", color: toneColor }}>
                        {situacao.label}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 14 }}>
                    <Text style={{ fontSize: 12.5, color: COLORS.muted }}>
                      <Text style={{ fontWeight: "700", color: COLORS.text }}>{coupon.discount_percent}%</Text> off
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.muted }}>
                      {coupon.max_uses === 1 ? "Uso único" : "Recorrente"}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: COLORS.muted }}>
                      Usos: {coupon.used_count}
                      {coupon.max_uses !== null ? `/${coupon.max_uses}` : " (ilimitado)"}
                    </Text>
                    {coupon.min_order_total !== null && (
                      <Text style={{ fontSize: 12.5, color: COLORS.muted }}>
                        Mín. R$ {Number(coupon.min_order_total).toFixed(2)}
                      </Text>
                    )}
                    <Text style={{ fontSize: 12.5, color: COLORS.muted }}>
                      {formatDate(coupon.expires_at)}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={() => startEdit(coupon)}
                      hitSlop={6}
                      style={{
                        width: 40,
                        paddingVertical: 9,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={17} color={COLORS.text} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleToggle(coupon)}
                      style={{
                        flex: 1,
                        paddingVertical: 9,
                        borderRadius: 10,
                        borderWidth: 1,
                        alignItems: "center",
                        borderColor: coupon.is_active ? COLORS.border : COLORS.brand,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: coupon.is_active ? COLORS.text : COLORS.brand,
                        }}
                      >
                        {coupon.is_active ? "Desativar" : "Ativar"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
