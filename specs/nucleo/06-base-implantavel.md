# Spec: Base implantável (requisito 6 do brief)

**Trilho**: completo (mexe no modelo de dados, em contratos e no núcleo)
**Estado**: aprovada (plano da Fase 0, 2026-10-01)
**Data**: 2026-10-01
**Escrita antes do código**: sim

## Problema

Hoje uma instância nova não se levanta a partir do repositório: as tabelas base só
existem numa pasta gitignored (`drizzle/`), as 8 migrações de
`supabase/migrations/` alteram tabelas que nenhuma cria, cada uma tem o seu script de
aplicação à mão, nenhuma tabela tem RLS (a API pública do Supabase expõe tudo com
a anon key), não há health check, o Dockerfile é da era SQLite e ~20 rotas de API
aceitam qualquer usuário de Auth mesmo que não seja membro da equipe.

## Decisões do dono

- D1 A base continua sendo Supabase, um projeto por cliente. O Coolify roda só o app.
- D2 Até a versão 1.0.0 a migração base se regenera a partir do schema quando muda;
  a partir da 1.0.0 só se adicionam migrações novas.
- D3 A Vercel continua suportada como alternativa; no Coolify as varreduras rodam dentro do
  processo.

## Cenários

1. **Instalar** — Com um projeto Supabase vazio e `DATABASE_URL`, `npm run db:migrar`
   deixa a base pronta (tabelas, índices, funções, sementes, RLS) e é idempotente.
2. **Iniciar** — O contêiner roda as migrações pendentes e só depois
   sobe o servidor; se a base não responder, tenta de novo antes de desistir.
3. **Verificar** — `GET /api/health` responde `{ok:true, version, commit, db:"ok"}`
   sem sessão; com a base caída responde 503.
4. **Primeiro acesso** — Se não houver ninguém em `team_members`, a tela de cadastro está
   aberta e a primeira conta fica como `admin`; depois o cadastro se fecha sozinho
   (salvo `ALLOW_PUBLIC_SIGNUP=true`). Alternativa sem UI:
   `npm run admin:crear -- --email ... --password ...`.
5. **Proteger** — Um usuário de Auth que não está em `team_members` recebe 403 em toda
   rota de dados; um assessor não pode ler nem editar uma operação, atividade ou
   conversa de um contato alheio (404).
6. **Não expor nada** — Com a anon key, `GET /rest/v1/contacts` devolve vazio ou 401:
   RLS ativo em todas as tabelas e privilégios de `anon` revogados.

## Requisitos

- FR-001 `supabase/migrations/` DEVE poder ser aplicado em ordem sobre uma base vazia e
  produzir o schema que `src/db/schema.ts` descreve.
- FR-002 `scripts/migrar.mjs` DEVE registrar o aplicado em `public._migraciones`,
  aplicar cada arquivo numa transação, aceitar `--dry-run` e `--status`, e
  tentar a conexão de novo (15 tentativas, 2 s) para a inicialização do contêiner.
- FR-003 Toda tabela de `public` DEVE ter RLS habilitado; o runner verifica no
  final de cada corrida e habilita se faltar (cobre tabelas de módulos).
- FR-004 `anon` NÃO DEVE ter privilégios sobre tabelas, sequências nem funções de
  `public`. `authenticated` DEVE poder ler só o que o papel permite (admin tudo;
  assessor os seus contatos e o que pende deles; cada membro as suas notificações);
  sem políticas de escrita (o app escreve por Drizzle como `postgres`).
- FR-005 Um trigger sobre `auth.users` DEVE criar a linha de `team_members`; a
  primeira como `admin`, as seguintes como `asesor`. O cadastro a partir de Ajustes -> Equipo
  DEVE continuar funcionando (upsert, não insert).
- FR-006 DEVE existir `src/lib/env.ts` com validação zod lazy; `/api/health` DEVE
  reportar variáveis obrigatórias faltantes sem expor valores.
- FR-007 `next.config.ts` DEVE usar `output: "standalone"` (salvo no Windows) e
  expor versão (`package.json`) e commit (`SOURCE_COMMIT`) ao cliente.
- FR-008 `Dockerfile` multi-stage com usuário sem privilégios, `HEALTHCHECK` sobre
  `/api/health`, e `ENTRYPOINT` que migra e inicia. `docker-compose.yml` só com o
  app (a base é Supabase).
- FR-009 Toda rota de `/api` salvo health, webhooks e workers com segredo DEVE passar por
  `requireMember`/`requireAdmin`; as rotas por id DEVEM verificar acesso ao contato.
- FR-010 No Coolify (sem `VERCEL`), `instrumentation.ts` DEVE rodar as varreduras a cada
  30 min contra os endpoints existentes com `AGENT_WORKER_SECRET`.

## Configuração e módulos

Nenhum ainda (Fases 3 e 4). O runner deixa previsto `modules/*/migrations/`.

## Modelo de dados

- `20261001000000_base.sql`: extensões, 21 tabelas, FKs, índices, `match_properties`,
  tenant `default`, `agent_configs` por canal, automação semente.
- `20261001000100_rls.sql`: funções `es_admin()`, `es_miembro()`,
  `contacto_visible(id)`; RLS em tudo; revoke anon; políticas de leitura.
- `20261001000200_primer_admin.sql`: trigger `on_auth_user_created`.
- Eliminam-se as 8 migrações velhas e os 5 scripts `apply-*`.

## Agente de IA

Sem mudanças.

## Critérios de aceitação

- CA-001 `npm run db:migrar` sobre um projeto Supabase vazio termina sem erro e uma
  segunda corrida não aplica nada.
- CA-002 `get_advisors(security)` do Supabase não reporta tabelas sem RLS.
- CA-003 `curl $URL/api/health` → 200 com `ok:true`; sem `DATABASE_URL` válida → 503.
- CA-004 `docker build` termina e o contêiner passa no `HEALTHCHECK`.
- CA-005 Com a anon key, `GET /rest/v1/contacts` não devolve linhas.
- CA-006 Um usuário de Auth sem linha em `team_members` recebe 403 em `/api/contacts`.
- CA-007 `npm run typecheck && npm run lint && npm run build` em verde.

## Constitution Check

- I. Núcleo intocável: é o núcleo; não toca em nada de cliente.
- II. Spec antes do código: esta spec.
- III. Autoverificação: CA-001..007, e `probar-instancia` usa `/api/health`.
- IV. Zero segredos: `.env.example` sem valores; `SOURCE_COMMIT` não é segredo.

## Fora de escopo

- Políticas de escrita por RLS: o app não usa PostgREST para escrever.
- Cifrar `whatsapp_accounts.access_token` em repouso (fica anotado em SEGURANCA.md).
- Publicar imagem no GHCR (opcional, Fase 10).
