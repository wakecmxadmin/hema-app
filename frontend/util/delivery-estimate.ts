/**
 * Regras de entrega:
 * - Pedido antes das 12h em dia útil → entrega no mesmo dia até 21h
 * - Pedido após 12h em dia útil → próximo dia útil até 21h
 * - Pedido em fim de semana ou feriado → próximo dia útil até 21h
 * - Sábado e domingo NÃO são dias úteis (Hema entrega seg–sex)
 *
 * Feriados vêm da BrasilAPI (`/feriados/v1/{ano}`). Lista é cacheada por ano
 * em memória. Se a API falhar, caímos no fallback "só fim de semana" — o que
 * pode mentir num feriado, mas é melhor que travar a UI.
 */

const HOLIDAYS_API = "https://brasilapi.com.br/api/feriados/v1";

const holidayCache: Partial<Record<number, Set<string>>> = {};
const inFlight: Partial<Record<number, Promise<Set<string>>>> = {};

interface BrasilApiHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  type: string;
}

export async function fetchHolidays(year: number): Promise<Set<string>> {
  if (holidayCache[year]) return holidayCache[year];
  if (inFlight[year]) return inFlight[year];

  inFlight[year] = (async () => {
    try {
      const res = await fetch(`${HOLIDAYS_API}/${year}`);
      if (!res.ok) {
        holidayCache[year] = new Set();
        return holidayCache[year];
      }
      const json: BrasilApiHoliday[] = await res.json();
      const dates = new Set(json.map((h) => h.date));
      holidayCache[year] = dates;
      return dates;
    } catch {
      holidayCache[year] = new Set();
      return holidayCache[year];
    } finally {
      delete inFlight[year];
    }
  })();

  return inFlight[year];
}

export function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isBusinessDay(date: Date, holidays: Set<string>): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return !holidays.has(formatYMD(date));
}

export function nextBusinessDay(from: Date, holidays: Set<string>): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  // Limite de segurança para evitar loop infinito em caso de bug.
  for (let i = 0; i < 30; i++) {
    if (isBusinessDay(next, holidays)) return next;
    next.setDate(next.getDate() + 1);
  }
  return next;
}

const CUTOFF_HOUR = 12;

export function estimateDeliveryDate(now: Date, holidays: Set<string>): Date {
  if (isBusinessDay(now, holidays) && now.getHours() < CUTOFF_HOUR) {
    return now;
  }
  return nextBusinessDay(now, holidays);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Retorna a parte do dia para compor "Seu pedido chegará {X} até as 21h".
 * Ex: "hoje", "amanhã", "segunda-feira".
 */
export function formatDeliveryDay(delivery: Date, now: Date): string {
  if (isSameDay(delivery, now)) return "hoje";

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(delivery, tomorrow)) return "amanhã";

  const weekday = delivery.toLocaleDateString("pt-BR", { weekday: "long" });
  return weekday;
}
