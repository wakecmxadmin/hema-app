# Merchant-API do iFood — referência para o projeto

Levantado em 31/08/2026 a partir da API Reference logada
(`developer.ifood.com.br/pt-BR/docs/references`), com os trechos marcados
como **verificado** testados contra a loja de teste da Hema.

---

## Qual portal vale

| Portal | Situação |
|---|---|
| `developer.ifood.com.br` | **Oficial.** Merchant-API, é o que usamos |
| `developermercado.ifood.com.br` | **Legado.** SMI, view de banco e CSV de 24 campos |

O portal de mercado exibe aviso de descontinuação: desde 05/11/2024 as
tecnologias dele estão em migração para a Merchant-API, com prazo original
de adequação em 31/03/2025. A carga inicial da Hema foi por planilha, que é
o modelo antigo — daqui para frente, API.

⚠️ A documentação de mercado ainda aparece bem no Google. Se um trecho falar
em SMI, CSV ou `vlr_produto`, é do modelo legado.

---

## Autenticação — `authentication/v1.0` ✅ verificado

```
Base: https://merchant-api.ifood.com.br/authentication/v1.0/
POST /oauth/token      Requests an access token
POST /oauth/userCode   Requests a user code (só apps distribuídos)
```

App **centralizado** (o nosso — privado, loja única):

```bash
curl -X POST https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grantType=client_credentials" \
  -d "clientId=$IFOOD_CLIENT_ID" \
  -d "clientSecret=$IFOOD_CLIENT_SECRET"
```

Resposta: `{ accessToken, type: "bearer", expiresIn: 21599 }` — **~6h**.
Cacheie o token; renovar a cada request é motivo de reprovação na homologação.

App **distribuído** (lojas de terceiros — **o caso da Hema**):

```
POST /oauth/userCode   { clientId }
  → { userCode, authorizationCodeVerifier, verificationUrl, expiresIn }
```

1. O app pede o `userCode` e guarda o `authorizationCodeVerifier`.
2. O lojista informa o `userCode` no **Portal do Parceiro → Integrações**.
3. O app troca o `authorizationCode` por tokens:
   `grantType=authorization_code` + `authorizationCode` + `authorizationCodeVerifier`.
4. Dali em diante renova com `grantType=refresh_token` + `refreshToken`.

⚠️ **O grant type é liberado por aplicativo.** Pedir `userCode` com as
credenciais de um app centralizado devolve
`400 BadRequest — "Grant type not authorized for client"` (verificado).
Ou seja: o app precisa ser criado como **público/distribuído** no portal.

⚠️ **Centralizado x distribuído não é sobre quantidade de lojas, e sim de
quem elas são.** Centralizado serve para lojas da própria empresa dona do
app; distribuído, para lojas de clientes (CNPJ diferente), que precisam
autorizar o acesso.

O refresh token precisa sobreviver a restart e deploy — aqui ele fica na
tabela `ifood_auth` (migration `20260831_ifood_auth.sql`).

---

## Item — `item/v1.0` ✅ verificado — **é o módulo do nosso catálogo**

> The Item API provides means to interact with **groceries** products.

```
Base: https://merchant-api.ifood.com.br/item/v1.0/
POST  /ingestion/{merchantId}?reset={resetCatalog}   carga completa
PATCH /ingestion/{merchantId}                        atualização parcial
```

- **PATCH** — sincronização periódica de preço e estoque. É o que usamos.
  Com `fields: 'price-stock'` (no `sync()`, ou `?fields=price-stock` no
  `POST /ifood/sync`), o payload cai pra só `barcode` + `prices` +
  `inventory` — nada de `name`/`details`/`active`/`channels`. É o cenário
  **"Atualização parcial"** da homologação: só os campos enviados mudam
  (JSON Merge Patch), o resto do item permanece como está no iFood.
- **POST + `reset=true`** — substitui o catálogo inteiro. Só carga inicial.
- Resposta: **`202 Accepted`** + `[{"integrationUuid":["..."]}]`.
- Processamento é **assíncrono** e **não há rota GET de status** — o módulo
  expõe apenas POST e PATCH. O `202` confirma aceitação, não gravação.

### Corpo: `ItemIntegrationRequest[]`

Array na raiz. O `merchantId` vai na URL, não no corpo.

