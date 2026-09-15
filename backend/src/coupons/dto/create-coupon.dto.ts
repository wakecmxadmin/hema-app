import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  Matches,
  IsISO8601,
} from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty({ message: 'O código é obrigatório' })
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'Use apenas letras, números e hífen no código',
  })
  code: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  description?: string;

  @IsNumber()
  @Min(0.01, { message: 'O desconto deve ser maior que 0%' })
  @Max(100, { message: 'O desconto não pode passar de 100%' })
  discount_percent: number;

  // NULL/ausente = ilimitado; 1 = uso único
  @IsOptional()
  @IsInt()
  @Min(1)
  max_uses?: number;

  @IsOptional()
  @IsBoolean()
  is_single_use?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_total?: number;

  @IsOptional()
  @IsISO8601()
  expires_at?: string;
}
