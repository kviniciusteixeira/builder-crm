# Conectar o Claude Code à infraestrutura (MCP e credenciais)

Para o Claude operar Supabase e Coolify a partir do chat (fluxo one-shot) é preciso
`.mcp.json` na raiz, que **está ignorado pelo git**. Parte-se de
`.mcp.json.example`:

```bash
cp .mcp.json.example .mcp.json
```

Os valores `${VAR}` se resolvem a partir do ambiente do terminal onde roda o Claude
Code: exporte as variáveis antes de abri-lo. Nunca cole tokens em claro no
arquivo de exemplo nem no repositório.

| Serviço | Credencial | Onde se obtém | Para que o Claude usa |
|---|---|---|---|
| **Supabase** | Login OAuth (o MCP remoto pede ao abrir) | supabase.com (a conta do membro) | Criar o projeto do cliente, aplicar migrações, ler URL e anon key, revisar `get_advisors` |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` do projeto | Dashboard -> Project Settings -> API | `npm run admin:crear` e variáveis da instância (o MCP não a expõe) |
| Supabase | `DATABASE_URL` (pooler 6543) e `DIRECT_URL` (5432) | Dashboard -> Connect | `npm run db:migrar`, variáveis da instância |
| **Coolify** | URL do painel + API token (escopo de escrita ou deploy) | Coolify -> Keys & Tokens -> API tokens | Criar o app, variáveis e deploy (MCP comunitário ou `curl` em `/api/v1`) |
| **OpenRouter** | `OPENROUTER_API_KEY` | openrouter.ai -> Keys | O agente de IA (variável da instância) |
| **Zernio** | `ZERNIO_API_KEY` (+ `ZERNIO_PROFILE_ID`) | zernio.com -> Settings -> API Keys | `npm run zernio:*`, variáveis da instância |
| **GitHub** | Acesso ao repositório do cliente (público, ou deploy key no Coolify) | github.com | O Coolify constrói a partir do repositório |

## Modo conta vs modo projeto no Supabase

- `https://mcp.supabase.com/mcp` (sem `project_ref`): ferramentas de **conta**
  (`list_organizations`, `create_project`, `get_cost`, `confirm_cost`) + banco de dados.
  É o que `deploy-coolify` precisa para criar o projeto do cliente.
- `...?project_ref=<ref>`: só esse projeto; as de conta somem. Útil para
  trabalhar sobre uma instância já criada. Adicionar `&read_only=true` para inspeção
  segura.

## Coolify sem MCP

`deploy-coolify` funciona com a REST API e `curl`; só fazem falta
`COOLIFY_URL` e `COOLIFY_TOKEN` no ambiente. A referência de endpoints está em
`<COOLIFY_URL>/docs/api` da instalação (varia por versão).

## O que não faz falta

Vercel, Firebase, um VPS à parte para o agente, nem n8n/Make: o agente roda dentro
do app (webhook -> `after()` -> worker) e as varreduras dentro do processo no Coolify.