| Campo | Tipo | Obrig. | Nota |
|---|---|:--:|---|
| `barcode` | string | ✅ | EAN **ou código de balança** (produção própria, hortifrúti, carnes) |
| `name` | string | ✅ | Quanto mais detalhado, melhor |
| `plu` | string | | Código interno |
| `active` | boolean | | Ativo para venda |
| `details` | object | | Ver abaixo |
| `prices` | object | | `price`, `promotionPrice` |
| `scalePrices` | array | | Preço por balança — **um só por produto** |
| `inventory` | object | | `stock` |
| `multiple` | object | | `originalEan`, `quantity` — fardo |
| `channels` | string[] | | ex.: `["ifood-app"]` |

**`details`** — `categorization` (`department`, `category`, `subCategory`),
`brand`, `volume` (ex.: `180g`, `12kg`, `1unit`), `unit` (`G`, `KG`, `UN`),
`imageUrl`, `description`, `nearExpiration`.

**`prices`** — `price` (venda) e `promotionPrice` (**ignorado se maior que
`price`**).

**`scalePrices[]`** — `price` ("preço aplicado quando a quantidade é
atingida") e `quantity` (inteiro). ⚠️ Semântica ambígua: lê como desconto por
quantidade, mas "*only one scale price per product*" e o uso de "scale" como
balança em `barcode` sugerem preço por peso. **Não resolvido — perguntar na
homologação.**

**`multiple`** — fardo: `originalEan` é o EAN da unidade avulsa e `quantity`
quantas cabem no pacote. Valores ≤ 1 invalidam a integração. Não é para
fracionamento de granel.

### Exemplo aceito (202) ✅

```json
[{
  "barcode": "7898566782439",
  "name": "SABONETE LÍQUIDO ÍNTIMO BARBATIMÃO/AROEIRA 200ML BIO INSTIN",
  "active": true,
  "details": {
    "unit": "UN",
    "imageUrl": "https://...png",
    "categorization": { "category": "Cosméticos" }
  },
  "prices": { "price": 9 },
  "inventory": { "stock": 3 },
  "channels": ["ifood-app"]
}]
```

---

## Merchant — `merchant/v1.0` ✅ verificado

```
Base: https://merchant-api.ifood.com.br/merchant/v1.0
GET    /merchants                                    List merchants
GET    /merchants/{merchantId}                       Get merchant details
GET    /merchants/{merchantId}/status                Get merchant status
GET    /merchants/{merchantId}/status/{operation}    Status por operação
GET    /merchants/{merchantId}/interruptions         Lista interrupções
POST   /merchants/{merchantId}/interruptions         Cria interrupção
DELETE /merchants/{merchantId}/interruptions/{id}    Remove interrupção
GET    /merchants/{merchantId}/opening-hours         Horários
PUT    /merchants/{merchantId}/opening-hours         Define horários
GET    /merchants/{merchantId}/myPreparationTime     Tempo de preparo
POST   /merchants/{merchantId}/checkin-qrcode        QR code de check-in
```

`GET /merchants` é como se descobre o `merchantId`. `/status` traz as
validações pendentes (`is-connected` etc.) e diz por que a loja está fechada.

---

## Catalog — `catalog/v2.0`

Árvore de **restaurante** (categorias, produtos, opcionais, CRUD completo).
Para groceries a **carga** do catálogo continua sendo o módulo Item
(`POST`/`PATCH /item/v1.0/ingestion`, já implementado em
`ifood-catalog.service.ts`) — não se cria produto por produto aqui. O valor
deste módulo para nós é **leitura/verificação**: como o Item API não tem rota
de status, é por aqui que se confirma o que o iFood realmente gravou depois
de um `sync`, e é a evidência que a homologação manual do catálogo pede
(nome, imagem, descrição, valor).

```
Base: https://merchant-api.ifood.com.br/catalog/v2.0/
GET    /merchants/{merchantId}/catalogs                              ✅ verificado (schema abaixo)
GET    /merchants/{merchantId}/catalogs/{catalogId}/unsellableItems  ✅ verificado (schema abaixo)
GET    /merchants/{merchantId}/catalogs/{groupId}/sellableItems      ✅ verificado (schema abaixo)
GET    /merchants/{merchantId}/catalog/version
GET    /merchants/{merchantId}/catalogs/{catalogId}/categories       ✅ verificado

GET    /merchants/{merchantId}/products              List products ⚠️ ver nota
POST   /merchants/{merchantId}/products              Create a product
PUT    /merchants/{merchantId}/products/{productId}  Edit a product
PATCH  /merchants/{merchantId}/products/{productId}  JSON Merge Patch
PATCH  /merchants/{merchantId}/products/status       Batch de status
PATCH  /merchants/{merchantId}/products/price        Batch de preços
GET    /merchants/{merchantId}/products/externalCode/{externalCode}

PUT    /merchants/{merchantId}/items                 Create or update an item
PATCH  /merchants/{merchantId}/items/{itemId}        JSON Merge Patch
GET    /merchants/{merchantId}/items/{itemId}/flat

POST   /merchants/{merchantId}/inventory             Cria/atualiza estoque
GET    /merchants/{merchantId}/inventory/{productId} Consulta estoque
POST   /merchants/{merchantId}/inventory/batchFetch  Estoque em lote
POST   /merchants/{merchantId}/inventory/batchDelete Remove estoque em lote

GET    /merchants/{merchantId}/batch/{batchId}       Resultado de lote
POST   /merchants/{merchantId}/image/upload          Upload de imagem
POST   /merchants/{merchantId}/version/upgrade       Catálogo para v2
```

⚠️ `GET /products` responde `400 "Pagination parameters must be numeric"` com
`page`, `size`, `limit`, `offset`, `pageSize` e até sem query. A paginação
provavelmente vai por header — não descoberto. Como não é o caminho que
usamos (groceries entra por Item), não vale insistir nela agora.

⚠️ `PATCH /items/price`, `/items/status` e `/items/externalCode` estão
**depreciados**: a própria referência manda usar `PATCH /{merchantId}/items/{itemId}`.

### Os 3 endpoints de leitura que importam pra verificação (levantados 14/09/2026)

**`GET /catalogs/{merchantId}`** — devolve os `catalogId` da loja (normalmente
um por `context`, ex. `DEFAULT`). É o primeiro passo: sem `catalogId`/`groupId`
não dá pra chamar os outros dois.

```json
[{ "catalogId": "string", "status": "AVAILABLE", "context": ["DEFAULT", "INDOOR"], "modifiedAt": "2026-09-14T18:58:36.939Z", "groupId": "string" }]
```

**`GET /catalogs/{merchantId}/{groupId}/sellableItems`** — é o que prova o
catálogo pra homologação: por item, traz `itemName`, `itemDescription`,
`itemPrice.value`/`originalValue`, `logosUrls` (imagem), `categoryName`,
`itemEan`/`itemExternalCode`. Usa `groupId` (não `catalogId`) — vem da mesma
resposta de `/catalogs`.

```json
[{
  "itemId": "string", "categoryId": "string", "itemEan": "string", "itemExternalCode": "string",
  "categoryName": "string", "itemName": "string", "itemDescription": "string",
  "logosUrls": ["string"], "itemPrice": { "value": 0, "originalValue": 0 },
  "itemPackaging": "string", "itemQuantity": 0, "itemUnit": "string"
}]
```

**`GET /catalogs/{merchantId}/{catalogId}/unsellableItems`** — itens/categorias
fora de venda com o motivo (`ITEM_PAUSED`, `ITEM_HAS_VIOLATION`,
`CATEGORY_PAUSED`, `HAS_VIOLATION`). É o jeito de flagrar item rejeitado pelo
iFood sem precisar abrir o Portal do Parceiro na mão.

```json
{ "categories": [{ "id": "string", "status": "string", "restrictions": ["HAS_VIOLATION"], "unsellableItems": [{ "id": "string", "productId": "string", "restrictions": ["ITEM_PAUSED"] }] }] }
```

Todos os três exigem só `merchantId` (+ `catalogId`/`groupId` encadeado) e
seguem o mesmo padrão de erro `400 BadRequest` do resto da Merchant-API.

---

## Events — `events/v1.0` ✅ verificado (schema abaixo) — **é o heartbeat de conexão**

```
Base: https://merchant-api.ifood.com.br/events/v1.0
GET  /events:polling         Get New Events
POST /events/acknowledgment  Acknowledge Events
```

Não é só pra pedidos: **a validação `is-connected` do status da loja depende
disso.** Descoberto em 14/09/2026 — a loja de teste ficava com `state: ERROR`
e `is-connected: ERROR` ("Gestor de Pedidos ou PDV desconectado") porque
nada no projeto fazia polling. Com a loja desconectada, ela não aparece pro
consumidor final e o catálogo enviado pelo Item API não é exibido mesmo
recebendo `202`. Implementado em `ifood-events.service.ts`: `@Interval` de
30s chamando polling + acknowledgment, ligado sempre que as credenciais
estão configuradas (independe do `IFOOD_SYNC_ENABLED`, que é só do catálogo).
Pedidos em si (processar o conteúdo dos eventos) ainda não são tratados —
por enquanto só confirma recebimento pra manter o heartbeat.

**`GET /events:polling`** — sem parâmetros obrigatórios.
`200` com array de eventos, ou **`204` quando não há evento pendente**
(tratar como sucesso, não erro).

```json
[{ "id": "string", "code": "PLC", "fullCode": "PLACED", "orderId": "string", "createdAt": "2019-09-19T13:40:11.822Z", "metadata": {} }]
```

**`POST /events/acknowledgment`** — corpo é só os `id`s recebidos.
`202 Accepted`. Evento não confirmado volta a ser entregue no próximo poll.

```json
[{ "id": "cd40582b-0ef2-4d52-bc7c-507fdff12e21" }, { "id": "193dccf8-bf1d-4860-85a0-8019f5809877" }]
```

## Order — `order/v1.0`

```
Base: https://merchant-api.ifood.com.br/order/v1.0
GET  /orders/{id}                      Detalhes
GET  /orders/{id}/virtual-bag          Virtual bag
POST /orders/{id}/confirm              Confirma
POST /orders/{id}/startPreparation     Inicia preparo
POST /orders/{id}/readyToPickup        Pronto para retirada
POST /orders/{id}/dispatch             Despacha
GET  /orders/{id}/cancellationReasons  Códigos de cancelamento
POST /orders/{id}/requestCancellation  Solicita cancelamento
GET  /orders/{id}/tracking             Rastreio
```

## Picking — `picking/v1.0`

Separação de pedido de mercado: `POST /orders/{id}/items` (adicionar),
`/replace` (substituir), `PATCH` (modificar), `DELETE` (remover),
`startSeparation` e `endSeparation`.

## Outros módulos

`financial/v3.0` (conciliação, repasses, antecipações) ·
`review/v2.0` (avaliações) · `logistics` e `shipping` (entrega) ·
`analytics/v1.0` (KPIs de pedidos).

---

## Pegadinhas confirmadas na prática

1. **404 "no Route matched with those values"** é do gateway e aparece tanto
   para rota inexistente quanto para **método errado na rota certa**.
   `GET /item/v1.0/ingestion/{id}` dá 404 mesmo com a rota existindo — só
   aceita POST e PATCH. Não conclua que o path não existe a partir de um GET.
2. **403 `No permissions granted to client`** — o app existe mas não tem
   módulos liberados. É o estado do app oficial **antes da homologação**.
   Desenvolva com o app de teste, que já vem com acesso.
3. **Respostas vêm comprimidas.** `curl` sem `--compressed` devolve binário.
4. **O portal de docs bloqueia leitura automatizada** (Cloudflare). Precisa
   de navegador com sessão.
5. **`202` não é confirmação de gravação.** Sem rota de status, a validação
   real é olhar a loja no Portal do Parceiro.

---

## Como este projeto usa

| Arquivo | Papel |
|---|---|
| `ifood-auth.service.ts` | Token com cache e renovação antecipada |
| `ifood-api.service.ts` | Cliente HTTP: retry, backoff, 401 |
| `ifood-catalog.service.ts` | Mapeamento `products` → `ItemIntegrationRequest`, envio (`sync`) e conferência (`verify`) |
| `ifood-events.service.ts` | Heartbeat: polling de eventos a cada 30s + acknowledgment |
| `ifood.controller.ts` | `/ifood/status`, `/ifood/merchants`, `/ifood/merchant-status`, `/ifood/sync`, `/ifood/catalog/verify`, `/ifood/events/poll` |
| `HOMOLOGACAO.md` | Documento da reunião de validação |

Variáveis: `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET`, `IFOOD_API_URL`,
`IFOOD_MERCHANT_ID`, `IFOOD_PRICE_MARKUP`, `IFOOD_SYNC_ENABLED`,
`IFOOD_SCALE_PRICES`.
