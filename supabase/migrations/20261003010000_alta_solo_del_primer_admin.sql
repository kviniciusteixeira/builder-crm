-- ============================================================================
-- Builder CRM - que o cadastro automático seja SÓ o do primeiro administrador
-- ============================================================================
-- O gatilho cadastrava em team_members QUALQUER usuário novo de Auth, com
-- papel assessor e ativo. Como o endpoint de registro do Supabase Auth é público por
-- natureza (a chave anônima viaja no navegador), bastava chamá-lo à mão para
-- entrar no CRM: a página /signup fechada não protegia nada, porque ninguém é obrigado
-- a passar por ela.
--
-- Comprovado: cadastro direto contra /auth/v1/signup -> sessão válida -> assessor ativo ->
-- a caixa de entrada e os contatos carregavam.
--
-- A partir daqui o gatilho só resolve o início: a PRIMEIRA conta da
-- instância fica como administradora. Qualquer outro usuário de Auth que apareça sem
-- convite NÃO entra em team_members e cai em /sin-acceso.
--
-- Não quebra o cadastro a partir de Ajustes -> Equipo: essa rota insere a linha ela mesma com o
-- papel que o administrador escolhe, não dependia deste gatilho.
--
-- IMPORTANTE ao atualizar uma instância que já estava no ar: isto fecha a porta
-- daqui para a frente, mas não apaga quem tenha entrado antes. Há que olhar a lista de
-- Ajustes -> Equipo e desativar o que você não reconhecer.
-- ============================================================================

create or replace function public.alta_miembro_desde_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hay_miembros boolean;
begin
  select exists (select 1 from public.team_members) into hay_miembros;

  -- Já há equipe: o cadastro quem decide é um administrador, não o registro de Auth.
  if hay_miembros then
    return new;
  end if;

  insert into public.team_members (id, email, name, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    'admin',
    true
  )
  on conflict (id) do nothing;

  return new;
end $$;
