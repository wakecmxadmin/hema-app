import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';

/**
 * Webhook público (sem JWT). Validação é feita por token na URL:
 * `POST /webhooks/logmanager/:token`. O token deve ser o mesmo configurado em
 * `LOGMANAGER_WEBHOOK_TOKEN` no .env e cadastrado no painel da LogManager.
 *
 * A LogManager não envia assinatura criptográfica nos webhooks (ver doc),
 * então o token de URL + HTTPS é a defesa razoável que temos.
 */
@Controller('webhooks/logmanager')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post(':token')
  async handle(@Param('token') token: string, @Body() payload: any) {
    const expected = process.env.LOGMANAGER_WEBHOOK_TOKEN;
    if (!expected || token !== expected) {
      throw new ForbiddenException();
    }

    await this.shippingService.handleStatusWebhook(payload);
    return { received: true };
  }
}
