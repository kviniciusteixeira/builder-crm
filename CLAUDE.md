# Builder CRM — guia para o Claude Code

O Builder CRM é o CRM que os membros do **IA Builder Lab** entregam aos seus clientes:
uma caixa de entrada única de **WhatsApp, Instagram e Messenger** com um **agente de IA** que
qualifica leads, move o pipeline e deixa a ficha em dia. Cada membro clona este repositório,
implanta **uma instância por cliente** (Coolify + Supabase) e a adapta com Claude
Code sem tocar no núcleo. Este arquivo é o primeiro que você lê em cada sessão.

**Princípio reitor: agent first.** O núcleo é mínimo e genérico; tudo do cliente
vai em configuração ou em módulos, e quem faz isso é o Claude guiado pelas skills de
`.claude/skills/`. A constituição manda: [`specs/CONSTITUICAO.md`](specs/CONSTITUICAO.md).

## Stack e arquitetura

Next.js 16 (App Router) + React 19 + TypeScript strict · Tailwind 4 + shadcn/ui ·
Drizzle ORM sobre **Supabase Postgres** (RLS em todas as tabelas) · **Supabase Auth**
(e-mail + senha; papéis `admin` / `asesor` em `team_members`) · mensagens por
**Zernio** (um webhook para os três canais) · agente por **OpenRouter** (modelo por
`AGENT_MODEL`) · Web Push + PWA · Docker multi-stage para **Coolify** (migrações ao
iniciar, `/api/health`).

```
Cliente (WhatsApp/IG/Messenger) -> Zernio -> POST /api/webhooks/zernio
   -> src/lib/channels/webhook.ts (assinatura, idempotência em webhook_events, after())
   -> conector.webhook.procesar -> ingest.ts (contato, conversa, mensagem, job)
   -> worker /api/agent/process -> src/lib/agent (prompt + CONTEXTO + tools)
   -> deliverMessage -> conector.enviar (Zernio | Meta | simulador)
```

| Pasta | O que é |
|---|---|
| `src/app/` | Páginas e rotas de API do núcleo. `/m/[modulo]` e `/api/m/[modulo]` despacham para os módulos. |
| `src/lib/config/` | Leitura e validação de `config/cliente.ts`; marca -> CSS vars; campos personalizados. |
| `src/lib/channels/` | `conector.ts` (interface), `conectores/` (zernio, meta-cloud parcial, simulador), `webhook.ts`, `deliver.ts`, `ingest.ts`. |
| `src/lib/agent/` | Loop, prompt genérico, registro de tools (núcleo + módulos), config por canal. |
| `src/lib/modules/` | Tipos do contrato de módulo, registro gerado, resolução de rotas. |
| `src/lib/reportes.ts`, `seed-demo.ts`, `simulador.ts` | Relatórios reais, dados demo, simulador. |
| `supabase/migrations/` | Migrações do núcleo (base, RLS, primeiro admin). Aplica `scripts/migrar.mjs`, e `scripts/local.mjs` as mesmas sobre a base embutida. |
| `scripts/` | migrar, criar-admin, seed-demo, verificar-instancia, zernio:*, generar-registro-modulos, pwa-icons. |

## Zonas: o que se toca e o que não

| Zona | Pastas | Regra |
|---|---|---|
| **NÚCLEO (não se toca para um cliente)** | `src/`, `supabase/`, `scripts/`, `docker/`, `Dockerfile`, `docker-compose.yml`, `next.config.ts`, `package.json` | Só muda com uma versão nova do repositório original. Se uma adaptação precisar tocá-lo, é uma melhoria genérica: propõe-se ao repositório original, não se corrige na instância. |
| **ZONA DO CLIENTE** | `config/cliente.ts`, `config/modulos.json`, `config/plantillas/`, `modules/<nombre>/`, `public/marca/`, `public/icons/`, `specs/<cliente>/`, `.env.local` (nunca no repositório) | Aqui vai TUDO o específico: marca, pipeline, campos, prompt, módulos, assets, specs. |
| **Compartilhado** | `specs/CONSTITUICAO.md`, `specs/_modelo.md`, `specs/nucleo/`, `.claude/`, `docs/` | Documentação e arnês. Atualizam-se com o núcleo. |

Critério de aceitação: mudar nome, logo, cores, pipeline e campos de um cliente
**sem editar nenhum arquivo do núcleo**. `git status` depois de uma adaptação só
mostra a zona do cliente.

## Fluxo one-shot (de um prompt a uma instância funcionando)

Prompt típico: *"Adapta o Builder CRM para uma imobiliária chamada Casa Sur, com módulo
de imóveis e agendamento de visitas, e implanta no meu Coolify."*

