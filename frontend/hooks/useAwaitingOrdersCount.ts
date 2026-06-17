import { useEffect, useState } from "react";

import { supabase } from "@/services/supabase";

const AWAITING_STATUS = "awaiting_store_confirmation";

/**
 * Conta de pedidos aguardando confirmação da loja, com refresh por Realtime.
 * Retorna 0 quando o usuário não é staff (consulta nem é feita).
 *
 * Assina os 3 eventos relevantes (INSERT, UPDATE, DELETE) e re-fetcha o count
 * em qualquer mudança — mais simples do que tentar manter contador local em
 * sync com diferença entre `old` e `new` de cada evento.
 */
export function useAwaitingOrdersCount(isStaff: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isStaff) {
      setCount(0);
      return;
    }

    let cancelled = false;

    const refetch = async () => {
      const { count: c, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", AWAITING_STATUS);
      if (cancelled) return;
      if (error) {
        console.warn("[ADMIN_BADGE] falha ao buscar count:", error.message);
        return;
      }
      setCount(c ?? 0);
    };

    void refetch();

    const channel = supabase
      .channel("admin-awaiting-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          void refetch();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isStaff]);

  return count;
}
