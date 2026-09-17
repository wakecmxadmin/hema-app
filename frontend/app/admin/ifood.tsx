import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import {
  IfoodService,
  IfoodStatus,
  IfoodSyncResult,
  IfoodCatalogVerification,
  IfoodSellableItem,
  IfoodCallLogEntry,
  IfoodCallFlow,
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
  okBg: "#E6F4EA",
  warn: "#B26A00",
  warnBg: "#FCEFD9",
  err: "#B3261E",
  errBg: "#FBE9E7",
};

/** Bloco de código estilo editor — usado pra qualquer JSON exibido na tela. */
const CODE = {
  bg: "#211D19",
  border: "#3A352E",
  text: "#F5F1EA",
  muted: "#A79E92",
};

const LOG_POLL_MS = 4000;

/** Rótulo legível para cada motivo de descarte devolvido pelo backend. */
const MOTIVOS: Record<string, string> = {
  "sem codigo": "Sem código de barras",
  "codigo invalido": "Código inválido",
  "sem nome": "Sem nome",
  "tipo desconhecido": "Tipo desconhecido",
  "sem preco": "Sem preço",
  "estoque invalido": "Estoque inválido",
};

const FLOW_LABEL: Record<IfoodCallFlow, string> = {
  auth: "Autenticação",
  "ingestion-full": "Ingestão completa",
  "ingestion-partial": "Ingestão parcial",
  other: "Outro",
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

function Card({
  title,
  subtitle,
  number,
  children,
}: {
  title: string;
  subtitle?: string;
  number?: number;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        marginBottom: 18,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: subtitle ? 4 : 8 }}>
        {number !== undefined && (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: COLORS.brand,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 8,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#FFFFFF" }}>{number}</Text>
          </View>
        )}
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: COLORS.text,
            letterSpacing: 0.3,
            flexShrink: 1,
          }}
        >
          {title}
        </Text>
      </View>
      {subtitle && (
        <Text style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 12, lineHeight: 17 }}>
          {subtitle}
        </Text>
      )}
      {children}
    </View>
  );
}

/** Mostra o endpoint real chamado — é o que a homologação pede pra ver rodando. */
function EndpointTag({ method, path }: { method: string; path: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F4F0E8",
        borderRadius: 9,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          backgroundColor: COLORS.text,
          borderRadius: 5,
          paddingHorizontal: 6,
          paddingVertical: 2,
          marginRight: 8,
        }}
      >
        <Text style={{ fontSize: 10.5, fontWeight: "800", color: "#FFFFFF" }}>{method}</Text>
      </View>
      <Text
        style={{ fontSize: 11.5, fontFamily: "monospace", color: COLORS.muted, flexShrink: 1 }}
      >
        {path}
      </Text>
    </View>
  );
}

