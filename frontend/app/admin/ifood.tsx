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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import {
  IfoodService,
  IfoodStatus,
  IfoodChangesResult,
  IfoodSyncRun,
  IfoodCodeQuality,
  IfoodCodigoClasse,
  IfoodLote,
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

const RUNS_POLL_MS = 15000;

/** Rótulo legível para cada motivo de descarte devolvido pelo backend. */
const MOTIVOS: Record<string, string> = {
  "sem codigo": "Sem código de barras",
  "codigo invalido": "Código inválido",
  "sem nome": "Sem nome",
  "tipo desconhecido": "Tipo desconhecido",
  "sem preco": "Sem preço",
  "estoque invalido": "Estoque inválido",
  inativo: "Inativos — não estão à venda",
};

const LOTE_LABEL: Record<IfoodLote, string> = {
  novos: "Novos",
  alterados: "Alterados",
  removidos: "Removidos",
};

const RUN_STATUS: Record<IfoodSyncRun["status"], { label: string; ok: boolean }> = {
  running: { label: "Em andamento", ok: true },
  success: { label: "Sucesso", ok: true },
  empty: { label: "Nada mudou", ok: true },
  partial: { label: "Parcial", ok: false },
  error: { label: "Erro", ok: false },
};

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const CLASSES: {
  key: IfoodCodigoClasse;
  label: string;
  hint: string;
  tone: Tone;
}[] = [
  {
    key: "ean",
    label: "EAN válido",
    hint: "Vincula ao catálogo do iFood.",
    tone: "ok",
  },
  {
    key: "ean-sem-zero",
    label: "EAN sem o zero à esquerda",
    hint: "Completado com zeros no envio — vincula.",
    tone: "ok",
  },
  {
    key: "ean-invalido",
    label: "EAN com dígito errado",
    hint: "Erro de cadastro — corrigir na origem.",
    tone: "err",
  },
  {
    key: "balanca",
    label: "Código de balança (granel)",
    hint: "Sem EAN: cadastro manual no iFood.",
    tone: "default",
  },
  {
    key: "interno",
    label: "Código interno",
    hint: "Sem EAN: cadastro manual no iFood.",
    tone: "default",
  },
];

type Tone = "default" | "ok" | "warn" | "err";

const toneColor = (tone: Tone) =>
  tone === "ok"
    ? COLORS.ok
    : tone === "warn"
      ? COLORS.warn
      : tone === "err"
        ? COLORS.err
        : COLORS.text;

function Row({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
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
      <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
        <Text style={{ fontSize: 13.5, color: COLORS.muted }}>{label}</Text>
        {hint && (
          <Text style={{ fontSize: 11.5, color: COLORS.muted, opacity: 0.8, marginTop: 2 }}>
            {hint}
          </Text>
        )}
      </View>
      {/* Contagem tem largura reservada e nunca encolhe; texto longo
          (merchantId, erro) pode ocupar até metade da linha e quebrar. */}
      <View
        style={
          /^\d+$/.test(value)
            ? { width: 56, alignItems: "flex-end" }
            : { flexShrink: 1, maxWidth: "55%", alignItems: "flex-end" }
        }
      >
        <Text
          style={{
            fontSize: 13.5,
            fontWeight: "700",
            color: toneColor(tone),
            textAlign: "right",
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
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
      <Text
        style={{
          fontSize: 13,
          fontWeight: "800",
          color: COLORS.text,
          letterSpacing: 0.3,
          marginBottom: subtitle ? 4 : 8,
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 12, lineHeight: 17 }}>
          {subtitle}
        </Text>
      )}
      {children}
    </View>
  );
}

/** Selo de sucesso/erro — a informação principal de cada envio. */
function ResultBadge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: ok ? COLORS.okBg : COLORS.errBg,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <MaterialCommunityIcons
        name={ok ? "check-circle" : "alert-circle"}
        size={13}
        color={ok ? COLORS.ok : COLORS.err}
      />
      <Text
        style={{
          fontSize: 11.5,
          fontWeight: "800",
          color: ok ? COLORS.ok : COLORS.err,
          marginLeft: 4,
        }}
      >
        {label ?? (ok ? "Sucesso" : "Erro")}
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

/** Link "ver / ocultar" para detalhes técnicos. */
function DetailsToggle({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }}
    >
      <MaterialCommunityIcons
        name={open ? "chevron-up" : "chevron-down"}
        size={16}
        color={COLORS.brand}
      />
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: COLORS.brand, marginLeft: 4 }}>
        {open ? `Ocultar ${label}` : `Ver ${label}`}
      </Text>
    </TouchableOpacity>
  );
}

