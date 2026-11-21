# Melhor Envio — referência de integração

> Anotações levantadas da documentação oficial em 13/11/2026. Integração implementada em 21/11/2026 — ver seção 0.

---

## 0. Como está implementado no Hema

**Quando entra:** endereço cuja cidade não está em `calculateDeliveryFee` (`utils/delivery.util.ts`, área do motoboy/LogManager). Nesse caso o checkout cota no Melhor Envio e o cliente escolhe o serviço. Dentro da área nada muda.

**Arquivos**
- `melhor-envio.service.ts` — cliente HTTP, OAuth (tokens em `melhor_envio_auth`, renovação diária + retry em 401), HMAC do webhook.
- `melhor-envio.packaging.ts` — caixa padrão por faixa de peso (tabela `BOX_TIERS`). Peso: gramas dos itens por peso; itens por unidade usam o peso do nome ("1kg", "500g") ou `MELHOR_ENVIO_UNIT_WEIGHT_G`. Uma caixa por pedido, máx. 30 kg.
- `melhor-envio-shipment.service.ts` — cotação, compra da etiqueta (carrinho → checkout → generate, retomável), impressão, cancelamento, status (webhook + cron horário).
- `melhor-envio.controller.ts` — `GET /melhor-envio/oauth/start?key=…`, `GET /melhor-envio/oauth/callback`, `POST /webhooks/melhor-envio`.
- `shipping.service.ts` — `createForOrder` despacha para Melhor Envio quando `orders.shipping_provider = 'melhor_envio'`.

**Fluxo**
1. Checkout: `POST /orders/shipping-quote { address_id }` → `{ mode: local | melhor_envio | unavailable, fee, options }`.
2. `POST /orders/checkout` com `shipping_service_id`: o backend **recota** e usa o preço do servidor; grava `shipping_provider`, `me_service_id`, `me_quote`.
3. Pedido confirmado/pago (mesmos gatilhos da LogManager) → compra e gera a etiqueta com o saldo da carteira; tenta pegar o link de impressão.
4. Admin: botão "Imprimir etiqueta" (`POST /admin/orders/:id/shipping-label`) e "Reenviar" (aceita `nfe_key`).
5. Webhook/cron atualizam `shipping_status`, rastreio e `status` (posted → shipped, delivered → delivered).
6. Cancelamento do pedido (cliente ou admin) cancela a etiqueta (valor volta à carteira).

**NF-e:** com `MELHOR_ENVIO_NON_COMMERCIAL=false` a etiqueta só é criada com `orders.nfe_key`; sem ela o pedido fica com erro e o admin informa a chave no "Reenviar". Com `true` vai como declaração de conteúdo (só vale para não contribuinte de ICMS — confirmar com a contabilidade).

**Checklist de go-live**
1. Aplicar `supabase/migrations/20261121_melhor_envio.sql`.
2. Sandbox: conta + app em app-sandbox.melhorenvio.com.br; preencher `.env`; autorizar via `/melhor-envio/oauth/start`; cadastrar webhook `https://<backend>/webhooks/melhor-envio`; testar pedido fora da RMC de ponta a ponta.
3. Produção: conta + app em app.melhorenvio.com.br, saldo na carteira, `.env` de prod com `MELHOR_ENVIO_BASE_URL=https://melhorenvio.com.br`, autorizar de novo, cadastrar webhook.
>
> - Docs: https://docs.melhorenvio.com.br/docs/introducao-a-api
> - Índice completo (bom para consultar páginas em `.md`): https://docs.melhorenvio.com.br/llms.txt
> - Qualquer página da doc pode ser lida em markdown acrescentando `.md` na URL (ex.: `.../reference/geracao-de-etiquetas.md`) — inclui a spec OpenAPI do endpoint.
> - Suporte técnico: integracoes@melhorenvio.com (não analisam código).

---

## 1. Visão geral

