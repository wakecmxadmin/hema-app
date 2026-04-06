import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { PaymentsService } from './payment.service';

@Controller('webhook')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('mercadopago')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() payload: any) {
    this.paymentsService.handleMercadoPagoWebhook(payload).catch((err) => {
      console.error('[WEBHOOK] Erro no processamento assíncrono:', err);
    });

    return { received: true };
  }
}