/** JSON em bloco de código escuro, com scroll horizontal pra linhas longas. */
function JsonBox({ label, value }: { label: string; value: unknown }) {
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
          color: CODE.muted,
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

/** Contagens da diferença + ignorados — comum à simulação e ao histórico. */
function ChangeCounts({
  novos,
  alterados,
  removidos,
  inalterados,
  ignorados,
  motivoIgnorados,
}: {
  novos: number;
  alterados: number;
  removidos: number;
  inalterados: number;
  ignorados: number;
  motivoIgnorados: Record<string, number>;
}) {
  return (
    <>
      <Row label="Novos" hint="Criados no iFood (POST)" value={String(novos)} tone={novos ? "ok" : "default"} />
      <Row
        label="Alterados"
        hint="Atualizados no iFood (PATCH)"
        value={String(alterados)}
        tone={alterados ? "ok" : "default"}
      />
      <Row
        label="Removidos"
        hint="Desativados no iFood"
        value={String(removidos)}
        tone={removidos ? "warn" : "default"}
      />
      <Row label="Sem alteração" value={String(inalterados)} />
      <Row
        label="Ignorados"
        hint="Não sobem ao iFood"
        value={String(ignorados)}
        tone={ignorados - (motivoIgnorados.inativo ?? 0) > 0 ? "warn" : "default"}
      />
      {Object.entries(motivoIgnorados).map(([motivo, qtd]) => (
        <Row
          key={motivo}
          label={`   ${MOTIVOS[motivo] ?? motivo}`}
          hint={motivo === "inativo" ? "   Esperado — nada a corrigir" : "   Produto ativo: corrigir o cadastro"}
          value={String(qtd)}
          tone={motivo === "inativo" ? "default" : "warn"}
        />
      ))}
    </>
  );
}

function FalhasList({ falhas }: { falhas: IfoodChangesResult["falhas"] }) {
  const [open, setOpen] = useState(false);
  if (!falhas.length) return null;
  return (
    <>
      <DetailsToggle open={open} onToggle={() => setOpen((v) => !v)} label="erros do iFood" />
      {open &&
        falhas.map((f) => (
          <JsonBox
            key={f.lote}
            label={`Lote ${f.lote} (${LOTE_LABEL[f.tipo]}) — HTTP ${f.status}`}
            value={f.body}
          />
        ))}
    </>
  );
}

function ChangesResultView({ result }: { result: IfoodChangesResult }) {
  const [payloadOpen, setPayloadOpen] = useState(false);
  const temAmostra = Object.keys(result.amostra).length > 0;

  return (
    <View style={{ marginTop: 14 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "800", color: COLORS.muted }}>
          {result.dryRun ? "SIMULAÇÃO — NADA FOI ENVIADO" : "ÚLTIMO ENVIO"}
        </Text>
        <ResultBadge
          ok={result.ok && !result.erro}
          label={
            result.erro
              ? "Erro"
              : !result.ok
                ? "Com falhas"
                : result.lotes === 0
                  ? "Nada mudou"
                  : result.dryRun
                    ? `${result.enviados} a enviar`
                    : "Sucesso"
          }
        />
      </View>

      {result.erro ? (
        <Text style={{ fontSize: 12.5, color: COLORS.err, paddingVertical: 10 }}>{result.erro}</Text>
      ) : (
        <>
          <ChangeCounts {...result} />
          {!result.dryRun && (
            <Row label="Enviados" value={`${result.enviados} em ${result.lotes} lote(s)`} />
          )}
          <FalhasList falhas={result.falhas} />
          {temAmostra && (
            <>
              <DetailsToggle
                open={payloadOpen}
                onToggle={() => setPayloadOpen((v) => !v)}
                label="exemplo do payload"
              />
              {payloadOpen &&
                (Object.keys(result.amostra) as IfoodLote[]).map((tipo) => (
                  <JsonBox
                    key={tipo}
                    label={`${LOTE_LABEL[tipo]} — até 3 itens`}
                    value={result.amostra[tipo]}
                  />
                ))}
            </>
          )}
        </>
      )}
    </View>
  );
}

function RunRow({ run }: { run: IfoodSyncRun }) {
  const [open, setOpen] = useState(false);
  const st = RUN_STATUS[run.status] ?? { label: run.status, ok: false };
  const duracao = run.finished_at
    ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null;

  const resumo =
    run.status === "error" && run.error
      ? run.error
      : run.status === "empty"
        ? "Nenhum produto mudou"
        : `${run.novos} novos · ${run.alterados} alterados · ${run.removidos} removidos`;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 10 }}>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.text }}>
            {fmtData(run.started_at)} · {run.trigger === "cron" ? "Automática" : "Manual"}
            {run.force ? " (forçada)" : ""}
          </Text>
          <Text style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 2 }} numberOfLines={2}>
            {resumo}
            {duracao !== null ? ` · ${duracao}s` : ""}
          </Text>
        </View>
        <ResultBadge ok={st.ok} label={st.label} />
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={COLORS.muted}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 6 }}>
          <ChangeCounts
            novos={run.novos}
            alterados={run.alterados}
            removidos={run.removidos}
            inalterados={run.inalterados}
            ignorados={run.ignorados}
            motivoIgnorados={run.motivo_ignorados ?? {}}
          />
          <Row label="Enviados" value={`${run.enviados} em ${run.lotes} lote(s)`} />
          {run.error && <Row label="Erro" value={run.error} tone="err" />}
          <FalhasList falhas={run.falhas ?? []} />
        </View>
      )}
    </View>
  );
}

