import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import {
  IfoodService,
  IfoodStatus,
  IfoodSyncResult,
  IfoodCatalogVerification,
} from "@/services/ifood";
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

/** Rótulo legível para cada motivo de descarte devolvido pelo backend. */
const MOTIVOS: Record<string, string> = {
  "sem codigo": "Sem código de barras",
  "codigo invalido": "Código inválido",
  "sem nome": "Sem nome",
  "tipo desconhecido": "Tipo desconhecido",
  "sem preco": "Sem preço",
  "estoque invalido": "Estoque inválido",
};

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "ok" | "warn";
}) {
  const color =
    tone === "ok" ? COLORS.ok : tone === "warn" ? COLORS.warn : COLORS.text;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
      }}
    >
      <Text style={{ fontSize: 13.5, color: COLORS.muted }}>{label}</Text>
      <Text
        style={{ fontSize: 13.5, fontWeight: "700", color, flexShrink: 1, textAlign: "right" }}
      >
        {value}
      </Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 6,
        marginBottom: 16,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          color: COLORS.muted,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function IfoodIntegrationScreen() {
  const router = useRouter();
  const { isStaff } = useCart();

  const [status, setStatus] = useState<IfoodStatus | null>(null);
  const [result, setResult] = useState<IfoodSyncResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState<"none" | "dry" | "real">("none");
  const [verification, setVerification] = useState<IfoodCatalogVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const fetchStatus = useCallback(async () => {
    const response = await IfoodService.status();
    if (response.success && response.data) setStatus(response.data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (isStaff) fetchStatus();
    else setLoading(false);
  }, [isStaff, fetchStatus]);

  const runSync = async (dryRun: boolean) => {
    setSyncing(dryRun ? "dry" : "real");
    const response = await IfoodService.sync({ dryRun });
    setSyncing("none");

    if (response.data) {
      setResult(response.data);
      setLastRunAt(new Date());
    }

    if (!response.success && !response.data) {
      Alert.alert("Falha na sincronização", response.message);
    }
  };

  const runVerify = async () => {
    setVerifying(true);
    const response = await IfoodService.verifyCatalog();
    setVerifying(false);

    if (response.data) {
      setVerification(response.data);
    } else {
      Alert.alert("Falha na conferência", response.message);
    }
  };

  const confirmRealSync = () => {
    Alert.alert(
      "Enviar catálogo ao iFood?",
      "Os produtos serão publicados na loja vinculada, com preço e estoque atuais.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Enviar", style: "destructive", onPress: () => runSync(false) },
      ],
    );
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

  const busy = syncing !== "none";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
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
        <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.text, marginLeft: 4 }}>
          Integração iFood
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchStatus();
              }}
              tintColor={COLORS.brand}
            />
          }
        >
          <Card title="Conexão">
            <Row
              label="Credenciais"
              value={status?.configurado ? "Configuradas" : "Ausentes"}
              tone={status?.configurado ? "ok" : "warn"}
            />
            <Row
              label="Autenticação"
              value={status?.autenticado ? "Token válido" : "Sem token"}
              tone={status?.autenticado ? "ok" : "warn"}
            />
            <Row
              label="Modo"
              value={status?.modo === "distributed" ? "Distribuído" : "Centralizado"}
            />
            <Row label="Loja (merchantId)" value={status?.merchantId ?? "Não vinculada"} />
            <Row
              label="Sincronização automática"
              value={status?.syncAutomatico ? "A cada hora" : "Desligada"}
            />
          </Card>

          {/* Ações */}
          <TouchableOpacity
            onPress={() => runSync(true)}
            disabled={busy}
            activeOpacity={0.8}
            style={{
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              marginBottom: 10,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {syncing === "dry" ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={{ fontSize: 14.5, fontWeight: "700", color: COLORS.text }}>
                Simular envio (sem publicar)
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={confirmRealSync}
            disabled={busy || !status?.autenticado}
            activeOpacity={0.85}
            style={{
              backgroundColor: COLORS.brand,
              borderRadius: 12,
              paddingVertical: 15,
              alignItems: "center",
              marginBottom: 18,
              opacity: busy || !status?.autenticado ? 0.5 : 1,
            }}
          >
            {syncing === "real" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFFFFF" }}>
                Enviar catálogo ao iFood
              </Text>
            )}
          </TouchableOpacity>

          {/* Resultado */}
          {result && (
            <>
              <Card
                title={
                  result.dryRun ? "Simulação — nada foi publicado" : "Último envio"
                }
              >
                <Row label="Produtos no catálogo" value={String(result.total)} />
                <Row
                  label={result.dryRun ? "Seriam enviados" : "Enviados"}
                  value={String(result.enviados)}
                  tone="ok"
                />
                <Row
                  label="Ignorados"
                  value={String(result.ignorados)}
                  tone={result.ignorados > 0 ? "warn" : "default"}
                />
                <Row label="Lotes" value={String(result.lotes)} />
                {lastRunAt && (
                  <Row
                    label="Executado em"
                    value={lastRunAt.toLocaleString("pt-BR")}
                  />
                )}
              </Card>

              {Object.keys(result.motivoIgnorados).length > 0 && (
                <Card title="Por que foram ignorados">
                  {Object.entries(result.motivoIgnorados).map(([motivo, qtd]) => (
                    <Row
                      key={motivo}
                      label={MOTIVOS[motivo] ?? motivo}
                      value={String(qtd)}
                      tone="warn"
                    />
                  ))}
                </Card>
              )}

              {result.falhas.length > 0 && (
                <Card title="Lotes com falha">
                  {result.falhas.map((f) => (
                    <Row
                      key={f.lote}
                      label={`Lote ${f.lote}`}
                      value={`HTTP ${f.status}`}
                      tone="warn"
                    />
                  ))}
                </Card>
              )}

              {!result.dryRun && (
                <TouchableOpacity
                  onPress={runVerify}
                  disabled={verifying}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: COLORS.card,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    marginBottom: 16,
                    opacity: verifying ? 0.6 : 1,
                  }}
                >
                  {verifying ? (
                    <ActivityIndicator color={COLORS.text} />
                  ) : (
                    <Text style={{ fontSize: 14.5, fontWeight: "700", color: COLORS.text }}>
                      Conferir no iFood
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}

          {verification && (
            <>
              <Card title="O que o iFood tem gravado">
                <Row
                  label="Itens vendáveis"
                  value={String(verification.sellableCount)}
                  tone="ok"
                />
                <Row
                  label="Itens rejeitados"
                  value={String(verification.unsellableCount)}
                  tone={verification.unsellableCount > 0 ? "warn" : "default"}
                />
              </Card>

              {verification.amostraSellable.length > 0 && (
                <Card title="Amostra do que subiu (nome, preço, imagem)">
                  {verification.amostraSellable.map((item) => (
                    <Row
                      key={item.itemId}
                      label={item.itemName || item.itemId}
                      value={
                        item.itemPrice
                          ? `R$ ${item.itemPrice.value.toFixed(2)}`
                          : "—"
                      }
                    />
                  ))}
                </Card>
              )}

              {verification.unsellable.length > 0 && (
                <Card title="Itens rejeitados pelo iFood">
                  {verification.unsellable.map((item, i) => (
                    <Row
                      key={`${item.produtoId}-${i}`}
                      label={item.produtoId}
                      value={item.motivo.join(", ")}
                      tone="warn"
                    />
                  ))}
                </Card>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
