import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentsService } from './payment.service';

@Controller('webhook')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('mercadopago')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: any) {
    // Responde imediatamente e processa em background
    this.paymentsService.handleMercadoPagoWebhook(payload).catch((err) => {
      console.error('[WEBHOOK] Erro ao processar webhook:', err);
    });

    return { received: true };
  }
}