O Melhor Envio **não é transportadora**: é um intermediador. A gente cota, "compra" a etiqueta com saldo da carteira do Melhor Envio, gera, imprime e posta na transportadora (Correios, Jadlog, Loggi, J&T, Azul Cargo, Latam, Buslog…).

Integração é gratuita. O que pagamos é o frete de cada etiqueta, debitado do saldo da carteira da conta.

Fluxo completo:

```
Cotação ──► Inserir no carrinho ──► Checkout (paga com saldo) ──► Gerar etiqueta ──► Imprimir ──► Postar
   │              │ (retorna order id UUID)                          (assíncrono)                    │
   │              └─ guardar o id no nosso pedido                                                    ▼
   └─ guardar a cotação escolhida (service id, preço, packages)            Status via webhook ou POST /shipment/tracking
```

---

## 2. Ambientes

| Ambiente | Base URL | Painel / criar app |
|---|---|---|
| Sandbox | `https://sandbox.melhorenvio.com.br` | https://app-sandbox.melhorenvio.com.br/integracoes/area-dev |
| Produção | `https://melhorenvio.com.br` | https://app.melhorenvio.com.br/integracoes/area-dev |

**Sandbox:**
- Conta, app, tokens e dados **totalmente separados** da produção (precisa criar conta e app nos dois).
- Saldo fictício de R$ 10.000.
- Só Correios e Jadlog. Pagamentos aprovados automaticamente em ~5 min.
- Status muda sozinho a cada 15 min (gerada → postada → entregue), com créditos/débitos aleatórios simulando repesagem.
- Impressão em arquivo (pdf/zpl/jpeg) só funciona para serviços Jadlog.
- Logística reversa: dá para inserir no carrinho e pagar, mas não gera etiqueta/código.

IDs de serviço no sandbox (não fazer lógica pelo **nome**, que pode mudar):

| Transportadora (company id) | Serviços (service id) |
|---|---|
| Correios (1) | 1 PAC · 2 SEDEX · 17 Mini Envios |
| Jadlog (2) | 3 .Package · 4 .Com |

Em produção há mais transportadoras — listar com `GET /api/v2/me/shipment/companies`.

---

## 3. Headers obrigatórios

```http
Accept: application/json
Content-Type: application/json          # exceto rotas OAuth (/oauth/authorize)
Authorization: Bearer {access_token}
User-Agent: Hema App (email-de-suporte@dominio)   # OBRIGATÓRIO: nome da aplicação + e-mail de contato técnico
```

- Tudo HTTPS, payloads em JSON no body (exceto GET).
- **Rate limit:** 250 req/min por usuário autenticado (por IP quando sem auth).

---

## 4. Autenticação (OAuth 2.0)

### 4.1 Opções

1. **App OAuth (fluxo oficial)** — cria-se um aplicativo em *Integrações › Área Dev.* e obtém `client_id` + `client_secret`. Uma conta do Melhor Envio autoriza o app e recebemos tokens.
2. **Token gerado direto no painel** — a doc menciona "integrações que utilizam o token gerado diretamente no painel" (ex.: regra do campo `agency`). Para loja própria com uma única conta pode ser mais simples, **mas confirmar** validade/renovação desse token antes de decidir. Webhooks só funcionam para etiquetas criadas pelo **mesmo app** onde o webhook está cadastrado — isso pesa a favor do app OAuth.

> Como o Hema é uma loja só (uma conta Melhor Envio), a autorização OAuth acontece **uma vez** (por um admin); depois o backend só renova tokens. Não é fluxo de usuário final.

### 4.2 Criar o app

Campos: nome, site, e-mails de contato, URL de testes, **URL de callback** (tem que ser idêntica ao `redirect_uri` usado, senão retorna `Client invalid`), descrição.
O `client_secret` só no backend (também é a chave do HMAC do webhook).

### 4.3 Autorização (redirect pelo navegador)