| Passo | O que acontece | Skill |
|---|---|---|
| 1. Entender | Ler o brief ([`specs/_brief.md`](specs/_brief.md) é o que perguntar ao cliente); no máximo 3 perguntas se faltar algo crítico (domínio, credenciais, nicho). | `adaptar-a-cliente` |
| 2. Especificar | `specs/<cliente>/spec.md` a partir de `specs/_modelo.md`. | `adaptar-a-cliente` |
| 3. Configurar | `config/cliente.ts` (a partir de um modelo de `config/plantillas/` ou do zero), `config/modulos.json`, `public/marca/`, `npm run pwa:icons`. | `adaptar-a-cliente` |
| 4. Construir | Módulos novos em `modules/` que a spec exija. | `crear-modulo` |
| 5. Implantar | Projeto Supabase, migrações, primeiro admin, app no Coolify, variáveis, deploy. | `deploy-coolify` |
| 6. Conectar | WhatsApp / Instagram / Messenger via Zernio (pode ser depois da demo). | `conectar-zernio` |
| 7. Testar | `scripts/verificar-instancia.mjs`: health, login, marca, pipeline, simulador -> agente -> etapa, módulos. Corrigir até verde. | `probar-instancia` |
| 8. Entregar | URL, credenciais da conta demo, resumo do que se construiu e do pendente. | `adaptar-a-cliente` |

Outras skills: `nueva-plantilla-nicho` (converter uma adaptação bem-sucedida em modelo
reutilizável), `actualizar-desde-original` (trazer uma versão nova do núcleo a uma
instância adaptada). As skills `supabase`, `playwright-cli` e `memory-manager` são de
apoio.

**Definição de pronto**: `npm test && npm run typecheck && npm run lint && npm run build`
é o piso, e o mesmo roda o CI. Uma instância está terminada quando
`probar-instancia` passa em verde contra a URL implantada. A prova não se delega ao
membro nem ao cliente.

Os testes de `tests/` cobrem os invariantes que **falham em silêncio**: a assinatura do
webhook, a janela de 24 h, o filtro por papel, a validação de `config/cliente.ts`, o
bloco de configuração pública e os templates de e-mail. Rodam sem base e sem rede em
um segundo. O que precisa de base ou navegador se testa com `verificar-instancia`.

## Convenções

- **Idioma**: a documentação Markdown e os comentários do código estão em português
  brasileiro. A interface continua em espanhol (consistência com o código existente);
  nomes de arquivos e símbolos novos em espanhol (`conector.ts`, `moverEtapa`); os
  herdados em inglês ficam como estão.
- **Componentes** de ~300 linhas no máximo; ícones de `lucide-react` (os de canal são
  SVG inline em `src/components/icons/channels.tsx`); forms com `react-hook-form` +
  `zod`; drag & drop com `@dnd-kit`; valores em **centavos** e `formatCurrency()` (moeda
  da config); datas com `date-fns`.
- **Rotas de API**: `requireMember()` / `requireAdmin()` de `src/lib/api-auth.ts` no
  início; acesso por contato com `canAccessContactId`; o alheio responde **404**, não 403.
- **Versão**: sobe-se com `npm version <nova> --no-git-tag-version`, que atualiza
  `package.json` e `package-lock.json` ao mesmo tempo. À mão se desalinham.
- **Commits**: um por mudança lógica, em espanhol, primeira linha imperativa e
  concreta ("Agregar modulo pedidos", "Corregir ventana de 24h en Messenger"); sem
  backticks na mensagem. Nunca `.env*`, `.mcp.json` nem dados reais.
- **Specs antes do código**: toda funcionalidade nova nasce em `specs/` (trilho
  completo se mexe em dados ou contratos; leve se é config, módulo ou UI).

## O que NÃO é óbvio (ler antes de tocar)

- **`deliverMessage` é o único caminho de saída.** O agente, o chat e os
  templates passam por ali; o conector se escolhe por `conversations.provider`.
- **A conversa não é o contato.** Uma pessoa pode ter fio de WhatsApp e de
  Instagram; a rota é `/conversations/[conversationId]`.
- **Idempotência de mensagens**: índice único parcial sobre `messages.external_id`
  (de propósito NÃO composto com provider). Os webhooks reivindicam o evento em
  `webhook_events` antes de responder 2xx; a varredura (`GET` com
  `AGENT_WORKER_SECRET`) reprocessa o que ficou pendente.
- **O Zernio exige 2xx em 5 s**: a rota do webhook importa o mínimo e processa em
  `after()`; o pesado entra por `import()` dinâmico. 10 falhas seguidas e o Zernio desliga
  a assinatura (`npm run zernio:webhook` a reativa).
- **`ZERNIO_WEBHOOK_SECRET` tem que ser idêntico** na instância e na assinatura
  do Zernio; se não, 401 silencioso e "não entram mensagens".
