import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class RefundOrderDto {
  /** Valor em reais. Omitido = estorno integral do pagamento. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;
}
