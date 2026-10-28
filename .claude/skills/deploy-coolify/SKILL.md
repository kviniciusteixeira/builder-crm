---
name: deploy-coolify
description: |
  Implanta uma instância nova do Builder CRM do começo ao fim: base e Auth (Supabase
  cloud ou auto-hospedados no mesmo Coolify), migrações, primeiro admin, aplicativo no
  Coolify (Dockerfile) com as variáveis, deploy, health check e dados demo. Ativar
  quando o usuário diz: implanta, deploy, sobe no Coolify, levanta a instância,
  põe em produção, cria o projeto do Supabase.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Implantar no Coolify

> Instância a implantar: $ARGUMENTS

Resultado: `https://<dominio>/api/health` responde `{ "ok": true, ... }`, dá para
iniciar sessão com a conta admin criada, e a demo está carregada.

## 0. O que faz falta (pedir junto, uma única vez)

| Credencial | Onde se obtém | Para quê |
|---|---|---|
| **Domínio** com registro A no VPS | DNS do cliente | `APP_BASE_URL` e o domínio do app |
| **Coolify** URL + API token (escopo de escrita) | Coolify -> Keys & Tokens -> API tokens | criar o app, variáveis e deploy |
| **Base e Auth**: ou um Personal Access Token do Supabase cloud, ou nada (auto-hospedam-se no mesmo Coolify) | supabase.com/dashboard/account/tokens, ou o próprio Coolify | ver o passo 1: há que escolher antes de começar |
| **OpenRouter** API key (opcional) | openrouter.ai -> Keys | o agente |
| **Zernio** (opcional, depois) | zernio.com -> Settings -> API Keys | canais |

Gere você mesmo os segredos que não vêm de um provedor:
`openssl rand -hex 32` para `AGENT_WORKER_SECRET` e `LEADS_WEBHOOK_SECRET`,
`npx web-push generate-vapid-keys` para as VAPID. A senha do admin demo:
`openssl rand -base64 12`.

Nunca cole segredos no chat de volta, no repositório nem em `.mcp.json`.

## 1. Base e Auth: dois caminhos, há que escolher antes de começar

O CRM usa o Supabase para **duas coisas separadas**: Postgres (os dados) e GoTrue (quem
inicia sessão). Não usa mais nada do Supabase. Por isso há dois caminhos válidos, e o
primeiro passo é perguntar ao membro qual quer.

### A) Supabase cloud (um projeto por cliente)

Mais rápido de levantar e com backups e painel incluídos. O plano gratuito alcança, mas
**pausa os projetos inativos**, e um CRM de um cliente que pausa é uma ligação às
9 da manhã.

Com o MCP do Supabase em **modo conta** (sem `project_ref`): `list_organizations`,
`get_cost`/`confirm_cost`, `create_project` (região perto do cliente, senha de
base gerada). Espere o projeto ficar ativo. Se o membro já tem um
projeto, use esse.

Obter: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(`get_publishable_keys` / `get_project_url`), `SUPABASE_SERVICE_ROLE_KEY` (dashboard
-> Settings -> API; o MCP não a expõe por design: pedi-la), `DATABASE_URL` (Connect
-> Transaction pooler, porta 6543) e `DIRECT_URL` (Session/direct, 5432, para
migrações).

### B) Auto-hospedado no mesmo Coolify (Postgres + GoTrue)

Tudo no VPS do membro: sem conta do Supabase, sem pausas e sem custo por cliente.
**É o caminho da instância de demonstração do IA Builder Lab.** Em troca, os
backups e as atualizações são dele.

Guia completo, com as variáveis do GoTrue e o que quebra se se pular um passo:
[`docs/SUPABASE-NO-VPS.md`](../../../docs/SUPABASE-NO-VPS.md). A ordem importa e não é
óbvia:

1. Base Postgres gerenciada no Coolify (imagem `pgvector/pgvector:pg16` se for usar
   o módulo imóveis).
2. `npm run claves:supabase` gera o segredo JWT e as chaves anônima e de serviço
   coerentes entre si. **Não vão a nenhum repositório.**
3. `npm run auth:preparar` cria nessa base o que o Supabase traz de fábrica e um
   Postgres pelado não: os papéis `anon` / `authenticated` / `service_role`, o esquema
   `auth` com o dono `supabase_auth_admin` e as funções `auth.uid()` e companhia.
   Vai **antes** de iniciar o GoTrue, que espera encontrar esse papel.
4. GoTrue como aplicativo no Coolify, com o domínio dele. Ao iniciar cria `auth.users` com
   as próprias migrações.
