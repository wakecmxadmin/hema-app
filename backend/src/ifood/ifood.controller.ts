import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { StaffGuard } from '../auth/staff.guard';
import { IfoodApiService } from './ifood-api.service';
import { IfoodAuthService } from './ifood-auth.service';
import { IfoodCatalogService } from './ifood-catalog.service';
import { IfoodEventsService } from './ifood-events.service';

/**
 * Painel de integração do iFood, consumido pela tela `/admin/ifood` do app.
 * Restrito à equipe: dispara carga de catálogo e expõe credenciais de estado.
 */
@Controller('ifood')
@UseGuards(StaffGuard)
export class IfoodController {
  constructor(
    private readonly auth: IfoodAuthService,
    private readonly api: IfoodApiService,
    private readonly catalog: IfoodCatalogService,
    private readonly events: IfoodEventsService,
  ) {}

  /** Diagnóstico: confirma se as credenciais autenticam. */
  @Get('status')
  async status() {
    const token = await this.auth.getAccessToken();
    return {
      success: true,
      message: 'ok',
      data: {
        configurado: this.auth.isConfigured(),
        modo: this.auth.mode,
        autenticado: !!token,
        merchantId: this.api.merchantId ?? null,
        syncAutomatico: process.env.IFOOD_SYNC_ENABLED === 'true',
      },
    };
  }

  /**
   * Fluxo distribuído, passo 1: gera o código que o lojista informa no
   * Portal do Parceiro, em Integrações.
   */
  @Post('auth/user-code')
  async userCode() {
    const data = await this.auth.requestUserCode();
    return data
      ? { success: true, message: 'userCode gerado', data }
      : { success: false, message: 'Não foi possível gerar o userCode.' };
  }

  /**
   * Fluxo distribuído, passo 2: informe o authorizationCode devolvido após
   * o lojista autorizar. Guarda o refresh token.
   */
  @Post('auth/complete')
  async completeAuth(@Body('authorizationCode') authorizationCode: string) {
    if (!authorizationCode) {
      return { success: false, message: 'authorizationCode é obrigatório.' };
    }
    const ok = await this.auth.completeAuthorization(authorizationCode);
    return {
      success: ok,
      message: ok
        ? 'Aplicativo autorizado pela loja.'
        : 'Falha ao concluir a autorização.',
    };
  }

  /** Lista as lojas do aplicativo — é daqui que sai o IFOOD_MERCHANT_ID. */
  @Get('merchants')
  async merchants() {
    const data = await this.api.listMerchants();
    return { success: true, message: 'ok', data };
  }

  /**
   * Situação operacional da loja — a loja de teste começou com `is-connected`
   * em ERROR, o que impede o catálogo de ser publicado mesmo com ingestão
   * aceita (202).
   */
  @Get('merchant-status')
  async merchantStatus() {
    const data = await this.api.getMerchantStatus();
    return {
      success: data.ok,
      message: data.ok ? 'ok' : 'falha',
      data: data.body,
    };
  }

  /**
   * Dispara uma rodada manual do polling de eventos, sem esperar o
   * agendamento automático (a cada 30s) — útil pra testar o heartbeat que
   * tira a loja do `is-connected: ERROR`.
   */
  @Post('events/poll')
  async pollEvents() {
    const data = await this.events.pollOnce();
    return {
      success: true,
      message: `${data.eventos} evento(s) recebido(s) e confirmado(s).`,
      data,
    };
  }

  /**
   * Dispara a sincronização do catálogo.
   * `?dryRun=true` monta o payload sem enviar nada ao iFood.
   * `?fields=price-stock` manda só barcode+preço+estoque (PATCH parcial) —
   * cenário "Atualização parcial" da homologação.
   */
  @Post('sync')
  async sync(
    @Query('dryRun') dryRun?: string,
    @Query('mode') mode?: 'patch' | 'post',
    @Query('reset') reset?: string,
    @Query('fields') fields?: 'full' | 'price-stock',
  ) {
    const data = await this.catalog.sync({
      dryRun: dryRun === 'true',
      mode: mode === 'post' ? 'post' : 'patch',
      reset: reset === 'true',
      fields: fields === 'price-stock' ? 'price-stock' : 'full',
    });

    return {
      success: data.ok,
      message: data.ok
        ? `${data.enviados} de ${data.total} produtos enviados.`
        : 'A sincronização terminou com falhas.',
      data,
    };
  }

  /**
   * Confere o que o iFood gravou depois de um `sync` — o Item API não expõe
   * status próprio. Traz uma amostra de itens (nome, imagem, preço) e a
   * lista de itens rejeitados com o motivo.
   */
  @Get('catalog/verify')
  async verifyCatalog() {
    const data = await this.catalog.verify();
    return {
      success: data.ok,
      message: data.ok
        ? `${data.sellableCount} itens vendáveis, ${data.unsellableCount} rejeitados.`
        : 'Não foi possível consultar o catálogo no iFood.',
      data,
    };
  }
}
