import { IsIn, IsOptional, IsString } from 'class-validator';

export const ORDER_STATUSES = [
  'pending',
  'awaiting_store_confirmation',
  'awaiting_customer_payment',
  'waiting_payment',
  'confirmed',
  'preparing',
  'shipped',
  'in_delivery',
  'delivered',
  'completed',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export class UpdateOrderStatusDto {
  @IsString()
  @IsIn(ORDER_STATUSES as unknown as string[])
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