- **Um agente por canal** (`agent_configs`): Instagram e Messenger começam desligados.
  Cascata do prompt: canal -> global (Ajustes) -> `config.agente.prompt` -> default.
  O agente acrescenta CONTEXTO (contato, etapa, pipeline, dados a descobrir) e EQUIPE.
- **A janela de 24 h o servidor decide** (`conversations.last_inbound_at`):
  IG/Messenger fora da janela vão com `HUMAN_AGENT`; WhatsApp só com template.
- **Pausa do agente**: por conversa (`PATCH /api/conversations/:id/agente`);
  o contato tem além disso um kill-switch global. `derivar_asesor` pausa só o fio.
- **O processo roda em UTC; o fuso horário sai da configuração.** O contêiner não
  define `TZ` de propósito: uma imagem compartilhada por muitas instâncias não pode trazer o
  fuso gravado nela. Por isso `config.zonaHoraria` (IANA, default `UTC`) é a que manda, e
  tudo o que resolva um dia ou uma hora tem que passá-la ao `Intl`: o prompt do
  agente (`{{fecha}}`) e `formatDate` / `formatRelativeDate` já fazem isso. Se se omitir, o
  sintoma não é um erro e sim um agente que nomeia o dia errado de noite, e na
  máquina de um membro chileno não se reproduz. Os testes rodam também com `TZ=UTC`
  por isso. Ver `specs/nucleo/11-fuso-horario.md`.
- **Nunca passar um `Date` dentro de `db.execute(sql\`...\`)`.** Esse caminho chega ao
  driver por `unsafe()`, que não serializa datas, e a consulta morre com
  `ERR_INVALID_ARG_TYPE` antes de sair. Em SQL cru as datas vão como texto ISO com
  cast (`${fecha.toISOString()}::timestamptz`); com o construtor do Drizzle se passa o
  `Date` tal qual, porque aí sim se conhece o tipo da coluna.
- **O cliente de base é preguiçoso.** `src/db/index.ts` exporta um proxy que monta a
  conexão no primeiro uso. `next build` importa cada route handler, e o build NÃO
  deve pedir `DATABASE_URL`: no Dockerfile só as `NEXT_PUBLIC_*` são build args,
  porque a base de cada instância se conhece ao implantar. Se um módulo consulta a
  base ao se importar, o build quebra de novo: as consultas vão dentro da
  função. O CI roda `build` sem `DATABASE_URL` justamente para detectar isso.
- **RLS protege a API pública do Supabase, não o Drizzle**: o app entra como
  `postgres` (bypass). `anon` não tem privilégios; `authenticated` só leitura
  conforme `team_members`. Toda tabela nova (também de módulos) com RLS; o runner
  força se faltar.
- **Migrações**: `supabase/migrations/` + `modules/<activo>/migrations/`, em ordem,
  registradas em `_migraciones`. Até 1.0.0 `0000_base.sql` se regenera a partir do
  schema; a partir de 1.0.0 só se adicionam arquivos. Rodam sozinhas ao iniciar o contêiner.
- **Registro de módulos gerado**: `config/modulos.json` ->
  `src/lib/modules/*.generated.ts` (escrevem `next.config.ts` e `npm run
  typecheck`). Um módulo inativo não entra no bundle; as rotas dão 404. Esses dois
  arquivos **não se versionam**: se se versionassem, ativar um módulo deixaria mudanças
  dentro de `src/` e chocariam em cada atualização do núcleo.
- **Primeira conta**: o gatilho `on_auth_user_created` cadastra em
  `team_members` SÓ a primeira conta da instância, como admin. A partir daí
  ninguém entra sozinho: um usuário de Auth sem linha em `team_members` cai em `/sin-acceso`.
  Isso não é cosmético, é a única porta: o endpoint `/auth/v1/signup` do provedor
  é público e a página `/signup` do CRM não pode impedir que o chamem à mão. Os
  cadastros reais vão por Ajustes -> Equipo, que insere a linha com o papel, ou por
  `npm run admin:crear`.
- **Os e-mails de acesso os manda o provedor, não o CRM.** Convites e "esqueci a
  senha" saem do GoTrue com o SMTP dele; o CRM só declara a capacidade com
  `AUTH_ENVIA_CORREOS=true` e oferece os botões. É um interruptor manual porque o GoTrue
  sem SMTP não falha: engole o e-mail e responde 200, e a UI diria "enviado" sobre
  nada. Os três caminhos aterrissam em `/auth/definir-clave`, que lê a sessão do
  fragmento da URL (por isso roda no navegador) e limpa a barra. Os templates
  o próprio CRM serve em `/correo/*.html`, públicos porque o GoTrue os baixa.
  Ver `docs/CORREIO.md`.