```
GET {base}/oauth/authorize
    ?client_id={client_id}
    &redirect_uri={callback}
    &response_type=code
    &state={qualquer valor — volta junto com o code}
    &scope=cart-read cart-write shipping-calculate shipping-checkout ...   (separados por espaço)
```

O usuário autoriza e é redirecionado para `{callback}?code=...&state=...`.

### 4.4 Trocar `code` por token / renovar

`POST {base}/oauth/token`

```jsonc
// primeiro token
{
  "grant_type": "authorization_code",
  "client_id": 123,
  "client_secret": "...",
  "redirect_uri": "https://.../callback",
  "code": "..."
}

// renovação
{
  "grant_type": "refresh_token",
  "client_id": 123,
  "client_secret": "...",
  "refresh_token": "..."
}
```

Resposta 200:

```json
{ "token_type": "Bearer", "expires_in": 2592000, "access_token": "eyJ0eX...", "refresh_token": "def50200..." }
```

401: `{ "error": "invalid_client", "message": "Client authentication failed" }`

**Validades:** `access_token` = 30 dias · `refresh_token` = 45 dias. Cada renovação devolve um par novo, então renovando dentro de 45 dias o acesso é indefinido. O `access_token` é JWT — a expiração está no claim `exp`.

**Recomendação deles:** se uma chamada retornar `Unauthenticated`, guardar a requisição, renovar o token e repetir. Se falhar de novo, provavelmente a autorização foi revogada → precisa autorizar de novo.

> Implementação sugerida: tabela/config no Supabase com `access_token`, `refresh_token`, `expires_at`; cron renovando com folga (ex.: a cada ~25 dias) + retry on 401.

### 4.5 Scopes

Pedir **só o necessário** (é exigência deles).

| Scope | Para quê |
|---|---|
| `shipping-calculate` | Cotação |
| `cart-read` / `cart-write` | Ver / inserir / remover etiquetas no carrinho |
| `shipping-checkout` | Pagar etiquetas com saldo |
| `shipping-generate` | Gerar etiquetas |
| `shipping-print` | Imprimir |
| `shipping-preview` | Pré-visualizar |
| `shipping-tracking` | Status das etiquetas |
| `shipping-cancel` | Cancelar |
| `shipping-companies` | Listar transportadoras/serviços/agências |
| `orders-read` | Listar/pesquisar etiquetas |
| `companies-read` / `companies-write` | Lojas, endereços, telefones |
| `transactions-read` | Transações da carteira |
| `users-read` / `users-write` | Dados da conta |
| outros | `coupons-*`, `notifications-read`, `products-*`, `purchases-read`, `shipping-share`, `ecommerce-shipping` |

Conjunto provável para o Hema: `shipping-calculate cart-read cart-write shipping-checkout shipping-generate shipping-print shipping-tracking shipping-cancel shipping-companies orders-read`.

---

## 5. Endpoints

Todos relativos à base URL e com os headers da seção 3.

### Resumo