5. Só aí `npm run db:migrar`, porque a última migração põe um gatilho sobre
   `auth.users`.

`NEXT_PUBLIC_SUPABASE_URL` é o domínio do GoTrue **incluindo `/auth/v1`**, para que o
proxy recorte o prefixo.

## 2. Migrações e primeiro admin (da máquina do membro)

```bash
DATABASE_URL='<pooler>' DIRECT_URL='<direto>' npm run db:migrar
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... \
  npm run admin:crear -- --email admin@<cliente>.com --password '<gerada>' --nombre "Admin"
```

Alternativa: `apply_migration` do MCP com o conteúdo de cada arquivo de
`supabase/migrations/` e `modules/<activo>/migrations/`, em ordem (e registrar em
`_migraciones` para o runner não os repetir). Verifique com
`get_advisors(security)`: não deve haver tabelas sem RLS.

## 3. Coolify

Dois caminhos: o **MCP** do Coolify se estiver configurado (ver `docs/MCP.md`; o oficial
do Coolify v4 é só leitura) ou a **REST API** com `curl`
(`COOLIFY_URL`, `COOLIFY_TOKEN`; verificar rotas contra a versão instalada em
`<COOLIFY_URL>/docs/api`):

1. **Projeto e servidor**: `GET /api/v1/projects`, `GET /api/v1/servers` -> uuids.
2. **Aplicativo a partir do repositório** (o repositório do cliente, público ou com deploy key):
   `POST /api/v1/applications/public` com `project_uuid`, `server_uuid`,
   `environment_name` (production), `git_repository`, `git_branch` (main),
   `build_pack: "dockerfile"`, `ports_exposes: "3000"`, `domains: "https://<dominio>"`,
   `instant_deploy: false`.
3. **Variáveis** (`POST /api/v1/applications/<uuid>/envs/bulk`): **todas em runtime, sem
   exceção**. Desde 1.2.2 o servidor passa ao navegador a configuração pública em
   tempo de execução (`src/lib/config-publica.ts`), então nenhuma `NEXT_PUBLIC_*`
   precisa se gravar no build. Não tente marcá-las como de build: a API do
   Coolify 4.3 **rejeita o campo `is_build_time`** e só se pode fazer pela
   interface.

   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`,
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `DATABASE_URL`, `DIRECT_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `APP_BASE_URL`, `AGENT_WORKER_SECRET` (**obrigatória**: sem ela /api/health dá 503 e o agente não roda),
   `LEADS_WEBHOOK_SECRET`, `OPENROUTER_API_KEY`, `AGENT_MODEL` (opcional),
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, e as do Zernio/S3 se já existirem. Lista
   completa e explicada em `.env.example`.
4. **Deploy**: `POST /api/v1/deploy?uuid=<uuid>`; siga `GET /api/v1/deployments/<id>`
   até `finished`. As migrações rodam sozinhas ao iniciar (entrypoint).
5. **Health**: `curl https://<dominio>/api/health` -> `ok: true` com `version`. Se
   responder 503 `env_invalida`, o corpo lista qual variável falta.

## 4. Dados demo e fechamento

```bash
AGENT_WORKER_SECRET='<o mesmo do Coolify>' node scripts/seed-demo.mjs --url https://<dominio>
```

Depois invoque `probar-instancia`. Reporte: URL, credenciais demo (uma única vez),
projeto Supabase (ref), app do Coolify (uuid), e o que ficou pendente (Zernio, logo
real, domínio de e-mail).

## Diagnóstico rápido

- **O domínio responde duas versões distintas.** O Coolify deixa o contêiner velho
  servindo depois de marcar o deploy como concluído: `/api/health` alterna entre
  a versão nova e a anterior. Reinicie o aplicativo e confira de novo antes de
  buscar a causa no código.

- O build NÃO precisa de variáveis: se falhar pedindo `DATABASE_URL` ou uma
  `NEXT_PUBLIC_*`, o culpado é código novo que consulta a base ou lê o ambiente ao
  se importar (vai dentro da função). No Coolify todas as variáveis vão em runtime.
- Health 503 `db_unavailable`: `DATABASE_URL` incorreta ou o projeto Supabase
  pausado. 503 `config_invalida`: `config/cliente.ts` não passa na validação (o
  detalhe está no corpo).
- Migrações não rodam: o contêiner inicia com `SKIP_MIGRATIONS=true`, ou
  `DIRECT_URL` aponta para o pooler de transações (usar o direto).
- `/login` redireciona em loop: `NEXT_PUBLIC_SUPABASE_URL` não aponta para o projeto desta
  instância, ou `APP_BASE_URL` não é o domínio público.
