import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemEditDto {
  @IsUUID()
  order_item_id!: string;

  // Para itens type=unit. 0 = remover o item por completo.
  @IsOptional()
  @IsNumber()
  @Min(0)
  new_quantity?: number;

  // Para itens type=weight (em gramas, mesmo unit que `order_items.weight`).
  // 0 = remover.
  @IsOptional()
  @IsNumber()
  @Min(0)
  new_weight?: number;
}

export class ConfirmOrderDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemEditDto)
  edits?: OrderItemEditDto[];
}

export class RejectOrderDto {
  @IsString()
  reason!: string;
}
