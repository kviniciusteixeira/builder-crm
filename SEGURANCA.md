# Segurança: segredos, papéis e RLS

O mínimo que há que entender antes de implantar uma instância para um cliente.

## Segredos

- **Todo segredo vai em variáveis de ambiente**: `.env.local` em desenvolvimento (ignorado
  pelo git) e as variáveis da plataforma no Coolify. O repositório só versiona
  `.env.example` e `.mcp.json.example`, sem valores.
- **`NEXT_PUBLIC_*` é público por design**: viaja ao navegador. Só podem ir aí a
  URL e a anon key do Supabase, a URL do app e a chave pública VAPID. Nunca a
  service role, OpenRouter, Zernio nem S3.
- **`.mcp.json` está no `.gitignore`**: contém tokens de Coolify/Supabase. Use
  `${VAR}` e exporte as variáveis no terminal.
- **Dados de clientes**: nenhum em seeds, specs, capturas nem commits. O seed de
  demonstração usa nomes e telefones inventados.
- Antes de publicar um repositório: varrer o histórico com
  [gitleaks](https://github.com/gitleaks/gitleaks) (`gitleaks git --redact .`) e
  revisar `git grep -n "sk-\|pit-\|EAA"`.
- `whatsapp_accounts.access_token` (conector Meta direto) se guarda em texto puro
  na base, protegido por RLS (ninguém o lê pela API pública) e pelo acesso à
  base. Pendente: cifragem em repouso se o conector Cloud API for completado.

## Papéis

| Papel | O que vê | O que faz |
|---|---|---|
| **admin** | tudo | gerencia equipe, canais, agente, automações, simulador, apaga fios |
| **asesor** (rótulo configurável) | só os seus contatos e o que pende deles (conversas, operações, atividades, visitas, documentos) | opera a carteira |

- O Supabase Auth diz **quem** entrou; `team_members` diz **o que é** e se continua
  ativo. Um usuário de Auth que não está em `team_members` não entra (`/sin-acceso`).
- A **primeira conta** de uma instância fica como admin (trigger em `auth.users`).
  Dali em diante o trigger NÃO cadastra ninguém: um usuário de Auth sem linha em
  `team_members` cai em `/sin-acceso`. É importante que seja assim, porque o endpoint de
  cadastro do provedor é público e a página `/signup` do CRM, que se fecha sozinha
  (`ALLOW_PUBLIC_SIGNUP=true` a reabre, só para testes), não pode evitar que o
  chamem diretamente. As demais contas o admin cria em Ajustes -> Equipo ou com
  `npm run admin:crear`. Como segunda barreira, uma vez criado o admin convém fechar
  o cadastro no provedor: `GOTRUE_DISABLE_SIGNUP=true` auto-hospedado, ou o
  interruptor de cadastros no Supabase cloud.
- Toda rota de dados passa por `requireMember()` / `requireAdmin()`
  (`src/lib/api-auth.ts`) e filtra com `ownerFilter(member)`; o que se consulta por
  id verifica `canAccessContactId`. **O alheio responde 404**, não 403: não se confirma
  que exista.
- Rotas com autenticação própria: webhooks (assinatura HMAC do provedor), worker do
  agente, varreduras, simulador e seed (admin com sessão ou `AGENT_WORKER_SECRET`
  como Bearer). Sem `AGENT_WORKER_SECRET` o worker fica aberto: defini-lo sempre.

## Entrar com um provedor externo

Google e companhia são **opcionais** e não mudam quem entra. O provedor só diz
quem é a pessoa; o acesso o decide `team_members`. Alguém que entre com o Google
sem estar cadastrado em Ajustes -> Equipo termina em `/sin-acceso`, exatamente igual
a se se registrasse com e-mail. Configuração e falhas típicas em
[docs/GOOGLE-AUTH.md](docs/GOOGLE-AUTH.md).

## RLS (Row Level Security)

- O Supabase expõe as tabelas de `public` pela API REST com a anon key (que está
  no navegador). Por isso **toda tabela tem RLS ativado** e `anon` não tem
  privilégios (`20261001000100_rls.sql`): com a anon key não se lê nem se escreve
  nada.
- `authenticated` tem **só políticas de leitura** conforme `team_members`: admin
  tudo; assessor os seus contatos e o que pende deles; cada membro as suas
  notificações e assinaturas push; catálogos (pipeline, templates, imóveis)
  para qualquer membro; configuração e credenciais só admin; `webhook_events` e
  `whatsapp_accounts` ninguém.
- **O app não depende de RLS para escrever**: entra com `DATABASE_URL` como `postgres`
  (dona das tabelas, com bypass) e aplica a autorização no servidor. RLS é a
  rede de segurança da API pública, não a lógica de negócio.
- **Módulos**: cada migração de módulo habilita RLS e define uma política de leitura
  (`public.contacto_visible(contact_id)` se pende de um contato, `public.es_miembro()`
  para catálogos, `public.es_admin()` para o sensível). `scripts/migrar.mjs` habilita
  RLS em qualquer tabela que fique sem ele.
- Verificação: `get_advisors(security)` do MCP do Supabase não deve reportar tabelas
  sem RLS; `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/contacts" -H "apikey: $ANON"`
  deve devolver vazio ou erro.

## Webhooks e entradas públicas

| Entrada | Proteção |
|---|---|
| `/api/webhooks/zernio` | HMAC SHA-256 do corpo com `ZERNIO_WEBHOOK_SECRET` (fail-closed: sem segredo se rejeita tudo); idempotência por id de evento |
| `/api/webhooks/whatsapp` (Meta direto) | `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET`; verify token do hub |
| `/api/webhooks/leads` | header `x-webhook-secret` = `LEADS_WEBHOOK_SECRET` |
| `/api/agent/process`, varreduras, seed demo | `AGENT_WORKER_SECRET` (fail-closed desde 2.0.0: **sem a variável se rejeita tudo**), comparado em tempo constante |
| `/api/health` | público, sem dados sensíveis (só nomes de variáveis faltantes) |

## Transporte e cookies

- **A base vai com TLS.** `ssl: "require"` no driver (`src/db/index.ts`). Não basta
  que a URL do Supabase pareça segura: `postgres-js` deixa `ssl` em false se a URL
  não traz `sslmode`, e a que o painel dá não traz. `DATABASE_SSL=off` só para uma
  base sem certificado na mesma máquina ou na rede interna do Docker.
- **O cookie de sessão vai `secure`, `httpOnly` e `sameSite: lax`** em produção
  (`src/lib/supabase/cookies.ts`), compartilhado pelo middleware e pelo cliente de servidor.
  `@supabase/ssr` não põe `secure` por conta própria.
- **Cabeçalhos em produção**: HSTS (um ano, com subdomínios), `X-Content-Type-Options`,
  `Referrer-Policy` e `X-Frame-Options`, em `next.config.ts`. HSTS importa sobretudo
  fora da Vercel: fecha a janela da primeira visita em claro.

## Dependências

`npm audit --omit=dev` tem que dar **0 vulnerabilidades** antes de entregar. A árvore
de produção se mantém pequena de propósito: ferramentas de linha de comando como
`shadcn` vão em `devDependencies`, porque senão arrastam a própria árvore para a imagem.

## Varrer o repositório antes de publicá-lo

Se você for tornar público o seu fork, passe o gitleaks no **histórico completo**, não na working
tree: o que vazou num commit velho continua lá mesmo que o arquivo já não exista.

```bash
gitleaks detect --source . --redact
```

No repositório original dá um único achado, e é falso: `docs/GOOGLE-AUTH.md` tem um
`curl` de exemplo com o texto `SUA_ANON_KEY` onde iria a chave, e a regra
`curl-auth-header` marca qualquer cabeçalho de autenticação. A chave anônima, além disso,
é pública por design: o que protege os dados é RLS mais a autorização do servidor.

## Checklist antes de entregar uma instância

1. `AGENT_WORKER_SECRET` (obrigatória), `LEADS_WEBHOOK_SECRET` e `ZERNIO_WEBHOOK_SECRET`
   definidos e gerados ao acaso (`openssl rand -hex 32`). Se faltar a primeira,
   `/api/health` responde 503: é o aviso, não um erro que convenha pular.
2. `ALLOW_PUBLIC_SIGNUP` sem definir ou `false`.
3. A conta admin de demo com senha gerada; pedir ao cliente que a troque.
4. `get_advisors(security)` limpo.
5. `.env.local` e `.mcp.json` fora do repositório do cliente (`git status`).
6. `npm audit --omit=dev` em 0.
7. `curl -sI https://<dominio>/ | grep -i strict-transport` devolve o cabeçalho.

## Reportar uma vulnerabilidade

Abrir uma issue privada no repositório original ou escrever ao mantenedor da
comunidade. Não publicar detalhes exploráveis em issues públicas.
