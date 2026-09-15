# Homologação — Módulo Catálogo (iFood Groceries)

Documento de apoio para a reunião de validação com o analista do iFood.
Loja: Hema Cereais · Integrador: Wake Comex (CNPJ 66.867.352/0001-57)

## 1. Arquitetura

| Arquivo | Responsabilidade |
|---|---|
| `ifood-auth.service.ts` | OAuth2 `client_credentials`, token em cache com renovação antecipada |
| `ifood-api.service.ts` | Cliente HTTP da Merchant-API: headers, retry, backoff |
| `ifood-catalog.service.ts` | Leitura do catálogo, validação, mapeamento e envio em lotes |
| `ifood.controller.ts` | `GET /ifood/status`, `GET /ifood/merchants`, `POST /ifood/sync`, `GET /ifood/catalog/verify` — restrito a `StaffGuard` |
| `frontend/app/admin/ifood.tsx` | Tela do lojista: estado da conexão, simulação, envio e relatório |
| `ifood-events.service.ts` | Heartbeat: polling de eventos a cada 30s + acknowledgment |

## 1.1 Checklist oficial do módulo Item — onde cada cenário está no código

| Cenário | Endpoint | Implementação | Status |
|---|---|---|---|
| Criar novos itens | `POST /ingestion/{merchantId}?reset={bool}` | `sync({ mode: 'post', reset: true })` | Requisição aceita (`202`, 0 falhas em lotes de até 500). **Não confirmado** que os itens aparecem em `GET .../sellableItems` — ver pendência principal abaixo. |
| Reativar itens inativos | `POST /ingestion/{merchantId}?reset={bool}` | `active` reflete `is_active` do banco em todo envio `fields: 'full'` | Mesma pendência: envio aceito, resultado não observável ainda. |
| Atualização parcial | `PATCH /ingestion/{merchantId}` | `sync({ fields: 'price-stock' })` manda só `barcode`+`prices`+`inventory` (JSON Merge Patch) | Implementado e testado (6 testes unitários); não depende da pendência de visibilidade, é sobre o formato do payload que enviamos. |

## 2. Autenticação

- **Produção: fluxo centralizado** (`client_credentials`), igual ao de
  desenvolvimento. O backend é SaaS na nuvem, então o tipo do aplicativo é
  Centralizado; a loja do cliente (outro CNPJ) é vinculada pela aba
  **Permissões** do Developer Portal e aprovada pelo lojista no Portal do
  Parceiro — não exige aplicativo Distribuído.
- **Fluxo distribuído implementado como contingência** (`userCode` →
  `authorizationCode` → `refresh_token`, persistido em `ifood_auth`), caso a
  homologação exija esse modo. Alternado por `IFOOD_AUTH_MODE`.
- Token guardado em memória e renovado **5 minutos antes** do vencimento (padrão 6h).
- Renovações simultâneas são coalescidas numa só requisição (`inFlight`).
- Resposta `401` invalida o cache e repete a chamada **uma única vez** — sem risco de laço.

## 3. Tratamento de erros e retry

| Situação | Comportamento |
|---|---|
| `401` | Renova token, repete 1x |
| `429`, `408`, `5xx` | Até 4 tentativas, backoff exponencial com jitter (1s, 2s, 4s) |
| `Retry-After` presente | Header manda, limitado a 30s |
| `4xx` (exceto 401/408/429) | **Não** repete — erro de payload não melhora com insistência |
| Falha de rede | Mesma política de backoff |
| Lote com falha | Registrado em `falhas[]` com status e corpo; os demais lotes seguem |

## 4. Validação de dados

Toda linha descartada recebe um motivo nomeado, contabilizado em `motivoIgnorados`:

`sem codigo` · `codigo invalido` · `sem nome` · `tipo desconhecido` · `sem preco` ·
`estoque invalido`

## 5. Regras de negócio do catálogo

- **Preço:** markup de 12% e arredondamento **para baixo** ao real inteiro
  (`floor(preço × 1,12)`) — mesma regra da carga inicial por planilha, para o
  catálogo não divergir. Ex.: R$ 4,90/kg → R$ 5,00; R$ 10,00 → R$ 11,00.
- **Piso de R$ 1:** os 5 itens de centavos do catálogo (R$ 0,27 a R$ 0,80)
  zerariam no arredondamento. Sobem por R$ 1 em vez de serem descartados —
  item a R$ 0 no iFood é pedido perdido.
- **Granel:** `price_per_kg` é o preço de 1 kg, estoque em kg, unidade `KG`.
- **Unitário:** `price` por unidade, unidade `UN`.
- **Ruptura:** estoque zero ou negativo **é transmitido**, nunca omitido, para
  o iFood não seguir vendendo item indisponível.
- **Inativo:** sobe como indisponível em vez de sumir do catálogo.
- **Chave de casamento:** coluna `codigo` (EAN nos unitários, código interno de
  balança na maior parte do granel) → `externalCode` / Código PLU.

## 6. Escala e lotes