export default function IfoodIntegrationScreen() {
  const router = useRouter();
  const { isStaff } = useCart();

  const [status, setStatus] = useState<IfoodStatus | null>(null);
  const [quality, setQuality] = useState<IfoodCodeQuality | null>(null);
  const [runs, setRuns] = useState<IfoodSyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [busy, setBusy] = useState<"none" | "dry" | "real">("none");
  const [result, setResult] = useState<IfoodChangesResult | null>(null);
  const [invalidosOpen, setInvalidosOpen] = useState(false);

  const runsPoll = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    const response = await IfoodService.status();
    if (response.success && response.data) setStatus(response.data);
  }, []);

  const fetchQuality = useCallback(async () => {
    const response = await IfoodService.codeQuality();
    if (response.success && response.data) setQuality(response.data);
  }, []);

  const fetchRuns = useCallback(async () => {
    const response = await IfoodService.syncRuns();
    if (response.success && response.data) setRuns(response.data);
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchQuality(), fetchRuns()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchStatus, fetchQuality, fetchRuns]);

  useEffect(() => {
    if (!isStaff) {
      setLoading(false);
      return;
    }
    loadAll();

    runsPoll.current = setInterval(fetchRuns, RUNS_POLL_MS);
    return () => {
      if (runsPoll.current) clearInterval(runsPoll.current);
    };
  }, [isStaff, loadAll, fetchRuns]);

  const simulate = async () => {
    setBusy("dry");
    const response = await IfoodService.syncChanges({ dryRun: true });
    setBusy("none");
    if (response.data) setResult(response.data);
    else Alert.alert("Falha na simulação", response.message);
    return response.data ?? null;
  };

  const send = async () => {
    setBusy("real");
    const response = await IfoodService.syncChanges();
    setBusy("none");
    if (response.data) setResult(response.data);
    else Alert.alert("Falha na sincronização", response.message);
    fetchRuns();
  };

  /** Sempre simula antes, pra confirmação mostrar exatamente o que vai subir. */
  const confirmSend = async () => {
    const plano = await simulate();
    if (!plano || plano.erro) return;
    if (plano.lotes === 0) {
      Alert.alert("Nada para enviar", "Nenhum produto mudou desde o último envio.");
      return;
    }
    Alert.alert(
      "Enviar alterações ao iFood?",
      `${plano.novos} novos, ${plano.alterados} alterados e ${plano.removidos} removidos — ${plano.enviados} itens em ${plano.lotes} lote(s).`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Enviar", style: "destructive", onPress: send },
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

  const ultimo = runs.find((r) => r.status !== "running") ?? runs[0];
  const conectado = !!status?.configurado && !!status?.autenticado;

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
                loadAll();
              }}
              tintColor={COLORS.brand}
            />
          }
        >
          <Card title="Status">
            <Row
              label="Conexão com o iFood"
              value={
                !status?.configurado
                  ? "Credenciais ausentes"
                  : status.autenticado
                    ? "Conectado"
                    : "Falha ao autenticar"
              }
              tone={conectado ? "ok" : "err"}
            />
            <Row label="Loja (merchantId)" value={status?.merchantId ?? "Não vinculada"} />
            <Row
              label="Sincronização automática"
              value={status?.syncAutomatico ? "A cada 30 min" : "Desligada"}
              tone={status?.syncAutomatico ? "ok" : "default"}
            />
            <Row
              label="Última sincronização"
              value={
                ultimo
                  ? `${fmtData(ultimo.started_at)} · ${RUN_STATUS[ultimo.status]?.label ?? ultimo.status}`
                  : "Nenhuma ainda"
              }
              tone={ultimo ? (RUN_STATUS[ultimo.status]?.ok ? "ok" : "err") : "default"}
            />
          </Card>

          <Card
            title="Sincronizar catálogo"
            subtitle="Envia só o que mudou desde o último envio aceito pelo iFood: produtos novos, alterados e removidos. Na primeira vez, tudo é novo."
          >
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <SecondaryButton
                  label="Simular"
                  onPress={simulate}
                  busy={busy === "dry"}
                  disabled={busy === "real"}
                />
              </View>
              <View style={{ flex: 1.3 }}>
                <PrimaryButton
                  label="Enviar alterações"
                  onPress={confirmSend}
                  busy={busy === "real"}
                  disabled={busy === "dry" || !conectado}
                />
              </View>
            </View>

            {result && (
              <ChangesResultView
                key={`${result.dryRun}-${result.runId ?? ""}-${result.enviados}`}
                result={result}
              />
            )}
          </Card>

          {quality && (
            <Card
              title="Qualidade dos códigos"
              subtitle={`Produtos ativos com código: ${quality.total}. Só EAN válido vincula ao catálogo do iFood.`}
            >
              {CLASSES.map((c) => (
                <Row
                  key={c.key}
                  label={c.label}
                  hint={c.hint}
                  value={String(quality.grupos[c.key])}
                  tone={quality.grupos[c.key] > 0 ? c.tone : "default"}
                />
              ))}

              {quality.invalidos.length > 0 && (
                <>
                  <DetailsToggle
                    open={invalidosOpen}
                    onToggle={() => setInvalidosOpen((v) => !v)}
                    label="produtos a corrigir"
                  />
                  {invalidosOpen &&
                    quality.invalidos.map((p) => (
                      <Row
                        key={p.id}
                        label={p.name}
                        value={p.codigo}
                        tone="err"
                      />
                    ))}
                </>
              )}
            </Card>
          )}

          <Card
            title="Histórico de sincronizações"
            subtitle="Últimas 20 rodadas, automáticas e manuais. Toque para ver o detalhe."
          >
            {runs.length === 0 ? (
              <Text style={{ fontSize: 12.5, color: COLORS.muted, paddingVertical: 10 }}>
                Nenhuma sincronização registrada ainda.
              </Text>
            ) : (
              runs.map((run) => <RunRow key={run.id} run={run} />)
            )}
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
