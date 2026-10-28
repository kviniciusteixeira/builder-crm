-- ============================================================================
-- Builder CRM - apagar um contato tem que levar o que depende dele
-- ============================================================================
-- Três chaves estrangeiras para contacts ficaram em NO ACTION: activities, deals e
-- messages. Com isso, DELETE /api/contacts/:id falha assim que o contato tem uma
-- atividade, e todos têm: a ingestão, o agente e as automações escrevem
-- atividades. O sintoma é um 500 ao apagar, não uma mensagem clara.
--
-- As que TÊM que sobreviver ao apagamento não se tocam: automation_runs e
-- notifications ficam com SET NULL, porque são registro do que aconteceu.
--
-- Busca-se a restrição pela definição e não pelo nome, para que funcione
-- mesmo que uma instância a tenha nomeada de outra forma.
-- ============================================================================

do $$
declare
  t text;
  nombre text;
begin
  foreach t in array array['activities', 'deals', 'messages'] loop
    select c.conname into nombre
    from pg_constraint c
    join pg_class src on src.oid = c.conrelid
    join pg_class dst on dst.oid = c.confrelid
    join pg_attribute a on a.attrelid = src.oid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and src.relname = t
      and dst.relname = 'contacts'
      and a.attname = 'contact_id'
      and c.confdeltype <> 'c'
    limit 1;

    if nombre is not null then
      execute format('alter table public.%I drop constraint %I', t, nombre);
      execute format(
        'alter table public.%I add constraint %I foreign key (contact_id) references public.contacts(id) on delete cascade',
        t,
        t || '_contact_id_contacts_id_fk'
      );
      raise notice 'cascada activada en %.contact_id (la restriccion se llamaba %)', t, nombre;
    end if;

    nombre := null;
  end loop;
end $$;
