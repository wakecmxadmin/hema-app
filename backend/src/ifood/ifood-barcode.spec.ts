import { barcodeForIfood, classifyCodigo, gtinCheckOk } from './ifood-barcode';

describe('ifood-barcode', () => {
  it('valida o dígito verificador GS1', () => {
    expect(gtinCheckOk('7891000100103')).toBe(true);
    expect(gtinCheckOk('7891000100104')).toBe(false);
    expect(gtinCheckOk('78900776')).toBe(gtinCheckOk('0000078900776'));
  });

  it('EAN-13 válido é ean; com dígito errado é ean-invalido', () => {
    expect(classifyCodigo(7891000100103, 'unit')).toBe('ean');
    expect(classifyCodigo(7891000100104, 'unit')).toBe('ean-invalido');
  });

  it('EAN que perdeu o zero à esquerda é recuperável', () => {
    // UPC 070847811169 (Monster) guardado como bigint -> 11 dígitos
    expect(classifyCodigo(70847811169, 'unit')).toBe('ean-sem-zero');
  });

  it('código curto é balança (granel) ou interno (unitário)', () => {
    expect(classifyCodigo(457, 'weight')).toBe('balanca');
    expect(classifyCodigo(39666, 'unit')).toBe('interno');
  });

  describe('barcodeForIfood', () => {
    it.each([
      [7891000100103, 'unit', '7891000100103', true], // EAN-13 intacto
      [78900776, 'unit', '78900776', true], // EAN-8 intacto
      [70847811169, 'unit', '0070847811169', true], // perdeu zeros
      [7891000100104, 'unit', '7891000100104', true], // dígito errado: como veio
      [457, 'weight', '457', false], // balança
    ])('%s (%s) -> %s', (codigo, type, barcode, isEan) => {
      expect(barcodeForIfood(codigo, type)).toEqual({ barcode, isEan });
    });
  });
});
