import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { MelhorEnvioService } from './melhor-envio.service';
import { MelhorEnvioShipmentService } from './melhor-envio-shipment.service';

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

@Controller()
export class MelhorEnvioController {
  private readonly logger = new Logger(MelhorEnvioController.name);

  constructor(
    private readonly me: MelhorEnvioService,
    private readonly shipments: MelhorEnvioShipmentService,
  ) {}

  /**
   * Autorização única da conta da loja. O admin abre no navegador:
   * `GET /melhor-envio/oauth/start?key=<MELHOR_ENVIO_SETUP_KEY>`
   * e é levado para o Melhor Envio, que volta no callback abaixo.
   */
  @Get('melhor-envio/oauth/start')
  async start(@Query('key') key: string, @Res() res: Response) {
    const expected = process.env.MELHOR_ENVIO_SETUP_KEY;
    if (!expected || !key || !sameSecret(key, expected)) {
      throw new ForbiddenException();
    }
    res.redirect(await this.me.buildAuthorizeUrl());
  }

  /** Deve ser idêntica à URL de callback cadastrada no app do Melhor Envio. */
  @Get('melhor-envio/oauth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      res.status(400).send('Parâmetros ausentes.');
      return;
    }
    const result = await this.me.handleOAuthCallback(code, state);
    res
      .status(result.ok ? 200 : 400)
      .type('text/plain; charset=utf-8')
      .send(result.message);
  }

  /**
   * Webhook cadastrado no app do Melhor Envio. Responde rápido (timeout
   * deles é 6s) e o processamento é idempotente — eventos podem chegar
   * repetidos ou fora de ordem.
   */
  @Post('webhooks/melhor-envio')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-me-signature') signature: string,
    @Body() payload: any,
  ) {
    if (!this.me.isValidSignature(req.rawBody, signature)) {
      this.logger.warn('Webhook Melhor Envio com assinatura inválida.');
      throw new UnauthorizedException();
    }
    await this.shipments.handleWebhook(payload);
    return { received: true };
  }
}
