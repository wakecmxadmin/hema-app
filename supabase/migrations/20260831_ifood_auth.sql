-- Migration: armazenamento das credenciais OAuth do iFood (fluxo distribuído)
--
-- No fluxo distribuído o lojista autoriza o acesso uma única vez, e a partir
-- daí a renovação depende do refresh token. Ele precisa sobreviver a restart
-- e deploy, então não pode viver em memória nem em arquivo local.

create table if not exists ifood_auth (
  client_id text primary key,
  -- Guardado entre o pedido do userCode e a autorização do lojista.
  authorization_code_verifier text,
  user_code text,
  user_code_expires_at timestamptz,
  -- Preenchidos após o lojista autorizar.
  refresh_token text,
  access_token text,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table ifood_auth is
  'Credenciais OAuth do iFood. Uma linha por aplicativo (client_id).';

-- Somente a service role acessa: são segredos de integração.
alter table ifood_auth enable row level security;