- Catálogo atual: **3.051 produtos** (2.246 unitários, 805 a granel).
- Leitura paginada do banco (1.000 por página), envio em lotes de **500**.
- Sync concorrente é bloqueado por flag (`running`) — cron não empilha execução.
- Cron de hora em hora, atrás de `IFOOD_SYNC_ENABLED`.

## 7. Checklist de testes

`npx jest src/ifood` — **57 testes, 57 passando**.

### Resiliência do cliente HTTP (14)
```
✓ envia Bearer token e Content-Type
✓ não chama a API sem token
✓ no 401 renova o token e repete uma única vez
✓ não entra em loop se o 401 persistir
✓ repete com backoff no status 429 e devolve o sucesso
✓ repete com backoff no status 500 e devolve o sucesso
✓ repete com backoff no status 502 e devolve o sucesso
✓ repete com backoff no status 503 e devolve o sucesso
✓ repete com backoff no status 408 e devolve o sucesso
✓ respeita o Retry-After em segundos
✓ desiste após 4 tentativas e devolve o erro
✓ não repete em erro do cliente (400)
✓ repete falha de rede e se recupera
✓ backoff é exponencial
```

### Mapeamento e regras de preço (18)
```
✓ R$ 10 vira R$ 11          ✓ R$ 4,90 vira R$ 5
✓ R$ 12,12 vira R$ 13       ✓ R$ 100 vira R$ 112
✓ R$ 1 vira R$ 1            ✓ nunca arredonda para cima
✓ mapeia com unidade UN e código como externalCode
✓ usa price_per_kg e marca unidade KG
✓ envia estoque zerado em vez de omitir (evita ruptura e cancelamento)
✓ trata estoque nulo como zero
✓ descarta com motivo "sem codigo"
✓ descarta com motivo "codigo invalido"
✓ descarta com motivo "sem nome"
✓ descarta com motivo "tipo desconhecido"
✓ descarta com motivo "sem preco" (zero e nulo)
✓ descarta com motivo "preco zerado apos arredondamento"
✓ produto inativo sobe como indisponível, não some do catálogo
```

Backoff observado em execução real: `1155ms → 2222ms → 4148ms`, e
`Retry-After: 7` respeitado como `7000ms`.

## 8. Ambiente de teste (verificado em 31/08/2026)

| Item | Valor |
|---|---|
| Loja de teste | `f8169ee5-aeac-43cb-981c-64755812b68e` — Teste - WAKECOMEX LTDA |
| Catálogo | `04e1926e-e59c-45c4-8a85-355109a3dcad` — context `DEFAULT`, `AVAILABLE` |
| Categorias | `[]` (vazio) |
| Token | `200 OK`, `expiresIn: 21599` (~6h) |
| Status da loja | `state: ERROR`, validação `is-connected` em ERROR |

### Envio de itens — validado em 31/08/2026

```
PATCH /item/v1.0/ingestion/{merchantId}
  → 202 Accepted
  → [{"integrationUuid":["3019e796-2296-4eac-b8f3-fb392dbc9d94"]}]
```

Lote de 2 produtos reais (1 unitário com EAN, 1 a granel com código de balança)
aceito pela loja de teste. Ingestão é **assíncrona** e não há rota GET de
status — a referência do módulo Item expõe apenas POST e PATCH.

### Endpoints confirmados

```
POST /authentication/v1.0/oauth/token                      200
GET  /merchant/v1.0/merchants                              200
GET  /merchant/v1.0/merchants/{id}                         200
GET  /merchant/v1.0/merchants/{id}/status                  200
GET  /catalog/v2.0/merchants/{id}/catalogs                 200
GET  /catalog/v2.0/merchants/{id}/catalogs/{cid}/categories 200
GET  /catalog/v2.0/merchants/{id}/products                 400 (existe; paginação a definir)
PATCH /item/v1.0/ingestion/{merchantId}                    202 Accepted
```

### Corpo enviado (ItemIntegrationRequest)

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

Granel segue o mesmo formato com `unit: "KG"`, `plu` preenchido com o código
de balança e `prices.price` = preço de 1 kg.

### Endpoints que NÃO existem

```
/item/v1.0/items                     404 no Route matched
/item/v1.0/merchants/{id}/items      404 no Route matched
/catalog/v2.0/merchants/{id}/items   404 no Route matched
/groceries/v1.0/merchants/{id}/items 404 no Route matched
```

## 9. Pendências antes da reunião

