import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsOptional()
  address_id?: string;

  @IsString()
  @IsNotEmpty({ message: 'O método de pagamento é obrigatório' })
  @IsIn(['credit_card', 'pix', 'cash'], {
    message: 'Método de pagamento inválido. Escolha: credit_card, pix ou cash',
  })
  payment_method: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'Código de cupom inválido' })
  coupon_code?: string;
}