| Método | Rota | O quê | Scope |
|---|---|---|---|
| POST | `/oauth/token` | Token / refresh | — |
| POST | `/api/v2/me/shipment/calculate` | **Cotação** | shipping-calculate |
| POST | `/api/v2/me/cart` | **Inserir frete no carrinho** (cria a etiqueta) | cart-write |
| GET | `/api/v2/me/cart/{id}` | Ver item do carrinho | cart-read |
| DELETE | `/api/v2/me/cart/{id}` | Remover do carrinho | cart-write |
| POST | `/api/v2/me/cart/reverse` | Logística reversa (Correios) no carrinho | cart-write |
| POST | `/api/v2/me/shipment/checkout` | **Pagar** etiquetas | shipping-checkout |
| POST | `/api/v2/me/shipment/generate` | **Gerar** etiquetas | shipping-generate |
| POST | `/api/v2/me/shipment/print` | Link de impressão | shipping-print |
| GET | `/api/v2/me/imprimir/{pdf\|zpl\|jpeg}/{id}` | Etiqueta em arquivo (1 por req.) | shipping-print |
| GET | `/api/v2/me/imprimir/dace/{pdf\|zpl\|jpeg}/{order_id}` | DACE em arquivo | shipping-print |
| POST | `/api/v2/me/shipment/preview` | Link de pré-visualização (precisa sessão no ME) | shipping-preview |
| POST | `/api/v2/me/shipment/tracking` | **Status** das etiquetas | shipping-tracking |
| GET | `/api/v2/me/orders` | Listar etiquetas (`?status=`) | orders-read |
| GET | `/api/v2/me/orders/{id}` | Detalhe da etiqueta | orders-read |
| GET | `/api/v2/me/orders/search?q=` | Pesquisar por id, protocolo, documento, rastreio, código de autorização | orders-read |
| POST | `/api/v2/me/shipment/cancellable` | Verifica se pode cancelar | shipping-cancel |
| POST | `/api/v2/me/shipment/cancel` | **Cancelar** etiqueta | shipping-cancel |
| GET | `/api/v2/me/shipment/companies` | Transportadoras (+ serviços) | shipping-companies |
| GET | `/api/v2/me/shipment/companies/{companyId}` | Uma transportadora | shipping-companies |
| GET | `/api/v2/me/shipment/services` | Serviços (+ restrições de peso/medidas/seguro) | shipping-companies |
| GET | `/api/v2/me/shipment/services/{serviceId}` | Um serviço | shipping-companies |
| GET | `/api/v2/me/shipment/agencies?company=&country=&state=&city=` | Agências de postagem | shipping-companies |
| GET | `/api/v2/me/shipment/agencies/{agencyId}` | Uma agência | shipping-companies |
| POST | `/api/v2/me/balance` | Inserir saldo na carteira (pix/boleto) | — |
| POST/GET | `/api/v2/me/companies[/{storeId}]` | Cadastrar / ver loja | companies-* |
| POST/GET | `/api/v2/me/companies/{storeId}/addresses` | Endereços da loja | companies-* |
| POST/GET | `/api/v2/me/companies/{storeId}/phones` | Telefones da loja | companies-* |

### 5.1 Cotação — `POST /api/v2/me/shipment/calculate`

Obrigatórios: CEP origem, CEP destino e `products` **ou** `volumes`. Unidades: **cm**, **kg**, **R$** (número, não centavos).

**Por produtos** (o ME calcula o empacotamento):

```json
{
  "from": { "postal_code": "96020360" },
  "to":   { "postal_code": "01018020" },
  "products": [
    { "id": "SKU-1", "width": 11, "height": 17, "length": 11, "weight": 1, "insurance_value": 10.1, "quantity": 1 }
  ],
  "options": { "receipt": false, "own_hand": false },
  "services": "1,2,3,4"
}
```

- `insurance_value` é **unitário**; a API multiplica por `quantity`.
- `services` é opcional (string com ids separados por vírgula). Sem ele, usa os serviços habilitados pelo usuário no app.

**Por volumes** (quando já sabemos o pacote):

```json
{
  "from": { "postal_code": "96020360" },
  "to":   { "postal_code": "01018020" },
  "volumes": [ { "width": 11, "height": 17, "length": 11, "weight": 0.3, "insurance": 10.1 } ],
  "options": { "receipt": false, "own_hand": false }
}
```

**Resposta 200** — array, um item por serviço:

```jsonc
[
  {
    "id": 1, "name": "PAC",
    "price": "37.79", "custom_price": "37.79",          // ⚠ usar custom_*
    "discount": "2.09", "currency": "R$",
    "delivery_time": 9, "custom_delivery_time": 9,
    "delivery_range": { "min": 8, "max": 9 }, "custom_delivery_range": { "min": 8, "max": 9 },
    "packages": [
      { "price": "37.79", "format": "box", "dimensions": { "height": 2, "width": 11, "length": 16 },
        "weight": "0.10", "insurance_value": "50.00", "products": [ { "id": "SKU-1", "quantity": 1 } ] }
    ],
    "additional_services": { "receipt": true, "own_hand": true, "collect": false },
    "company": { "id": 1, "name": "Correios", "picture": "..." }
  }
  // serviço que não atende o trecho vem com "error": "mensagem"
]
```

