-- Cupons de desconto percentual.
--
-- Duas modalidades vivem na mesma tabela, diferenciadas só por `max_uses`:
--   - uso único (ex.: cupom sorteado)   -> max_uses = 1
--   - uso recorrente (parceiros/influencers) -> max_uses = N ou NULL (ilimitado)
-- "Esgotado" é sempre derivado de used_count >= max_uses, nunca gravado em
-- is_active: se o esgotamento desligasse is_active, o estorno não saberia
-- distinguir "esgotou" de "admin desligou de propósito" e reativaria à toa.

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  code_normalized text generated always as (upper(btrim(code))) stored,
  description text,
  discount_percent numeric(5,2) not null check (discount_percent > 0 and discount_percent <= 100),
  -- NULL = ilimitado; 1 = uso único (consumido globalmente na 1ª utilização)
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  min_order_total numeric(10,2) check (min_order_total is null or min_order_total >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists coupons_code_normalized_uniq on public.coupons (code_normalized);

comment on table public.coupons is
  'Cupons de desconto percentual aplicados no checkout. Uso único = max_uses = 1.';

alter table public.coupons enable row level security;

-- Registro de cada aplicação de cupom a um pedido. Existe além do contador em
-- `coupons` para permitir estorno idempotente (vários caminhos de cancelamento
-- podem disparar concorrentemente) e auditoria de quem usou cada cupom.
create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null,
  discount_amount numeric(10,2) not null,
  status text not null default 'consumed' check (status in ('consumed', 'reverted')),
  created_at timestamptz not null default now(),
  reverted_at timestamptz
);

-- Garante a regra de "um cupom por pedido" no próprio banco: só pode existir
-- um resgate `consumed` por order_id.
create unique index if not exists coupon_redemptions_order_uniq
  on public.coupon_redemptions (order_id) where status = 'consumed';
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);

alter table public.coupon_redemptions enable row level security;

-- Snapshot do desconto no pedido: imutável mesmo que o cupom seja editado ou
-- desativado depois. `subtotal` passa a existir explicitamente porque, com
-- desconto, `total_price - delivery_fee` deixa de ser igual ao subtotal.
alter table public.orders
  add column if not exists subtotal numeric(10,2),
  add column if not exists coupon_id uuid references public.coupons(id) on delete set null,
  add column if not exists coupon_code text,
  add column if not exists coupon_discount_percent numeric(5,2),
  add column if not exists discount_amount numeric(10,2) not null default 0;

update public.orders
  set subtotal = total_price - coalesce(delivery_fee, 0)
  where subtotal is null;

-- Consumo atômico do cupom: FOR UPDATE serializa concorrência (mesmo padrão
-- de deduct_stock em 20260520_fix_deduct_stock_race_condition.sql), o que
-- impede dois pedidos simultâneos consumirem um cupom de uso único.
create or replace function public.redeem_coupon(
  p_code text,
  p_user_id uuid,
  p_order_id uuid,
  p_subtotal numeric
)
returns jsonb
language plpgsql
as $$
declare
  c record;
  v_discount numeric;
begin
  select * into c
  from public.coupons
  where code_normalized = upper(btrim(p_code))
  for update;

  if not found then
    raise exception 'COUPON_INVALID';
  end if;

  if not c.is_active then
    raise exception 'COUPON_INVALID';
  end if;

  if c.expires_at is not null and c.expires_at <= now() then
    raise exception 'COUPON_INVALID';
  end if;

  if c.max_uses is not null and c.used_count >= c.max_uses then
    raise exception 'COUPON_INVALID';
  end if;

  if c.min_order_total is not null and p_subtotal < c.min_order_total then
    raise exception 'COUPON_BELOW_MIN_ORDER:%', c.min_order_total;
  end if;

  v_discount := round(least(p_subtotal, p_subtotal * c.discount_percent / 100.0), 2);

  update public.coupons
  set used_count = used_count + 1, updated_at = now()
  where id = c.id;

  insert into public.coupon_redemptions (coupon_id, order_id, user_id, discount_amount)
  values (c.id, p_order_id, p_user_id, v_discount);

  return jsonb_build_object(
    'success', true,
    'coupon_id', c.id,
    'code', c.code,
    'discount_percent', c.discount_percent,
    'discount_amount', v_discount
  );
end;
$$;

-- Idempotente: se não houver resgate `consumed` para o pedido (nunca teve
-- cupom, ou já foi estornado por outro caminho concorrente), não faz nada.
create or replace function public.revert_coupon_redemption(p_order_id uuid)
returns jsonb
language plpgsql
as $$
declare
  r record;
begin
  select * into r
  from public.coupon_redemptions
  where order_id = p_order_id and status = 'consumed'
  for update;

  if not found then
    return jsonb_build_object('success', true, 'reverted', false);
  end if;

  update public.coupon_redemptions
  set status = 'reverted', reverted_at = now()
  where id = r.id;

  update public.coupons
  set used_count = greatest(0, used_count - 1), updated_at = now()
  where id = r.coupon_id;

  return jsonb_build_object('success', true, 'reverted', true, 'coupon_id', r.coupon_id);
end;
$$;

-- Uma função Postgres é uma transação só: estoque e cupom são consumidos
-- juntos, ou nenhum dos dois é. Sem isso, um INSUFFICIENT_STOCK (o erro mais
-- provável do fluxo de checkout) queimaria o cupom de uso único do cliente.
create or replace function public.deduct_stock_and_redeem(
  items jsonb,
  p_code text,
  p_user_id uuid,
  p_order_id uuid,
  p_subtotal numeric
)
returns jsonb
language plpgsql
as $$
begin
  perform public.deduct_stock(items);

  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('success', true, 'discount_amount', 0);
  end if;

  return public.redeem_coupon(p_code, p_user_id, p_order_id, p_subtotal);
end;
$$;
