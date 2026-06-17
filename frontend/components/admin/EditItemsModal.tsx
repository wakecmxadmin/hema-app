import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { OrderItemEdit } from "@/services/admin-orders";

interface OrderItem {
  id: string;
  product_name: string;
  product_price: number;
  quantity: number | null;
  weight: number | null;
  subtotal: number;
}

interface EditState {
  remove: boolean;
  // Para unit
  quantity: number;
  // Para weight (em gramas)
  weight: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  items: OrderItem[];
  deliveryFee: number;
  loading: boolean;
  onConfirm: (edits: OrderItemEdit[]) => void;
}

function formatPrice(n: number) {
  return Number(n).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function EditItemsModal({
  visible,
  onClose,
  items,
  deliveryFee,
  loading,
  onConfirm,
}: Props) {
  const [edits, setEdits] = useState<Record<string, EditState>>({});

  // Reseta quando reabre.
  React.useEffect(() => {
    if (visible) {
      const init: Record<string, EditState> = {};
      for (const it of items) {
        init[it.id] = {
          remove: false,
          quantity: it.quantity ?? 0,
          weight: it.weight ?? 0,
        };
      }
      setEdits(init);
    }
  }, [visible, items]);

  const computed = useMemo(() => {
    let newSubtotal = 0;
    const changes: OrderItemEdit[] = [];

    for (const it of items) {
      const state = edits[it.id];
      if (!state) continue;
      const isUnit = it.quantity != null;

      if (state.remove) {
        if (isUnit) changes.push({ order_item_id: it.id, new_quantity: 0 });
        else changes.push({ order_item_id: it.id, new_weight: 0 });
        continue;
      }

      if (isUnit) {
        const curr = Number(it.quantity);
        const next = state.quantity;
        if (next !== curr) {
          changes.push({ order_item_id: it.id, new_quantity: next });
        }
        newSubtotal += Number(it.product_price) * next;
      } else {
        const currW = Number(it.weight);
        const nextW = state.weight;
        if (nextW !== currW) {
          changes.push({ order_item_id: it.id, new_weight: nextW });
        }
        newSubtotal += Number(it.product_price) * (nextW / 1000);
      }
    }

    return {
      changes,
      newSubtotal,
      newTotal: newSubtotal + deliveryFee,
    };
  }, [edits, items, deliveryFee]);

  const hasChanges = computed.changes.length > 0;
  const isZero = computed.newSubtotal === 0;

  const toggleRemove = (itemId: string) => {
    setEdits((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], remove: !prev[itemId].remove },
    }));
  };

  const changeQuantity = (itemId: string, max: number, delta: number) => {
    setEdits((prev) => {
      const next = Math.max(0, Math.min(max, prev[itemId].quantity + delta));
      return { ...prev, [itemId]: { ...prev[itemId], quantity: next } };
    });
  };

  const setWeight = (itemId: string, raw: string, max: number) => {
    const num = Math.max(0, Math.min(max, Number(raw.replace(/\D/g, "")) || 0));
    setEdits((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], weight: num },
    }));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            className="bg-surface"
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "85%",
              paddingTop: 12,
              paddingBottom: Platform.OS === "ios" ? 28 : 16,
            }}
          >
          <View
            style={{
              width: 40,
              height: 4,
              backgroundColor: "#EAE3D7",
              borderRadius: 2,
              alignSelf: "center",
              marginBottom: 12,
            }}
          />
          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <Text className="text-[18px] font-bold text-text-primary">
              Editar itens
            </Text>
            <Text className="text-[12.5px] text-text-secondary mt-1">
              Só dá pra reduzir ou remover (nunca aumentar). Cliente verá o novo
              total antes de pagar.
            </Text>
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {items.map((it) => {
              const state = edits[it.id];
              if (!state) return null;
              const isUnit = it.quantity != null;
              const maxQty = isUnit ? Number(it.quantity) : 0;
              const maxWeight = !isUnit ? Number(it.weight) : 0;
              const muted = state.remove;

              return (
                <View
                  key={it.id}
                  style={{
                    borderWidth: 1,
                    borderColor: muted ? "#FECACA" : "#EAE3D7",
                    backgroundColor: muted ? "#FEF2F2" : "#FFFFFF",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      className="text-[14px] font-bold text-text-primary"
                      style={{ flex: 1, marginRight: 8, opacity: muted ? 0.5 : 1 }}
                      numberOfLines={2}
                    >
                      {it.product_name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => toggleRemove(it.id)}
                      hitSlop={8}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 8,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: muted ? "#D91A21" : "#FEF2F2",
                      }}
                    >
                      <MaterialCommunityIcons
                        name={muted ? "undo-variant" : "trash-can-outline"}
                        size={14}
                        color={muted ? "#FFFFFF" : "#D91A21"}
                      />
                      <Text
                        style={{
                          marginLeft: 4,
                          fontSize: 12,
                          fontWeight: "700",
                          color: muted ? "#FFFFFF" : "#D91A21",
                        }}
                      >
                        {muted ? "Restaurar" : "Remover"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {!muted && isUnit && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text className="text-[12px] text-text-secondary">
                        Quantidade (máx {maxQty}):
                      </Text>
                      <View
                        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                      >
                        <TouchableOpacity
                          onPress={() => changeQuantity(it.id, maxQty, -1)}
                          disabled={state.quantity <= 0}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: "#EAE3D7",
                            justifyContent: "center",
                            alignItems: "center",
                            opacity: state.quantity <= 0 ? 0.4 : 1,
                          }}
                        >
                          <MaterialCommunityIcons name="minus" size={16} color="#1A1613" />
                        </TouchableOpacity>
                        <Text
                          style={{
                            minWidth: 30,
                            textAlign: "center",
                            fontSize: 14,
                            fontWeight: "700",
                          }}
                        >
                          {state.quantity}
                        </Text>
                        <TouchableOpacity
                          onPress={() => changeQuantity(it.id, maxQty, +1)}
                          disabled={state.quantity >= maxQty}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: "#EAE3D7",
                            justifyContent: "center",
                            alignItems: "center",
                            opacity: state.quantity >= maxQty ? 0.4 : 1,
                          }}
                        >
                          <MaterialCommunityIcons name="plus" size={16} color="#1A1613" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {!muted && !isUnit && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text className="text-[12px] text-text-secondary">
                        Peso em g (máx {maxWeight}):
                      </Text>
                      <TextInput
                        keyboardType="number-pad"
                        value={String(state.weight)}
                        onChangeText={(t) => setWeight(it.id, t, maxWeight)}
                        style={{
                          borderWidth: 1,
                          borderColor: "#EAE3D7",
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          minWidth: 90,
                          textAlign: "right",
                          fontSize: 14,
                          fontWeight: "700",
                          color: "#1A1613",
                        }}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: "#F2EBDF",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <Text className="text-[13px] text-text-secondary">Subtotal</Text>
              <Text className="text-[13px] text-text-primary">
                {formatPrice(computed.newSubtotal)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <Text className="text-[13px] text-text-secondary">
                Taxa de entrega
              </Text>
              <Text className="text-[13px] text-text-primary">
                {deliveryFee > 0 ? formatPrice(deliveryFee) : "Grátis"}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 6,
                marginBottom: 12,
              }}
            >
              <Text className="text-[15px] font-bold text-text-primary">Total</Text>
              <Text className="text-[18px] font-extrabold text-text-primary">
                {formatPrice(computed.newTotal)}
              </Text>
            </View>

            {isZero && (
              <Text
                className="text-[12px] mb-2"
                style={{ color: "#D91A21", textAlign: "center" }}
              >
                Total zerado. Use "Rejeitar pedido" se nada estiver disponível.
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={onClose}
                disabled={loading}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#EAE3D7",
                  alignItems: "center",
                }}
              >
                <Text className="text-text-primary text-[14px] font-bold">Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onConfirm(computed.changes)}
                disabled={loading || !hasChanges || isZero}
                style={{
                  flex: 1.4,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: "#10B981",
                  alignItems: "center",
                  opacity: loading || !hasChanges || isZero ? 0.5 : 1,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white text-[14px] font-bold">
                    Confirmar com edições
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
