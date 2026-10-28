-- ============================================================================
-- Builder CRM - cadastro automático em team_members e primeiro administrador
-- ============================================================================
-- O Supabase Auth diz QUEM entrou; `team_members` diz O QUE É (admin ou assessor).
-- Este trigger cria a linha espelho ao nascer o usuário de Auth:
--   - a PRIMEIRA conta da instância fica como admin (bootstrap sem SQL à mão),
--   - as seguintes como assessor (Ajustes -> Equipo as cria e lhes fixa o papel com um
--     upsert, então o valor daqui é só o default).
-- ============================================================================

create or replace function public.alta_miembro_desde_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  es_primero boolean;
begin
  select not exists (select 1 from public.team_members) into es_primero;

  insert into public.team_members (id, email, name, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    case when es_primero then 'admin' else 'asesor' end,
    true
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.alta_miembro_desde_auth();