- Usar **`custom_price` / `custom_delivery_time`** — refletem taxas/prazos extras configurados no painel.
- Valores numéricos vêm como **string**.
- **Salvar a cotação escolhida no pedido** (service id, preço, `packages`) — ela é usada para criar a etiqueta depois.
- 1 cotação = 1 par de CEPs.
- Azul Cargo: dá para cotar, mas não para comprar com NF-e via API.
- 422: `{ "message": "The given data was invalid.", "errors": { "from.postal_code": [...] } }`

### 5.2 Inserir no carrinho — `POST /api/v2/me/cart`

Aqui vai o envio completo (não dá para editar depois). Retorna o **`id` (UUID)** da etiqueta — guardar no nosso pedido.

```jsonc
{
  "service": 1,
  "agency": 123,                       // só Latam/Azul/Buslog e só com token do painel; senão omitir
  "from": {
    "name": "Hema", "phone": "11912345678", "email": "...",
    "document": "",                    // CPF (pessoa física)
    "company_document": "46867029000176", // CNPJ (pessoa jurídica)
    "state_register": "123456789",     // IE; "ISENTO"/vazio para não comercial
    "economic_activity_code": "4687701", // CNAE (obrigatório p/ Latam)
    "address": "Rua X", "complement": "", "number": "123", "district": "Centro",
    "city": "São Paulo", "country_id": "BR", "postal_code": "01010010", "state_abbr": "SP",
    "note": ""
  },
  "to": { /* mesma estrutura; pessoa física → só "document" (CPF) */ },
  "products": [ { "name": "Produto", "quantity": "1", "unitary_value": "400" } ],  // obrigatório e completo (DC-e/SEFAZ desde 06/04/2026)
  "volumes": [ { "height": 15, "width": 30, "length": 40, "weight": 1.2 } ],
  "options": {
    "insurance_value": 600,            // valor total segurado (soma da NF / declaração)
    "receipt": false, "own_hand": false, "reverse": false,
    "non_commercial": false,
    "invoice": { "key": "chave NF-e 44 dígitos" },  // envio comercial; NÃO enviar se não comercial
    "dce": { "key": "" },              // só se a DC-e foi gerada fora do ME
    "platform": "Hema",
    "reminder": "Pedido #1234",        // aparece na etiqueta, fora da área de recorte
    "tags": [ { "tag": "order-uuid-ou-numero", "url": null } ]  // para achar o pedido depois
  }
}
```

Regras importantes:
- **Correios, J&T, Loggi** (e Jadlog `.Package Centralizado`, id 27) **não aceitam múltiplos volumes**: se a cotação devolveu *n* `packages`, criar *n* etiquetas, uma por pacote.
- Envio **comercial** exige CNPJ + IE + chave da NF-e. **Não comercial** (declaração de conteúdo) só para PF ou PJ não contribuinte de ICMS.
- Se `state_abbr` for enviado, é validado contra o CEP.
- Etiqueta no carrinho expira (doc diz 7 dias no guia e 20 dias no FAQ — tratar como curto e não confiar).

Resposta 201 (trecho): `{ "id": "10b87ac0-...", "protocol": "ORD-2022...", "service_id": 3, "price": 25.35, "status": "pending", "tracking": null, ... }`

### 5.3 Checkout — `POST /api/v2/me/shipment/checkout`

```json
{ "orders": ["10b87ac0-e99d-4aa4-b8b0-b147a84e16bf"] }
```

- Paga com **saldo da carteira** do ME (precisa ter saldo e não ter estourado o limite de envios simultâneos).
- Alternativa: `"gateway": "yapay"` + `"redirect": "https://..."` gera link de pagamento (adiciona saldo e paga numa chamada).
- 200: `{ "purchase": { "id": "...", "protocol": "PUR-...", "total": 25.35, "status": "paid", "orders": [...], "transactions": [...] } }`
- 422 se alguma já estiver paga.

