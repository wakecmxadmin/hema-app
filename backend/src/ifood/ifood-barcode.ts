/**
 * Classificação do `products.codigo` para o iFood.
 *
 * Só EAN/GTIN válido vincula ao catálogo global do iFood. A coluna é
 * `bigint`, então EANs que começam com zero chegam sem ele (um UPC
 * `070847…` vira `70847…`, com 11 dígitos) — esses são recuperáveis
 * completando com zeros à esquerda.
 */
export type CodigoClasse =
  /** GTIN-8/12/13/14 com dígito verificador válido. */
  | 'ean'
  /** 9 a 11 dígitos que viram GTIN válido com zeros à esquerda. */
  | 'ean-sem-zero'
  /** Tamanho de EAN, mas o dígito verificador não confere — erro de cadastro. */
  | 'ean-invalido'
  /** Código curto de produto a granel (balança). */
  | 'balanca'
  /** Código curto de produto unitário — código interno da loja. */
  | 'interno';

/** Dígito verificador GS1 (mod 10) — vale para GTIN-8/12/13/14. */
export function gtinCheckOk(digits: string): boolean {
  if (!/^\d{8,14}$/.test(digits)) return false;
  const padded = digits.padStart(14, '0');
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number(padded[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(padded[13]);
}

export function classifyCodigo(
  codigo: number | string,
  type: string,
): CodigoClasse {
  const digits = String(codigo);
  const len = digits.length;

  if ([8, 12, 13, 14].includes(len)) {
    return gtinCheckOk(digits) ? 'ean' : 'ean-invalido';
  }
  if (len >= 9 && len <= 11) {
    return gtinCheckOk(digits.padStart(13, '0'))
      ? 'ean-sem-zero'
      : 'ean-invalido';
  }
  return type === 'weight' ? 'balanca' : 'interno';
}

/**
 * Código que vai no `barcode` do iFood. O sistema de origem exporta o
 * código como número, então EAN/UPC que começa com zero chega sem ele —
 * aqui ele volta, em 13 dígitos (para o GTIN, `0` + UPC-A é o mesmo código).
 *
 * `isEan: false` marca código de balança/interno, que também vai em `plu`.
 * EAN com dígito errado segue como veio: é erro de cadastro, não de formato.
 */
export function barcodeForIfood(
  codigo: number | string,
  type: string,
): { barcode: string; isEan: boolean } {
  const digits = String(codigo);

  switch (classifyCodigo(digits, type)) {
    case 'ean-sem-zero':
      return { barcode: digits.padStart(13, '0'), isEan: true };
    case 'ean':
      return {
        barcode: digits.length === 12 ? digits.padStart(13, '0') : digits,
        isEan: true,
      };
    case 'ean-invalido':
      return { barcode: digits, isEan: [8, 12, 13, 14].includes(digits.length) };
    default:
      return { barcode: digits, isEan: false };
  }
}