function StatusBadge({ status, ok }: { status: number; ok: boolean }) {
  const bg = ok ? COLORS.okBg : COLORS.errBg;
  const fg = ok ? COLORS.ok : COLORS.err;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text style={{ fontSize: 11.5, fontWeight: "800", color: fg }}>
        {status > 0 ? `HTTP ${status}` : "SEM RESPOSTA"}
      </Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const blocked = !!busy || !!disabled;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={blocked}
      activeOpacity={0.85}
      style={{
        backgroundColor: COLORS.brand,
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: "center",
        opacity: blocked ? 0.5 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFFFFF" }}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function SecondaryButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const blocked = !!busy || !!disabled;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={blocked}
      activeOpacity={0.8}
      style={{
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: "center",
        opacity: blocked ? 0.6 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color={COLORS.text} />
      ) : (
        <Text style={{ fontSize: 13.5, fontWeight: "700", color: COLORS.text }}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

/** Alterna entre duas opções — usado pro `reset` da carga completa. */
function SegmentedToggle({
  value,
  onChange,
  options,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  options: [string, string];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: "#F4F0E8",
        borderRadius: 10,
        padding: 3,
        marginBottom: 12,
      }}
    >
      {options.map((label, i) => {
        const active = (i === 1) === value;
        return (
          <TouchableOpacity
            key={label}
            onPress={() => onChange(i === 1)}
            activeOpacity={0.8}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              alignItems: "center",
              backgroundColor: active ? COLORS.card : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: "700",
                color: active ? COLORS.text : COLORS.muted,
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * Link "ver / ocultar body da requisição" — usado pra mostrar o payload
 * antes de enviar. Some sozinho assim que o envio real começa.
 */
function PreviewToggle({
  open,
  onToggle,
  loading,
}: {
  open: boolean;
  onToggle: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
    >
      <MaterialCommunityIcons
        name={open ? "eye-off-outline" : "eye-outline"}
        size={16}
        color={COLORS.brand}
      />
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: COLORS.brand, marginLeft: 6 }}>
        {open ? "Ocultar body da requisição" : "Ver body da requisição"}
      </Text>
      {loading && (
        <ActivityIndicator size="small" color={COLORS.brand} style={{ marginLeft: 8 }} />
      )}
    </TouchableOpacity>
  );
}

/**
 * JSON em bloco de código escuro — com scroll horizontal pra não quebrar
 * linhas longas. `accent` marca uma prévia (ainda não enviada) em vermelho,
 * pra diferenciar visualmente de uma resposta real.
 */
function JsonBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: unknown;
  accent?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: CODE.bg,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: CODE.border,
        paddingTop: 10,
        marginTop: 10,
        overflow: "hidden",
      }}
    >
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: "800",
          color: accent ? "#FF9587" : CODE.muted,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          paddingHorizontal: 12,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text
          style={{
            fontSize: 12,
            fontFamily: "monospace",
            color: CODE.text,
            lineHeight: 17,
            paddingHorizontal: 12,
            paddingBottom: 12,
          }}
        >
          {value !== undefined ? JSON.stringify(value, null, 2) : "—"}
        </Text>
      </ScrollView>
    </View>
  );
}

/** JSON de uma chamada real, exibido logo abaixo do botão que a disparou. */
function CallJsonCard({ call }: { call: IfoodCallLogEntry }) {
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text
          style={{ fontSize: 11, fontFamily: "monospace", color: COLORS.muted, flexShrink: 1 }}
        >
          {call.method} {call.path}
        </Text>
        <StatusBadge status={call.status} ok={call.ok} />
      </View>
      <JsonBox label="Headers (autenticação inclusa)" value={call.headers} />
      <JsonBox label="RESPONSE" value={call.response} />
    </View>
  );
}

function SyncResultCard({ result }: { result: IfoodSyncResult }) {
  return (
    <View style={{ marginTop: 12 }}>
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

      {Object.entries(result.motivoIgnorados).map(([motivo, qtd]) => (
        <Row
          key={motivo}
          label={MOTIVOS[motivo] ?? motivo}
          value={String(qtd)}
          tone="warn"
        />
      ))}

      {result.falhas.map((f) => (
        <Row
          key={f.lote}
          label={`Lote ${f.lote} com falha`}
          value={`HTTP ${f.status}`}
          tone="warn"
        />
      ))}
    </View>
  );
}

interface TableColumn {
  key: string;
  label: string;
  width: number;
}

/** Tabela com rolagem lateral — usada nos dados que o iFood devolve na conferência. */
function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  renderCell,
}: {
  columns: TableColumn[];
  rows: T[];
  keyExtractor: (row: T, index: number) => string;
  renderCell: (row: T, columnKey: string) => React.ReactNode;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginTop: 10 }}>
      <View>
        <View
          style={{
            flexDirection: "row",
            paddingBottom: 8,
            borderBottomWidth: 1.5,
            borderBottomColor: COLORS.text,
          }}
        >
          {columns.map((col) => (
            <Text
              key={col.key}
              style={{
                width: col.width,
                fontSize: 10.5,
                fontWeight: "800",
                color: COLORS.muted,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                paddingRight: 8,
              }}
            >
              {col.label}
            </Text>
          ))}
        </View>
        {rows.map((row, i) => (
          <View
            key={keyExtractor(row, i)}
            style={{
              flexDirection: "row",
              paddingVertical: 9,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border,
              alignItems: "center",
            }}
          >
            {columns.map((col) => (
              <View key={col.key} style={{ width: col.width, paddingRight: 8 }}>
                {renderCell(row, col.key)}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const SELLABLE_COLUMNS: TableColumn[] = [
  { key: "img", label: "", width: 40 },
  { key: "nome", label: "Nome", width: 170 },
  { key: "categoria", label: "Categoria", width: 110 },
  { key: "codigo", label: "EAN / código", width: 120 },
  { key: "preco", label: "Preço", width: 80 },
  { key: "unidade", label: "Unid.", width: 55 },
];

function renderSellableCell(item: IfoodSellableItem, key: string): React.ReactNode {
  switch (key) {
    case "img":
      return item.logosUrls?.[0] ? (
        <Image
          source={{ uri: item.logosUrls[0] }}
          style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: COLORS.border }}
        />
      ) : (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            backgroundColor: COLORS.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MaterialCommunityIcons name="image-off-outline" size={14} color={COLORS.muted} />
        </View>
      );
    case "nome":
      return (
        <Text style={{ fontSize: 12.5, color: COLORS.text, fontWeight: "600" }} numberOfLines={2}>
          {item.itemName || "—"}
        </Text>
      );
    case "categoria":
      return (
        <Text style={{ fontSize: 12, color: COLORS.muted }} numberOfLines={2}>
          {item.categoryName || "—"}
        </Text>
      );
    case "codigo":
      return (
        <Text style={{ fontSize: 11.5, color: COLORS.muted, fontFamily: "monospace" }}>
          {item.itemEan || item.itemExternalCode || "—"}
        </Text>
      );
    case "preco":
      return (
        <Text style={{ fontSize: 12.5, color: COLORS.ok, fontWeight: "700" }}>
          {item.itemPrice ? `R$ ${item.itemPrice.value.toFixed(2)}` : "—"}
        </Text>
      );
    case "unidade":
      return <Text style={{ fontSize: 12, color: COLORS.muted }}>{item.itemUnit || "—"}</Text>;
    default:
      return null;
  }
}

const UNSELLABLE_COLUMNS: TableColumn[] = [
  { key: "produto", label: "Produto ID", width: 150 },
  { key: "motivo", label: "Motivo", width: 260 },
];

function renderUnsellableCell(
  item: { produtoId: string; motivo: string[] },
  key: string,
): React.ReactNode {
  switch (key) {
    case "produto":
      return (
        <Text
          style={{ fontSize: 11.5, color: COLORS.text, fontFamily: "monospace" }}
          numberOfLines={2}
        >
          {item.produtoId}
        </Text>
      );
    case "motivo":
      return (
        <Text style={{ fontSize: 12, color: COLORS.warn }} numberOfLines={3}>
          {item.motivo.join(", ")}
        </Text>
      );
    default:
      return null;
  }
}

function LogEntryRow({ entry }: { entry: IfoodCallLogEntry }) {
  const [open, setOpen] = useState(false);
  const hora = new Date(entry.timestamp).toLocaleTimeString("pt-BR");

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        paddingVertical: 10,
      }}
    >
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: COLORS.text }}>
            {FLOW_LABEL[entry.flow]}
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "monospace",
              color: COLORS.muted,
              marginTop: 2,
            }}
          >
            {entry.method} {entry.path}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <StatusBadge status={entry.status} ok={entry.ok} />
          <Text style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 4 }}>
            {hora} · {entry.durationMs}ms
          </Text>
        </View>
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={COLORS.muted}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>

      {open && (
        <>
          <JsonBox label="Headers (autenticação inclusa)" value={entry.headers} />
          <JsonBox label="REQUEST" value={entry.request} />
          <JsonBox label="RESPONSE" value={entry.response} />
        </>
      )}
    </View>
  );
}

