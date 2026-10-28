-- ============================================================================
-- Builder CRM - Row Level Security
-- ============================================================================
-- Por quê: a anon key viaja no navegador e, sem RLS, o PostgREST deixa ler e
-- escrever qualquer tabela de `public` com ela. O app escreve pelo Drizzle com o
-- papel `postgres` (dono das tabelas, com bypass de RLS), então estas políticas
-- NÃO afetam o CRM: são a rede de segurança da API pública do Supabase.
--
-- Modelo:
--   anon          -> sem privilégios sobre nada de `public`.
--   authenticated -> só LEITURA, segundo team_members:
--                      admin     vê tudo
--                      assessor  vê seus contatos e o que depende deles
--                      cada membro vê suas notificações e assinaturas push
--                    Sem políticas de escrita: o app não escreve pelo PostgREST.
--
-- As tabelas que um módulo acrescentar também devem ter RLS: o runner
-- (scripts/migrar.mjs) habilita no final de cada execução se faltar.
-- ============================================================================

-- Funções de apoio (security definer: leem team_members mesmo que RLS se aplique) ----
create or replace function public.es_miembro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where id = auth.uid() and active);
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where id = auth.uid() and active and role = 'admin');
$$;

-- true se o usuário da sessão pode ver esse contato (admin, ou é o proprietário).
create or replace function public.contacto_visible(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin()
      or exists (select 1 from public.contacts c where c.id = cid and c.owner_id = auth.uid());
$$;

-- anon: nada ------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- RLS em todas as tabelas -----------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Políticas de leitura para authenticated -------------------------------------
-- Recriam-se sempre (drop + create) para que a migração seja idempotente.

-- Equipe: cada um se vê a si mesmo; o admin vê todos.
drop policy if exists team_members_select on team_members;
create policy team_members_select on team_members for select to authenticated
  using (public.es_admin() or id = auth.uid());

-- Contatos e o que depende deles.
drop policy if exists contacts_select on contacts;
create policy contacts_select on contacts for select to authenticated
  using (public.es_admin() or owner_id = auth.uid());

drop policy if exists deals_select on deals;
create policy deals_select on deals for select to authenticated
  using (public.contacto_visible(contact_id));

drop policy if exists activities_select on activities;
create policy activities_select on activities for select to authenticated
  using (public.contacto_visible(contact_id));

-- As tabelas dos módulos (visitas, propiedades, ...) NÃO se tocam aqui: cada módulo
-- habilita seu RLS e declara sua política na própria migração. Se o núcleo as
-- nomeasse, uma instância com os módulos desligados não poderia migrar.

drop policy if exists documents_select on documents;
create policy documents_select on documents for select to authenticated
  using (public.contacto_visible(contact_id));

drop policy if exists conversations_select on conversations;
create policy conversations_select on conversations for select to authenticated
  using (public.es_admin() or (contact_id is not null and public.contacto_visible(contact_id)));

drop policy if exists messages_select on messages;
create policy messages_select on messages for select to authenticated
  using (
    public.es_admin()
    or (contact_id is not null and public.contacto_visible(contact_id))
    or exists (select 1 from conversations v where v.id = messages.conversation_id
               and v.contact_id is not null and public.contacto_visible(v.contact_id))
  );

drop policy if exists contact_identities_select on contact_identities;
create policy contact_identities_select on contact_identities for select to authenticated
  using (public.contacto_visible(contact_id));

drop policy if exists agent_jobs_select on agent_jobs;
create policy agent_jobs_select on agent_jobs for select to authenticated
  using (public.contacto_visible(contact_id));

drop policy if exists automation_runs_select on automation_runs;
create policy automation_runs_select on automation_runs for select to authenticated
  using (public.es_admin() or (contact_id is not null and public.contacto_visible(contact_id)));

-- O que é de cada membro.
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select to authenticated
  using (member_id = auth.uid() or public.es_admin());

drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions for select to authenticated
  using (member_id = auth.uid() or public.es_admin());

-- Catálogos que todo membro pode ler.
drop policy if exists pipelines_select on pipelines;
create policy pipelines_select on pipelines for select to authenticated using (public.es_miembro());
drop policy if exists pipeline_stages_select on pipeline_stages;
create policy pipeline_stages_select on pipeline_stages for select to authenticated using (public.es_miembro());
drop policy if exists whatsapp_templates_select on whatsapp_templates;
create policy whatsapp_templates_select on whatsapp_templates for select to authenticated using (public.es_miembro());

-- Configuração e credenciais: só admin.
drop policy if exists crm_settings_select on crm_settings;
create policy crm_settings_select on crm_settings for select to authenticated using (public.es_admin());
drop policy if exists agent_configs_select on agent_configs;
create policy agent_configs_select on agent_configs for select to authenticated using (public.es_admin());
drop policy if exists automations_select on automations;
create policy automations_select on automations for select to authenticated using (public.es_admin());
drop policy if exists tenants_select on tenants;
create policy tenants_select on tenants for select to authenticated using (public.es_admin());
drop policy if exists channel_accounts_select on channel_accounts;
create policy channel_accounts_select on channel_accounts for select to authenticated using (public.es_admin());
-- whatsapp_accounts guarda o token da Meta: ninguém o lê pela API pública.
-- webhook_events guarda payloads crus: idem. (RLS ativo, sem políticas = ninguém.)
