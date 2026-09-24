-- Migration: envio incremental do catálogo ao iFood
--
-- O iFood joga cargas grandes numa fila de baixa prioridade, então depois da
-- primeira carga só sobem produtos novos ou alterados. `products.updated_at`
-- não serve para detectar mudança (o fluxo do n8n regrava em todo produto do
-- lote), por isso guardamos o hash do payload que o iFood aceitou e
-- comparamos a cada rodada.

-- Último estado aceito pelo iFood (202), por loja e produto.
create table if not exists ifood_sync_state (
  merchant_id text not null,
  product_id uuid not null,
  -- Código enviado. Se o `codigo` do produto mudar, o item antigo é
  -- desativado no iFood por este valor.
  barcode text not null,
  -- sha256 do item no formato ItemIntegrationRequest.
  payload_hash text not null,
  -- Cópia do que foi enviado, para conferência.
  payload jsonb not null,
  last_sent_at timestamptz not null default now(),
  last_run_id uuid,
  primary key (merchant_id, product_id)
);

comment on table ifood_sync_state is
  'Último payload de cada produto aceito pelo iFood — base do envio incremental.';

-- Histórico das rodadas de sincronização (cron e manuais).
create table if not exists ifood_sync_runs (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null,
  -- cron | manual
  trigger text not null,
  -- true = reenviou tudo ignorando os hashes
  force boolean not null default false,
  -- running | success | partial | error | empty
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total integer not null default 0,
  novos integer not null default 0,
  alterados integer not null default 0,
  removidos integer not null default 0,
  inalterados integer not null default 0,
  ignorados integer not null default 0,
  enviados integer not null default 0,
  lotes integer not null default 0,
  motivo_ignorados jsonb not null default '{}'::jsonb,
  falhas jsonb not null default '[]'::jsonb,
  error text
);

create index if not exists ifood_sync_runs_started_at_idx
  on ifood_sync_runs (merchant_id, started_at desc);

comment on table ifood_sync_runs is
  'Histórico de sincronizações do catálogo com o iFood, exibido em /admin/ifood.';

-- Somente a service role (backend) acessa.
alter table ifood_sync_state enable row level security;
alter table ifood_sync_runs enable row level security;
