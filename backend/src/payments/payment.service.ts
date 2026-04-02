import { Injectable, BadRequestException } from '@nestjs/common';

export interface ProcessPaymentInput {
  payment_method: string;
  total_price: number;
  delivery_fee: number;
  order_id: string;
}

export interface ProcessPaymentResult {
  orderStatus: string;
  paymentStatus: string;
}

@Injectable()
export class PaymentsService {
  async processPayment(
    input: ProcessPaymentInput,
  ): Promise<ProcessPaymentResult> {
    const { payment_method, total_price, order_id } = input;

    switch (payment_method) {
      case 'cash':
        console.log(`[PAYMENT] Order ${order_id} → Dinheiro → fluxo offline`);
        return {
          orderStatus: 'pending',
          paymentStatus: 'waiting_cash',
        };

      case 'pix':
        console.log(
          `[PAYMENT] Order ${order_id} → PIX no valor de R$ ${total_price} → gerar QR Code no MP`,
        );
        return {
          orderStatus: 'waiting_payment',
          paymentStatus: 'pending', 
        };

      case 'credit_card':
        console.log(
          `[PAYMENT] Order ${order_id} → Cartão → processar Token via MP`,
        );
        return {
          orderStatus: 'waiting_payment',
          paymentStatus: 'pending',
        };

      default:
        throw new BadRequestException(
          `Método de pagamento inválido: ${payment_method}`,
        );
    }
  }
}