### 5.4 Gerar — `POST /api/v2/me/shipment/generate`

```json
{ "orders": ["uuid"] }
```

200: `{ "uuid": { "status": true, "message": "Envio gerado com sucesso" } }`

- Processo **assíncrono**: colocar um delay antes de imprimir.
- Ao gerar, a transportadora é notificada; cancelamento pode ficar bloqueado (ex.: coleta agendada).
- Etiqueta gerada vale **20 dias** para postagem (Correios: 7 dias).

### 5.5 Imprimir

`POST /api/v2/me/shipment/print`

```json
{ "mode": "public", "orders": ["uuid"] }
```

200: `{ "url": "https://melhorenvio.com.br/imprimir/ixQLaqqjmb2E" }`
- Padrão é `private` (precisa estar logado no ME). `public` = qualquer um com o link abre (bom para o painel admin).

Arquivo: `GET /api/v2/me/imprimir/pdf/{id}` (ou `zpl`, `jpeg`) → URL do S3. Uma etiqueta por requisição.
DACE: `GET /api/v2/me/imprimir/dace/pdf/{order_id}` — documento que acompanha o pacote quando há DC-e.

### 5.6 Status — `POST /api/v2/me/shipment/tracking`

```json
{ "orders": ["uuid"] }
```

```json
{
  "uuid": {
    "id": "uuid", "protocol": "ORD-...", "status": "posted",
    "tracking": "ME23002OWZ7BR", "melhorenvio_tracking": "ME23002OWZ7BR",
    "created_at": "...", "paid_at": "...", "generated_at": "...", "posted_at": "...",
    "delivered_at": null, "canceled_at": null, "expired_at": null
  }
}
```

Status possíveis: `pending`, `released`, `generated`, `posted`, `delivered`, `canceled`, `undelivered`, `suspended`, `paused`, `expired`.
O código de rastreio pode levar até 1 dia útil após a postagem para aparecer. Página pública de rastreio: `https://www.melhorrastreio.com.br/rastreio/{tracking}`.

### 5.7 Cancelar

1. `POST /api/v2/me/shipment/cancellable` → `{ "orders": ["uuid"] }` → `{ "uuid": { "cancellable": true, "time": 0 } }`
2. `POST /api/v2/me/shipment/cancel`

```json
{ "order": { "id": "uuid", "reason_id": "2", "description": "Pedido cancelado pelo cliente" } }
```

- `reason_id` é **sempre 2** para integrações.
- Cancelou depois de gerada → estorno para a carteira em ~12h após confirmar que não houve postagem.
- Ainda no carrinho (não paga): basta `DELETE /api/v2/me/cart/{id}`.

### 5.8 Agências

`GET /api/v2/me/shipment/agencies?company=2&state=SP&city=São+Paulo` — necessário quando a transportadora exige agência de postagem (Jadlog/Latam/Azul/Buslog, conforme config).
Pelo fluxo de app, a agência normalmente é configurada pelo usuário em *Integrações › Catálogo › Aplicativos autorizados › [app] › Transportadoras e serviços*.

---

## 6. Webhooks

Cadastro: painel › *Integrações › Área Dev.* › [app] › **Novo Webhook** › URL pública. Um endpoint por app.

⚠ Só recebe eventos de etiquetas **criadas por esse mesmo app**. Etiquetas criadas pelo site ou por outro app/token não disparam.

**Eventos** (`event`):

| Evento | Quando |
|---|---|
| `order.created` | Etiqueta criada (no carrinho) |
| `order.pending` | Voltou para o carrinho |
| `order.released` | Paga |
| `order.generated` | Gerada |
| `order.received` | Recebida em ponto Pegaki |
| `order.posted` | Postada |
| `order.delivered` | Entregue |
| `order.cancelled` | Cancelada |
| `order.undelivered` | Não pôde ser entregue |
| `order.paused` | Entrega interrompida, ação do destinatário necessária |
| `order.suspended` | Suspensa |