export default function IfoodIntegrationScreen() {
  const router = useRouter();
  const { isStaff } = useCart();

  const [status, setStatus] = useState<IfoodStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Endpoint 1/3 — POST /authentication/v1.0/oauth/token
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenCalledAt, setTokenCalledAt] = useState<Date | null>(null);
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const [tokenOk, setTokenOk] = useState<boolean | null>(null);
  const [tokenCalls, setTokenCalls] = useState<IfoodCallLogEntry[]>([]);
  const [tokenPreviewOpen, setTokenPreviewOpen] = useState(false);

  // Endpoint 2/3 — POST /item/v1.0/ingestion/{merchantId}?reset=
  const [fullReset, setFullReset] = useState(false);
  const [fullBusy, setFullBusy] = useState<"none" | "dry" | "real">("none");
  const [fullResult, setFullResult] = useState<IfoodSyncResult | null>(null);
  const [fullCalls, setFullCalls] = useState<IfoodCallLogEntry[]>([]);
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const [fullPreviewLoading, setFullPreviewLoading] = useState(false);
  const [fullPreviewPayload, setFullPreviewPayload] = useState<any[] | null>(null);

  // Endpoint 3/3 — PATCH /item/v1.0/ingestion/{merchantId} (price-stock)
  const [partialBusy, setPartialBusy] = useState<"none" | "dry" | "real">("none");
  const [partialResult, setPartialResult] = useState<IfoodSyncResult | null>(null);
  const [partialCalls, setPartialCalls] = useState<IfoodCallLogEntry[]>([]);
  const [partialPreviewOpen, setPartialPreviewOpen] = useState(false);
  const [partialPreviewLoading, setPartialPreviewLoading] = useState(false);
  const [partialPreviewPayload, setPartialPreviewPayload] = useState<any[] | null>(null);

  const [verification, setVerification] = useState<IfoodCatalogVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Monitoramento — histórico de chamadas
  const [log, setLog] = useState<IfoodCallLogEntry[]>([]);
  const logPoll = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    const response = await IfoodService.status();
    if (response.success && response.data) setStatus(response.data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const fetchLog = useCallback(async () => {
    const response = await IfoodService.callLog();
    if (response.success && response.data) setLog(response.data);
    return response.data ?? [];
  }, []);

  /** Chamadas de um fluxo feitas depois de `since` — em ordem cronológica (lote 1, 2, ...). */
  const callsSince = (
    entries: IfoodCallLogEntry[],
    flow: IfoodCallLogEntry["flow"],
    since: Date,
  ): IfoodCallLogEntry[] =>
    entries
      .filter(
        (e) => e.flow === flow && new Date(e.timestamp).getTime() >= since.getTime() - 500,
      )
      .sort((a, b) => a.id - b.id);

  useEffect(() => {
    if (!isStaff) {
      setLoading(false);
      return;
    }
    fetchStatus();
    fetchLog();

    logPoll.current = setInterval(fetchLog, LOG_POLL_MS);
    return () => {
      if (logPoll.current) clearInterval(logPoll.current);
    };
  }, [isStaff, fetchStatus, fetchLog]);

  const runToken = async () => {
    const startedAt = new Date();
    setTokenPreviewOpen(false);
    setTokenBusy(true);
    const response = await IfoodService.authToken();
    setTokenBusy(false);
    setTokenCalledAt(new Date());
    setTokenOk(response.success);
    setTokenMessage(response.message);
    fetchStatus();

    const entries = await fetchLog();
    setTokenCalls(callsSince(entries, "auth", startedAt));
  };

  const toggleTokenPreview = () => setTokenPreviewOpen((v) => !v);

  const toggleFullPreview = async () => {
    if (fullPreviewOpen) {
      setFullPreviewOpen(false);
      return;
    }
    setFullPreviewOpen(true);
    if (!fullPreviewPayload) {
      setFullPreviewLoading(true);
      const response = await IfoodService.sync({ dryRun: true, mode: "post", reset: fullReset });
      setFullPreviewLoading(false);
      if (response.data) setFullPreviewPayload(response.data.amostraPayload);
    }
  };

  const togglePartialPreview = async () => {
    if (partialPreviewOpen) {
      setPartialPreviewOpen(false);
      return;
    }
    setPartialPreviewOpen(true);
    if (!partialPreviewPayload) {
      setPartialPreviewLoading(true);
      const response = await IfoodService.sync({ dryRun: true, fields: "price-stock" });
      setPartialPreviewLoading(false);
      if (response.data) setPartialPreviewPayload(response.data.amostraPayload);
    }
  };

  const runFullSync = async (dryRun: boolean) => {
    const startedAt = new Date();
    if (!dryRun) setFullPreviewOpen(false);
    setFullBusy(dryRun ? "dry" : "real");
    const response = await IfoodService.sync({ dryRun, mode: "post", reset: fullReset });
    setFullBusy("none");

    if (response.data) setFullResult(response.data);
    if (!response.success && !response.data) {
      Alert.alert("Falha na carga completa", response.message);
    }

    if (dryRun) {
      setFullCalls([]);
    } else {
      const entries = await fetchLog();
      setFullCalls(callsSince(entries, "ingestion-full", startedAt));
    }
  };

  const runPartialSync = async (dryRun: boolean) => {
    const startedAt = new Date();
    if (!dryRun) setPartialPreviewOpen(false);
    setPartialBusy(dryRun ? "dry" : "real");
    const response = await IfoodService.sync({ dryRun, fields: "price-stock" });
    setPartialBusy("none");

    if (response.data) setPartialResult(response.data);
    if (!response.success && !response.data) {
      Alert.alert("Falha na atualização parcial", response.message);
    }

    if (dryRun) {
      setPartialCalls([]);
    } else {
      const entries = await fetchLog();
      setPartialCalls(callsSince(entries, "ingestion-partial", startedAt));
    }
  };

  const runVerify = async () => {
    setVerifying(true);
    const response = await IfoodService.verifyCatalog();
    setVerifying(false);
    fetchLog();

    if (response.data) {
      setVerification(response.data);
    } else {
      Alert.alert("Falha na conferência", response.message);
    }
  };

  const confirmFullSync = () => {
    Alert.alert(
      "Enviar carga completa ao iFood?",
      fullReset
        ? "O catálogo da loja será resetado e reenviado por completo."
        : "Todos os produtos serão publicados na loja vinculada, com preço e estoque atuais.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Enviar", style: "destructive", onPress: () => runFullSync(false) },
      ],
    );
  };

  const confirmPartialSync = () => {
    Alert.alert(
      "Enviar atualização parcial?",
      "Preço e estoque atuais serão atualizados na loja vinculada, sem tocar nome, imagem ou categoria.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Enviar", style: "destructive", onPress: () => runPartialSync(false) },
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

  const merchantId = status?.merchantId ?? "{merchantId}";
  const fullBusyAny = fullBusy !== "none";
  const partialBusyAny = partialBusy !== "none";

  const tokenPreviewBody =
    status?.modo === "distributed"
      ? { grantType: "refresh_token", clientId: "••••••", refreshToken: "••••••" }
      : { grantType: "client_credentials", clientId: "••••••", clientSecret: "••••••" };
  const tokenPreviewHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const ingestionPreviewHeaders = {
    Authorization: status?.autenticado
      ? "Bearer <token em cache — gerado na seção 1>"
      : "— sem token, gere um na seção 1 —",
    "Content-Type": "application/json",
    Accept: "application/json",
  };

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
                fetchLog();
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

          {/* Endpoint 1/3 — Autenticação */}
          <Card
            number={1}
            title="Autenticação"
            subtitle="Gera o token usado por todas as outras chamadas."
          >
            <EndpointTag method="POST" path="/authentication/v1.0/oauth/token" />

            <PreviewToggle open={tokenPreviewOpen} onToggle={toggleTokenPreview} />
            {tokenPreviewOpen && (
              <>
                <JsonBox label="Headers (prévia)" value={tokenPreviewHeaders} accent />
                <JsonBox label="Body da requisição (prévia)" value={tokenPreviewBody} accent />
              </>
            )}

            <View style={{ marginTop: tokenPreviewOpen ? 12 : 0 }}>
              <PrimaryButton label="Gerar / renovar token" onPress={runToken} busy={tokenBusy} />
            </View>

            {tokenCalls.map((call) => (
              <CallJsonCard key={call.id} call={call} />
            ))}
            {tokenMessage && (
              <View style={{ marginTop: 12 }}>
                <Row
                  label="Resultado"
                  value={tokenOk ? "Autenticado" : "Falhou"}
                  tone={tokenOk ? "ok" : "warn"}
                />
                <Row label="Mensagem" value={tokenMessage} />
                {tokenCalledAt && (
                  <Row label="Chamado em" value={tokenCalledAt.toLocaleTimeString("pt-BR")} />
                )}
              </View>
            )}
          </Card>

          {/* Endpoint 2/3 — Ingestão completa */}
          <Card
            number={2}
            title="Ingestão — carga completa"
            subtitle="Criação/reativação de itens. Envia o catálogo inteiro."
          >
            <EndpointTag
              method="POST"
              path={`/item/v1.0/ingestion/${merchantId}${fullReset ? "?reset=true" : "?reset=false"}`}
            />
            <SegmentedToggle
              value={fullReset}
              onChange={(v) => {
                setFullReset(v);
                setFullPreviewPayload(null);
                setFullPreviewOpen(false);
              }}
              options={["Sem reset", "Com reset"]}
            />

            <PreviewToggle
              open={fullPreviewOpen}
              onToggle={toggleFullPreview}
              loading={fullPreviewLoading}
            />
            {fullPreviewOpen && !fullPreviewLoading && (
              <>
                <JsonBox label="Headers (prévia)" value={ingestionPreviewHeaders} accent />
                <JsonBox
                  label="Body da requisição (prévia — até 3 itens)"
                  value={fullPreviewPayload}
                  accent
                />
              </>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: fullPreviewOpen ? 12 : 0 }}>
              <View style={{ flex: 1 }}>
                <SecondaryButton
                  label="Simular"
                  onPress={() => runFullSync(true)}
                  busy={fullBusy === "dry"}
                  disabled={fullBusyAny && fullBusy !== "dry"}
                />
              </View>
              <View style={{ flex: 1.3 }}>
                <PrimaryButton
                  label="Enviar carga completa"
                  onPress={confirmFullSync}
                  busy={fullBusy === "real"}
                  disabled={(fullBusyAny && fullBusy !== "real") || !status?.autenticado}
                />
              </View>
            </View>
            {fullResult?.dryRun && (
              <JsonBox label="RESULTADO (SIMULAÇÃO — NENHUMA CHAMADA FOI FEITA)" value={fullResult} />
            )}
            {fullCalls.map((call) => (
              <CallJsonCard key={call.id} call={call} />
            ))}
            {fullResult && (
              <>
                <Text style={{ fontSize: 11, fontWeight: "800", color: COLORS.muted, marginTop: 14 }}>
                  {fullResult.dryRun ? "SIMULAÇÃO — NADA FOI PUBLICADO" : "ÚLTIMO ENVIO"}
                </Text>
                <SyncResultCard result={fullResult} />
              </>
            )}
          </Card>

          {/* Endpoint 3/3 — Ingestão parcial */}
          <Card
            number={3}
            title="Ingestão — atualização parcial"
            subtitle="Só preço e estoque (barcode + prices + inventory). Não toca nome, imagem ou categoria."
          >
            <EndpointTag method="PATCH" path={`/item/v1.0/ingestion/${merchantId}`} />

            <PreviewToggle
              open={partialPreviewOpen}
              onToggle={togglePartialPreview}
              loading={partialPreviewLoading}
            />
            {partialPreviewOpen && !partialPreviewLoading && (
              <>
                <JsonBox label="Headers (prévia)" value={ingestionPreviewHeaders} accent />
                <JsonBox
                  label="Body da requisição (prévia — até 3 itens)"
                  value={partialPreviewPayload}
                  accent
                />
              </>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: partialPreviewOpen ? 12 : 0 }}>
              <View style={{ flex: 1 }}>
                <SecondaryButton
                  label="Simular"
                  onPress={() => runPartialSync(true)}
                  busy={partialBusy === "dry"}
                  disabled={partialBusyAny && partialBusy !== "dry"}
                />
              </View>
              <View style={{ flex: 1.3 }}>
                <PrimaryButton
                  label="Enviar atualização"
                  onPress={confirmPartialSync}
                  busy={partialBusy === "real"}
                  disabled={(partialBusyAny && partialBusy !== "real") || !status?.autenticado}
                />
              </View>
            </View>
            {partialResult?.dryRun && (
              <JsonBox label="RESULTADO (SIMULAÇÃO — NENHUMA CHAMADA FOI FEITA)" value={partialResult} />
            )}
            {partialCalls.map((call) => (
              <CallJsonCard key={call.id} call={call} />
            ))}
            {partialResult && (
              <>
                <Text style={{ fontSize: 11, fontWeight: "800", color: COLORS.muted, marginTop: 14 }}>
                  {partialResult.dryRun ? "SIMULAÇÃO — NADA FOI PUBLICADO" : "ÚLTIMO ENVIO"}
                </Text>
                <SyncResultCard result={partialResult} />
              </>
            )}
          </Card>

          {/* Conferência — complementa os 3 endpoints acima */}
          <Card
            title="Conferir no iFood"
            subtitle="O que ficou gravado depois de um envio real — Catalog v2.0, que funciona no app de teste independente da homologação (que vale só pro app de produção)."
          >
            <SecondaryButton
              label="Conferir no iFood"
              onPress={runVerify}
              busy={verifying}
            />

            {verification && (
              <View style={{ marginTop: 12 }}>
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
                {verification.catalogs.map((c) => (
                  <Row
                    key={c.catalogId}
                    label={`Catálogo ${c.catalogId.slice(0, 8)}…`}
                    value={
                      c.modifiedAt
                        ? `${c.status} · ${new Date(c.modifiedAt).toLocaleString("pt-BR")}`
                        : c.status
                    }
                  />
                ))}

                {verification.amostraSellable.length > 0 && (
                  <>
                    <Text
                      style={{ fontSize: 11, fontWeight: "800", color: COLORS.muted, marginTop: 14 }}
                    >
                      VENDÁVEIS — mostrando {verification.amostraSellable.length} de{" "}
                      {verification.sellableCount}
                    </Text>
                    <DataTable
                      columns={SELLABLE_COLUMNS}
                      rows={verification.amostraSellable}
                      keyExtractor={(item) => item.itemId}
                      renderCell={renderSellableCell}
                    />
                  </>
                )}

                {verification.unsellable.length > 0 && (
                  <>
                    <Text
                      style={{ fontSize: 11, fontWeight: "800", color: COLORS.muted, marginTop: 14 }}
                    >
                      REJEITADOS — mostrando {verification.unsellable.length} de{" "}
                      {verification.unsellableCount}
                    </Text>
                    <DataTable
                      columns={UNSELLABLE_COLUMNS}
                      rows={verification.unsellable}
                      keyExtractor={(item, i) => `${item.produtoId}-${i}`}
                      renderCell={renderUnsellableCell}
                    />
                  </>
                )}
              </View>
            )}
          </Card>

          {/* Monitoramento */}
          <Card
            title="Monitoramento"
            subtitle={`Últimas chamadas à Merchant-API — atualiza a cada ${LOG_POLL_MS / 1000}s.`}
          >
            {log.length === 0 ? (
              <Text style={{ fontSize: 12.5, color: COLORS.muted, paddingVertical: 10 }}>
                Nenhuma chamada registrada ainda. Use os botões acima.
              </Text>
            ) : (
              log.map((entry) => <LogEntryRow key={entry.id} entry={entry} />)
            )}
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
