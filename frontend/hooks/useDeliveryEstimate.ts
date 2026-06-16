import { useEffect, useState } from "react";

import {
  estimateDeliveryDate,
  fetchHolidays,
  formatDeliveryDay,
} from "@/util/delivery-estimate";

interface DeliveryEstimate {
  /** "hoje" | "amanhã" | "segunda-feira" | ... */
  dayLabel: string;
  /** Date object da entrega estimada — útil pra renderizar data formatada se quiser */
  date: Date;
}

/**
 * Cálculo da estimativa de entrega respeitando a regra de 12h, fins de semana
 * e feriados (BrasilAPI). Recalcula a cada 15min pra cobrir a fronteira do
 * meio-dia se o usuário ficar com a tela aberta.
 *
 * Devolve null enquanto carrega — o consumidor decide se mostra fallback ou nada.
 */
export function useDeliveryEstimate(): DeliveryEstimate | null {
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);

  useEffect(() => {
    let cancelled = false;

    const compute = async () => {
      const now = new Date();
      const year = now.getFullYear();
      // Buscamos ano atual + próximo (cobre virada de ano em pedidos em dezembro).
      const [a, b] = await Promise.all([
        fetchHolidays(year),
        fetchHolidays(year + 1),
      ]);
      if (cancelled) return;

      const holidays = new Set<string>([...a, ...b]);
      const date = estimateDeliveryDate(now, holidays);
      const dayLabel = formatDeliveryDay(date, now);
      setEstimate({ date, dayLabel });
    };

    void compute();
    const interval = setInterval(() => void compute(), 15 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return estimate;
}
