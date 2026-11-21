import { IsNotEmpty, IsString } from 'class-validator';

export class ShippingQuoteDto {
  @IsString()
  @IsNotEmpty()
  address_id: string;
}