**Request recebido:** `POST`, headers `user-agent: Melhor Envio Webhooks/1.0`, `content-type: application/json`, **`x-me-signature`**.

```json
{
  "event": "order.posted",
  "data": {
    "id": "uuid", "protocol": "ORD-2024...", "status": "posted",
    "tracking": null, "self_tracking": null, "user_id": "0000111",
    "tags": [ { "tag": "nosso-id-do-pedido", "url": "..." } ],
    "created_at": "...", "paid_at": null, "generated_at": null, "posted_at": "...",
    "delivered_at": null, "canceled_at": null, "expired_at": null,
    "tracking_url": "https://www.melhorrastreio.com.br/rastreio/XXXX"
  }
}
```

**Validação da assinatura:** `x-me-signature` = **base64( HMAC-SHA256( corpo bruto, client_secret ) )**. Precisa do **raw body** (no Nest, habilitar `rawBody: true` no `NestFactory.create`).

```ts
import { createHmac, timingSafeEqual } from 'crypto';

function isValidMelhorEnvioSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', process.env.MELHOR_ENVIO_CLIENT_SECRET!)
    .update(rawBody)
    .digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

**Retentativas:** timeout de 6s; se não responder 2xx, tenta de novo a cada 15 min, **5 tentativas**, depois descarta. → responder rápido e processar idempotente (pode chegar repetido / fora de ordem). Ter também o `POST /shipment/tracking` como fallback (cron).

> Diferente da LogManager (token na URL), aqui dá para validar com HMAC de verdade.

---

## 7. Erros comuns

| Situação | Resposta |
|---|---|
| Token inválido/expirado | 401 `{ "message": "Unauthenticated." }` → refresh + retry |
| Callback diferente do cadastrado / client_id errado | `Client invalid` |
| Validação | 422 `{ "message": "The given data was invalid.", "errors": { "campo": ["..."] } }` |
| Validação do carrinho | 422 `{ "error": { "volumes": [["Peso do pacote 1 não informado", ...]] } }` (formato diferente!) |
| ID inexistente | 400/404 `{ "message": "No query results for model [App\\Order]." }` |
| Imprimir antes do pagamento processar | 404 `{ "error": "Não é possível imprimir etiquetas com o pagamento ainda não processado..." }` |
| Trecho não atendido (cotação) | item do array com `"error": "..."` |

---

## 8. Prazos / validades

| Etapa | Validade |
|---|---|
| `access_token` | 30 dias |
| `refresh_token` | 45 dias |
| Etiqueta no carrinho sem pagar | 7 dias (guia) / 20 dias (FAQ) — inconsistência na doc |
| Paga, sem gerar | 20 dias |
| Gerada, sem postar | 20 dias (privadas) · 7 dias (Correios) |
| Estorno após cancelar etiqueta gerada | ~12h |

Vencido um prazo, a etiqueta é cancelada automaticamente.

---

## 9. O que precisamos no Hema para integrar

**Pré-requisitos de dados (hoje não temos):**
- **Dimensões e peso por produto** (cm/kg) — não existem colunas para isso em `products`. Alternativa: cotar por `volumes` com uma(s) caixa(s) padrão calculadas por nós (ex.: por faixa de peso do pedido; já temos `price_per_kg` para itens vendidos por peso).
- CEP/endereço de origem da loja, CNPJ, IE, CNAE.
- Política de **NF-e**: envio comercial exige chave da NF-e no momento de inserir no carrinho (`options.invoice.key`). Hoje o payload da LogManager já tem `chaveNFE`/`numeroNFE` — ver de onde vem.
- Telefone e CPF do cliente (`to.document`) — celular já é obrigatório para users.
- Saldo na carteira do Melhor Envio (o checkout debita de lá).

**Variáveis de ambiente sugeridas:**

```env
MELHOR_ENVIO_BASE_URL=https://sandbox.melhorenvio.com.br
MELHOR_ENVIO_CLIENT_ID=
MELHOR_ENVIO_CLIENT_SECRET=          # também valida o x-me-signature do webhook
MELHOR_ENVIO_REDIRECT_URI=
MELHOR_ENVIO_USER_AGENT="Hema App (email-tecnico@...)"
MELHOR_ENVIO_FROM_POSTAL_CODE=
# access/refresh tokens: guardar no banco (renovam), não no .env
```

**Encaixe no código (proposta):**
- `backend/src/shipping/melhor-envio.service.ts` ao lado de `logmanager.service.ts` (mesmo padrão: `isConfigured()`, `fetch`, log de erro, nunca lançar em falha de rede).
- Endpoints internos:
  - `POST /shipping/quote` (público/autenticado) → cotação para o checkout do app, retornando `custom_price`/`custom_delivery_time` → alimenta `orders.delivery_fee`.
  - Callback OAuth `GET /melhor-envio/callback` (uso único pelo admin) + cron de refresh.
  - `POST /webhooks/melhor-envio` com validação HMAC → atualiza status do pedido.
- Colunas novas em `orders` (migração manual): `me_order_id` (uuid do ME), `me_service_id`, `me_quote` (jsonb da cotação escolhida), `me_status`, `tracking_code`, `tracking_url`, `label_url`.
- Sequência após pagamento aprovado (webhook do Mercado Pago): carrinho → checkout → generate → (delay) → print. Fazer em fila/retry, não síncrono no webhook do MP.
- Cancelamento/estorno do pedido (já existe fluxo de estorno MP): chamar `cancellable` → `cancel` (ou `DELETE /cart/{id}` se ainda não paga).

**Antes de produção:**
1. Testar todo o fluxo no **sandbox** (conta + app próprios do sandbox).
2. Criar conta + app em produção (dados reais da empresa).
3. Homologação/verificação do Melhor Envio **só é necessária** se quisermos aparecer no catálogo de integrações deles — para uso próprio, não precisa.

---

## 10. Links úteis da doc

- Autenticação: https://docs.melhorenvio.com.br/reference/fluxo-de-autorização · https://docs.melhorenvio.com.br/reference/solicitacao-do-token
- Cotação: https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos
- Carrinho: https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho
- Checkout: https://docs.melhorenvio.com.br/reference/compra-de-fretes-1
- Etiquetas: https://docs.melhorenvio.com.br/reference/geracao-de-etiquetas · https://docs.melhorenvio.com.br/reference/impressao-de-etiquetas
- Status: https://docs.melhorenvio.com.br/reference/rastreio-de-envios
- Cancelamento: https://docs.melhorenvio.com.br/reference/cancelamento-de-etiquetas
- Webhooks: https://docs.melhorenvio.com.br/docs/webhooks
- Sandbox: https://docs.melhorenvio.com.br/docs/sandbox
- FAQ: https://docs.melhorenvio.com.br/reference/faq
- Fluxogramas (PDF): [autenticação](https://melhorenvio.s3.sa-east-1.amazonaws.com/partners/manual/Diagrama+de+integra%C3%A7%C3%A3o+-+Fluxograma+de+autentica%C3%A7%C3%A3o+por+App.pdf) · [cotação e-commerce](https://melhorenvio.s3.sa-east-1.amazonaws.com/partners/manual/Diagrama+de+integra%C3%A7%C3%A3o+-+Fluxograma+de+cota%C3%A7%C3%A3o+\(E-commerce\).pdf) · [compra e impressão](https://melhorenvio.s3.sa-east-1.amazonaws.com/partners/manual/Diagrama+de+integra%C3%A7%C3%A3o+-+Fluxograma+de+compra+e+impress%C3%A3o+de+etiqueta+de+envio.pdf)