- [ ] **App de produção está sem módulos liberados.** Decisão final em
      15/09/2026: criado um app novo e enxuto, **`prod-hema`**
      (`47a20ebd-3e2e-4fc7-9f0b-96903826b701`), categoria **Groceries**,
      só com o módulo **Item** marcado — é o único que sobe o catálogo de
      verdade (groceries entra por Item, não por Catalog v2.0). Os dois
      apps anteriores (`hema-app` Item+Merchant, e um terceiro só-Catalog)
      **não serão usados** — evita abrir homologação de módulos que não
      importam pro objetivo (catálogo automático). Consequência aceita: o
      `GET /ifood/catalog/verify` (conferência do catálogo, módulo Catalog)
      e o `GET /ifood/merchant-status` (módulo Merchant) ficam sem uso em
      produção — só funcionam no ambiente de teste. Confirmado: criar o app
      com o módulo marcado **não libera automaticamente** — token ainda dá
      `403 No permissions granted to client 47a20ebd-...` até a homologação
      ser aprovada. A prova pro analista continua vindo do **app de teste**
      (`96a5b0ba-...`), não dá pra validar o `prod-hema` antes de aprovado.

      Verificado em 02/09/2026, client `35e60200-88a9-4cfd-b062-cd31e308632c`
      (app anterior, mantido como histórico do mesmo tipo de erro):

      ```
      POST /authentication/v1.0/oauth/token   (client_credentials)
        → 403 {"code":"Forbidden",
               "message":"No permissions granted to client 35e60200-…"}
      POST /authentication/v1.0/oauth/userCode
        → 400 {"code":"BadRequest",
               "message":"Grant type not authorized for client"}
      ```

      O 400 no `userCode` confirma que o app **é Centralizado** — tipo correto
      para o caso. O 403 no token é ausência de módulo, não de grant type: o
      módulo **Item (Groceries) só é liberado via homologação**. O app de teste
      (`96a5b0ba-…`) responde 200 no token porque já tem os módulos de teste.
      **Ação:** abrir a homologação pela aba Suporte; não criar outro app.
- [ ] Aplicar a migration `20260831_ifood_auth.sql` antes de usar o modo
      distribuído.

- [ ] **Confirmar que os 2 itens de teste apareceram** na loja de teste
      (ingestão assíncrona, sem rota de status).
- [ ] **`scalePrices` para itens vendidos por peso**: a referência é ambígua
      (`quantity` = "quantidade para o preço ser aplicado"). Hoje o granel vai
      por `prices.price` + `details.unit=KG`; `scalePrices` está implementado
      atrás da flag `IFOOD_SCALE_PRICES`, desligada. Perguntar ao analista.
- [ ] **Precedência da imagem**: na carga por planilha o iFood preencheu
      alguns itens com a imagem do catálogo global dele (por EAN), no lugar
      das fotos tiradas pela loja. A ingestão via API envia `details.imageUrl`
      com a URL da Hema — confirmar com o analista se esse campo **sobrescreve**
      a imagem do catálogo global ou se ela só é usada quando o EAN não é
      reconhecido. Se não sobrescrever, pedir o procedimento para fixar a
      imagem do lojista.
- [ ] **Departamento/subcategoria**: a base da Hema é plana (47 categorias),
      então só `category` é enviado. Definir agrupamento se o iFood exigir.
- [x] **Loja de teste com `is-connected` em ERROR** — causa raiz confirmada
      em 14/09/2026: nada no projeto fazia polling de eventos, e o iFood usa
      isso como heartbeat de conexão (`code: is.not.connected.config`,
      "Gestor de Pedidos ou PDV desconectado"). Corrigido com
      `ifood-events.service.ts` (polling a cada 30s + acknowledgment) —
      confirmado em 15/09/2026: `is-connected: OK`, "Loja aberta".
- [x] **Catálogo nunca aparece em `sellableItems`, mesmo com tudo certo do
      nosso lado.** Resolvido em 15/09/2026: perguntado diretamente ao
      analista de homologação (chamado aberto pro `prod-hema`,
      `47a20ebd-...`). Resposta oficial: **é comportamento esperado do
      sandbox** — o ambiente de teste valida o fluxo de ingestão/resposta,
      mas não sincroniza o catálogo de forma confiável. **Não bloqueia a
      homologação.** O que importa pra aprovação é só: `202` sem falhas no
      `POST reset=true` (criação e reativação) e payload correto no `PATCH`
      (atualização parcial) — os três já implementados e testados.
      **Próximo passo:** gravar vídeo de evidência mostrando os 3 fluxos
      (criação, reativação, atualização parcial) na tela da aplicação, com
      a requisição enviada e o resultado (202) visíveis.
- [ ] Sincronização em tempo real: hoje é cron de hora em hora. Confirmar
      com o analista se a janela é aceita.
- [x] **313 produtos sem `codigo`** — resolvido em 02/09/2026. O levantamento
      no banco mostrou correlação perfeita: **todos os 313 estão inativos**, e
      **nenhum produto ativo está sem `codigo`**.

      | | com `codigo` | sem `codigo` |
      |---|:--:|:--:|
      | **ativos** | 2.695 | **0** |
      | **inativos** | 39 | 313 |

      O descarte por `sem codigo` nunca atinge item à venda — são produtos já
      desativados na loja. Nenhuma ação necessária.
- [x] **5 itens que zeravam no arredondamento** — resolvido em 02/09/2026:
      passam a subir pelo piso de R$ 1 (`priceForIfood`). São 3 brindes de
      cartela premiada (R$ 0,27), 1 chiclete (R$ 0,55) e 1 paçoquita
      (R$ 0,80, inativa). ⚠️ Confirmar com a loja se os **brindes** devem
      mesmo ser vendáveis no iFood a R$ 1 ou se saem do catálogo.
