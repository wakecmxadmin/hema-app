import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o código do cupom' })
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'Código de cupom inválido',
  })
  code: string;
}
