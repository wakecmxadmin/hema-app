-- O cadastro envia o telefone no metadata do auth (único caminho possível
-- quando a confirmação de e-mail está ligada e não há sessão ao final do
-- signUp). A trigger só copiava o nome, então o telefone se perdia e a
-- transportadora recusava a etiqueta por falta de `telefoneComprador`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    new.raw_user_meta_data->>'name',
    nullif(new.raw_user_meta_data->>'phone', '')
  );

  return new;
end;
$$;