- **O que o navegador precisa se serve em EXECUÇÃO, não no build.** O Next grava
  as `NEXT_PUBLIC_*` ao compilar, e numa imagem compartilhada por muitas instâncias isso
  não serve: o layout escreve a URL do Supabase, a chave anônima e as capacidades num
  bloco JSON (`src/lib/config-publica.ts`) e o navegador lê dali. Nenhum
  componente cliente lê `process.env` direto, e o que faltar (a chave VAPID) sai de
  uma rota de API. Consequência prática: no Coolify TODAS as variáveis vão em runtime e
  não há que marcar nenhuma como build. O `Dockerfile` continua aceitando-as como build
  args para plataformas que as gravam na imagem. Nada de segredos no código nem em `.mcp.json`
  (só `.mcp.json.example`).
- **As rotas internas falham FECHADAS e `AGENT_WORKER_SECRET` é obrigatória.**
  `/api/agent/process`, as duas varreduras e o seed demo são públicos no middleware
  (chama-os um cron ou o próprio servidor, sem sessão), então esse segredo é o único
  que os separa da internet. Até 1.6.1 a checagem era `if (secret) {...}` e uma
  instância sem a variável os deixava abertos sem nenhum sintoma. Guardião único em
  `src/lib/secreto-worker.ts`, em tempo constante. Nunca voltar ao padrão velho: no
  modo local a variável não faz falta (não há cron nem internet) e por isso está em
  `NO_HACEN_FALTA_EN_LOCAL`.
- **TLS e cookies não se herdam da plataforma.** `postgres-js` deixa `ssl` em false se
  a URL não traz `sslmode` e a do Supabase não traz: vai `ssl: "require"` em
  `src/db/index.ts` (`DATABASE_SSL=off` para uma base sem certificado). `@supabase/ssr`
  não põe `secure` nos cookies: vai em `src/lib/supabase/cookies.ts`, compartilhado por
  middleware e servidor. Os cabeçalhos (HSTS e companhia) em `next.config.ts`, só em
  produção.
- **A árvore de produção se mantém limpa.** `npm audit --omit=dev` em 0 faz parte de
  entregar. As ferramentas de linha de comando (shadcn) vão em `devDependencies`: em
  `dependencies` arrastam a própria árvore para a imagem do cliente.
- **O modo local desliga a autenticação inteira.** `npm run local` sobe um Postgres
  embutido (`.local/db`) e entra sem sessão: quem abre a URL é admin. Por isso tem
  dois cadeados e o segundo é o que importa: `MODO_LOCAL=true` (só esse
  script põe) **e** `NODE_ENV` diferente de `production`, que não depende de configuração e
  torna impossível ligá-lo numa imagem implantada. Se se ligasse por erro não
  falharia nada: o único sintoma seria que qualquer um entra. Ver `src/lib/modo-local.ts`
  e `specs/nucleo/10-modo-local.md`.
- **`db.execute` devolve coisas diferentes conforme o driver**: o array de linhas com
  `postgres`, `{ rows }` com o embutido. O proxy de `src/db/index.ts` normaliza no
  modo local porque meia dúzia de lugares fazem `resultado[0]`; sem isso os relatórios
  saem em zero sem um único erro.
- **Dados demo** por `POST /api/seed/demo` (admin ou `AGENT_WORKER_SECRET`): usam o
  conector `simulador` para que a demo responda; os relatórios só excluem os
  contatos criados a partir de `/simulador`.
- **Na Vercel** as varreduras vão por `vercel.json` + `.github/workflows/sweepers.yml`
  (Hobby não permite crons frequentes); no Coolify rodam dentro do processo
  (`src/lib/barridos.ts`).

## Comandos

```bash
npm run local               # testar sem contas: Postgres embutido + demo, sem login
npm run dev                 # contra o seu Supabase (http://localhost:3000)
npm test                    # invariantes do núcleo (vitest, sem base nem rede)
npm run typecheck && npm run lint && npm run build
npm run db:migrar           # aplica migrações pendentes (núcleo + módulos ativos)
npm run db:status           # o que está aplicado e o que falta
npm run admin:crear -- --email a@b.com --password 'xxxxxxxx'
npm run seed                # dados de demonstração (via POST /api/seed/demo)
node scripts/verificar-instancia.mjs --url https://crm.cliente.com --email ... --password ...
npm run zernio:setup -- --sync | npm run zernio:webhook -- --url https://... | npm run zernio:whatsapp
npm run pwa:icons           # ícones a partir de public/marca/icono.png
```

Variáveis: ver `.env.example` (cada uma explicada). MCP: `.mcp.json.example` e
[`docs/MCP.md`](docs/MCP.md). Memória do projeto: `.claude/memory/` (skill
`memory-manager`).
