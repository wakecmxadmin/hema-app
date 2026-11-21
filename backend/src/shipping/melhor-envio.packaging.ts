/**
 * Caixa padrão por faixa de peso para cotar e comprar etiquetas no Melhor
 * Envio. A tabela `products` não tem peso nem medidas, então o pedido inteiro
 * vai numa caixa só, escolhida pelo peso total estimado.
 *
 * Para ajustar às caixas que a loja realmente usa, é esta tabela que muda.
 * Medidas em cm, peso máximo em kg (já contando a embalagem).
 *
 * Uma caixa por pedido também evita o problema de Correios/J&T/Loggi não
 * aceitarem múltiplos volumes na mesma etiqueta.
 */
export const BOX_TIERS: Array<{
  maxKg: number;
  width: number;
  height: number;
  length: number;
}> = [
  { maxKg: 1, width: 20, height: 10, length: 15 },
  { maxKg: 3, width: 25, height: 15, length: 20 },
  { maxKg: 6, width: 30, height: 20, length: 25 },
  { maxKg: 10, width: 40, height: 25, length: 30 },
  { maxKg: 20, width: 50, height: 30, length: 40 },
  { maxKg: 30, width: 60, height: 40, length: 40 },
];

/** Peso da caixa + proteção somado ao peso dos produtos (kg). */
const PACKAGING_TARE_KG = 0.2;

/** Peso de um item vendido por unidade cujo nome não diz o peso (gramas). */
function fallbackUnitWeightG(): number {
  return Number(process.env.MELHOR_ENVIO_UNIT_WEIGHT_G ?? 500);
}

/**
 * Extrai o peso do nome do produto quando ele vem escrito
 * ("Arroz Integral 1kg", "Chia 500g", "Aveia 1,5 kg").
 * Devolve gramas ou null.
 */
export function weightFromName(name?: string | null): number | null {
  if (!name) return null;
  const match = name.match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2].toLowerCase() === 'kg' ? value * 1000 : value;
}

export interface PackItem {
  name?: string | null;
  /** Unidades (produto vendido por unidade). */
  quantity?: number | null;
  /** Gramas (produto vendido por peso). */
  weight?: number | null;
}

export interface Volume {
  width: number;
  height: number;
  length: number;
  weight: number; // kg
}

/** Peso total estimado dos itens, em kg, sem a embalagem. */
export function estimateItemsWeightKg(items: PackItem[]): number {
  let grams = 0;
  for (const it of items) {
    if (it.weight && it.weight > 0) {
      grams += Number(it.weight);
      continue;
    }
    const unitG = weightFromName(it.name) ?? fallbackUnitWeightG();
    grams += unitG * Math.max(Number(it.quantity) || 1, 1);
  }
  return grams / 1000;
}

/**
 * Caixa única para o pedido, ou null se passar do maior tier (30 kg —
 * limite dos Correios). Nesse caso o pedido não pode ir pelo Melhor Envio.
 */
export function pickVolume(items: PackItem[]): Volume | null {
  const totalKg =
    Math.round((estimateItemsWeightKg(items) + PACKAGING_TARE_KG) * 1000) /
    1000;
  const box = BOX_TIERS.find((b) => totalKg <= b.maxKg);
  if (!box) return null;
  return {
    width: box.width,
    height: box.height,
    length: box.length,
    weight: totalKg,
  };
}
