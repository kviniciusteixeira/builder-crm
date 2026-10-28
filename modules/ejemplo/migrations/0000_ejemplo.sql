-- Módulo exemplo: tarefas pessoais por membro. Idempotente.
-- As tabelas de um módulo levam o nome do módulo como prefixo para não colidir
-- com o núcleo nem com outros módulos.

create table if not exists ejemplo_tareas (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  hecha      boolean not null default false,
  member_id  uuid references team_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ejemplo_tareas_member_idx on ejemplo_tareas (member_id, hecha, created_at desc);

-- RLS obrigatório (constituição IV). O app escreve pelo Drizzle (bypass); isto
-- protege a API pública do Supabase: cada membro lê só o que é seu.
alter table ejemplo_tareas enable row level security;
drop policy if exists ejemplo_tareas_select on ejemplo_tareas;
create policy ejemplo_tareas_select on ejemplo_tareas for select to authenticated
  using (member_id = auth.uid() or public.es_admin());
