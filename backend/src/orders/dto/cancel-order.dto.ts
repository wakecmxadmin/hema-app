import { IsBoolean, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class CancelOrderDto {
  /**
   * Cancela sem devolver o dinheiro. O padrão de um pedido pago é estornar —
   * cancelar e reter o valor precisa ser uma escolha explícita do admin
   * (ex.: estorno já feito por fora, ou acordo de crédito com o cliente).
   */
  @IsOptional()
  @IsBoolean()
  skip_refund?: boolean;

  /**
   * Estorno parcial, em reais. Omitido = devolve o valor integral do
   * pagamento. Usado quando o pedido já saiu pra entrega e a loja retém a
   * taxa, por exemplo.
   */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  refund_amount?: number;
}
