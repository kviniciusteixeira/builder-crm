# Builder CRM

**CRM multicanal com agente de IA, feito para entregar uma instância própria a cada
cliente.** Uma caixa de entrada para WhatsApp, Instagram e Messenger, um agente que qualifica
leads e move o pipeline, e um arnês de Claude Code que adapta, implanta e testa
uma instância com um único prompt.

Código aberto, licença **MIT**: use, modifique, implante para os seus clientes e cobre
por isso. Nasceu dentro da comunidade IA Builder Lab, que é onde se ensina a usá-lo,
mas não precisa ser membro de nada para que seja seu.

> *"Adapta o Builder CRM para uma imobiliária chamada Casa Sur, com módulo de
> imóveis e agendamento de visitas, e implanta no meu Coolify."*
> O Claude escreve a spec, configura, constrói, implanta, testa e entrega a URL.

## O que o núcleo traz

- **Login com papéis** admin e assessor (Supabase Auth): um assessor vê só os seus contatos.
- **Caixa de entrada** multicanal em tempo real (Zernio: WhatsApp, Instagram DM, Messenger),
  janela de 24 h e templates de WhatsApp.
- **Contatos** com ficha, documentos (bucket S3 opcional), campos personalizados por
  cliente e resumo do agente.
- **Pipeline** kanban com etapas configuráveis que o agente pode mover.
- **Agente de IA** (OpenRouter, modelo por variável): lê o histórico, responde pelo
  canal, atualiza a ficha, move etapas, registra atividades, deixa um resumo e
  encaminha a uma pessoa (pausa por conversa).
- **Relatórios** reais por período e **dashboard** honesto.
- **Ajustes**: canais, agente por canal, equipe, notificações push.
- **Entrar com o Google** e outros provedores, opcional: ver [`docs/GOOGLE-AUTH.md`](docs/GOOGLE-AUTH.md).
- **Convites por e-mail** e "esqueci a senha", opcional: ver
  [`docs/CORREIO.md`](docs/CORREIO.md). Sem isso, o admin cria a conta e passa a
  senha temporária à mão, que é como vem de fábrica.
- **Automações** (gatilho -> filtros -> ações), **PWA** instalável.
- **Simulador**: conversar com o agente sem nenhum canal conectado (demos e
  autoverificação).
- **Módulos**: tudo o que é específico de um cliente vive em `modules/` e se liga por
  configuração. Modelo de nicho incluído: **imobiliária** (imóveis + visitas).

## Requisitos

- Node.js 22 e npm. **Nada mais para testar**: o modo local traz a própria base.
  No Windows, clone num caminho curto (`C:\projetos\...`): com pastas muito
  aninhadas, o compilador do Next falha pelo limite de caracteres do sistema de
  arquivos.
- Para uma instância de verdade: uma conta do **Supabase** (um projeto por cliente;
  o plano gratuito alcança), ou o seu próprio Postgres mais GoTrue no VPS (ver
  [`docs/SUPABASE-NO-VPS.md`](docs/SUPABASE-NO-VPS.md)).
- Para implantar: um VPS com **Coolify** e um domínio.
- Opcional: **OpenRouter** (agente), **Zernio** (canais), bucket S3 (documentos).
- **Claude Code** com o repositório aberto; ver [`CLAUDE.md`](CLAUDE.md) e
  [`docs/MCP.md`](docs/MCP.md).

## Testar no seu PC (2 minutos, sem criar nenhuma conta)

```bash
git clone https://github.com/diegovasquez-ai/builder-crm.git && cd builder-crm
npm install
npm run local
```

E pronto: `http://localhost:3000` com o CRM cheio de dados de demonstração. Não faz
falta Supabase, nem Docker, nem um arquivo `.env`.

`npm run local` sobe um **Postgres embutido** (um pacote de npm compilado para
WebAssembly, guardado em `.local/db`), aplica as mesmas migrações que uma instância
implantada — com o RLS —, carrega os dados demo e abre o CRM. **Não há login**: no modo
local não há servidor de autenticação, então você entra direto como administrador e o
menu lateral lembra disso.

| | |
|---|---|
| `npm run local -- --reset` | apaga a base local e começa do zero |
| `npm run local -- --sin-datos` | sem dados de demonstração |
| `npm run local -- --puerto 3001` | outra porta |

Para o **agente responder** no simulador faz falta uma chave do OpenRouter:
copie `.env.example` para `.env.local` e ponha `OPENROUTER_API_KEY`. Sem ela o CRM
funciona igual (as mensagens entram na caixa de entrada e criam o contato), só que ninguém
responde do outro lado.

O que o modo local **não** tem, porque precisa de uma instância de verdade: login,
equipe com papéis, convites por e-mail e a busca semântica do módulo
imóveis (o Postgres embutido não traz pgvector).

## Com o seu próprio Supabase (para adaptar e implantar)

```bash
cp .env.example .env.local        # completar pelo menos o Supabase (4 variáveis)
npm run db:migrar                 # cria tabelas, RLS e o trigger do primeiro admin
npm run dev                       # http://localhost:3000
```

1. Abra `/signup`: enquanto não houver membros, o cadastro está aberto e **a primeira
   conta fica como administrador**. Depois se fecha sozinho.
2. No início pulse **Cargar demo** (ou `npm run seed`) para ver o CRM cheio.
3. Abra **Simulador** e converse com o agente (precisa de `OPENROUTER_API_KEY`).
4. Conecte WhatsApp/Instagram/Messenger quando quiser: skill `conectar-zernio`.

Sem interface: `npm run admin:crear -- --email a@b.com --password 'xxxxxxxx'`.

## Implantar no Coolify

Resumo (o detalhe passo a passo está na skill `deploy-coolify`):

1. Base e Auth. Dois caminhos e convém escolher antes de começar:
   - **Supabase cloud**, um projeto por cliente. Mais rápido, com painel e backups; o
     plano gratuito pausa os projetos inativos.
   - **Auto-hospedados no mesmo Coolify** (Postgres + GoTrue): sem conta do Supabase,
     sem pausas e sem custo por cliente, mas os backups são seus. É o caminho da
     instância de demonstração. Guia:
     [`docs/SUPABASE-NO-VPS.md`](docs/SUPABASE-NO-VPS.md).

   Depois, da sua máquina: `npm run db:migrar` e `npm run admin:crear`.
2. No Coolify: aplicativo a partir do repositório (build pack **Dockerfile**, porta 3000,
   domínio) e as variáveis de [`.env.example`](.env.example), **todas em runtime**. Não
   faz falta marcar nenhuma como "Build Variable": desde 1.2.2 o servidor passa ao
   navegador a configuração pública em tempo de execução, então a mesma imagem
   serve para qualquer instância. O `Dockerfile` ainda aceita as `NEXT_PUBLIC_*` como
   build args, para o caso de construir numa plataforma que as grava na imagem (Vercel).
3. Deploy. As migrações rodam sozinhas ao iniciar o contêiner.
4. `curl https://<dominio>/api/health` -> `{"ok":true,"version":"<a do package.json>","db":"ok"}`.
5. `node scripts/seed-demo.mjs --url https://<dominio>` e
   `node scripts/verificar-instancia.mjs --url https://<dominio> --email ... --password ...`.

Também funciona com `docker compose up -d --build` (só o app; a base é
Supabase) ou na Vercel (`vercel.json` + varreduras pelo GitHub Actions).

## Adaptar a um cliente (sem tocar no núcleo)

Zona do cliente: `config/cliente.ts` (marca, pipeline, campos, agente),
`config/modulos.json`, `modules/<nombre>/`, `public/marca/`, `specs/<cliente>/`.
Núcleo: `src/`, `supabase/`, `scripts/`, Docker. Regras em
[`specs/CONSTITUICAO.md`](specs/CONSTITUICAO.md).

```ts
// config/cliente.ts
import { plantillaInmobiliaria } from "./plantillas/inmobiliaria";
export default definirConfig({ ...plantillaInmobiliaria, marca: { ...plantillaInmobiliaria.marca, nombre: "Casa Sur" } });
```

`config/modulos.json`: `{ "activos": ["propiedades", "visitas"] }` -> `npm run db:migrar`.

Com Claude Code: abra o repositório e peça a adaptação em linguagem natural; a skill
`adaptar-a-cliente` segue o fluxo entender -> especificar -> configurar -> construir ->
implantar -> testar -> entregar. Para um módulo novo: `crear-modulo`. Para um
modelo novo: `nueva-plantilla-nicho`.

## Estrutura

```
config/            zona do cliente: cliente.ts, modulos.json, plantillas/
modules/           módulos (ejemplo, propiedades, visitas, _plantilla)
public/marca/      logo e ícone do cliente
specs/             constituição, modelo de spec, specs do núcleo e do cliente
tests/             invariantes que falham em silêncio (assinatura, janela 24h, papéis)
.local/            base embutida do modo local (não se versiona)
src/               núcleo (app, lib, components, db)
supabase/          migrações do núcleo (base, RLS, primeiro admin)
scripts/           migrar, criar-admin, seed-demo, verificar-instancia, zernio:*
docker/, Dockerfile, docker-compose.yml
.claude/skills/    o arnês: 7 skills do fluxo one-shot
docs/              MCP, agente, Zernio, Supabase no seu VPS, entrar com o Google, e-mail
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run local` | **testar no seu PC sem contas**: Postgres embutido, dados demo, sem login |
| `npm run dev` / `build` / `start` | desenvolvimento contra o seu Supabase, build, servidor |
| `npm test` | invariantes do núcleo (vitest, sem base nem rede, ~1 s) |
| `npm run typecheck` / `lint` | gate técnico (o CI roda os três + build) |
| `npm run db:migrar` / `db:status` | migrações do núcleo + módulos ativos |
| `npm run admin:crear -- --email --password` | cria ou promove um administrador |
| `npm run claves:supabase` / `auth:preparar` | base e Auth no seu próprio VPS, sem Supabase cloud |
| `npm run seed` | dados de demonstração (`POST /api/seed/demo`) |
| `npm run verificar -- --url ...` | autoverificação de uma instância |
| `npm run zernio:setup` / `zernio:webhook` / `zernio:whatsapp` | canais via Zernio (`connect:whatsapp` para Meta direto) |
| `npm run pwa:icons` | ícones da PWA a partir de `public/marca/icono.png` |
| `npm run sync:tokko` | catálogo do módulo imóveis a partir do Tokko |

## Versões

A versão corre em `package.json`, se vê em `/api/health` e no rodapé do menu. SemVer
do ponto de vista de quem opera uma instância:

| | Quando sobe |
|---|---|
| **Maior** (`2.0.0`) | Há que fazer algo à mão ao atualizar (variável nova obrigatória, mudança do contrato de módulos ou de conectores). |
| **Menor** (`1.1.0`) | Funções novas. Atualizar é mesclar e reimplantar. |
| **Patch** (`1.0.1`) | Correções. Atualizar é mesclar e reimplantar. |

Como trazer uma versão nova a uma instância adaptada: [`ATUALIZAR.md`](ATUALIZAR.md).
Mudanças por versão: [`CHANGELOG.md`](CHANGELOG.md). Segredos, papéis e RLS:
[`SEGURANCA.md`](SEGURANCA.md).

## Licença

**MIT.** Copyright (c) 2026 Diego Vásquez. Você pode usá-lo, copiá-lo, modificá-lo,
implantá-lo para os seus clientes, cobrar por isso e distribuí-lo. A única condição é
conservar o aviso de copyright. Sem garantia: quem implanta uma instância é
responsável pelos dados, pelas credenciais e pelo que o agente responder às
pessoas que escrevem. O texto completo está em [`LICENSE`](LICENSE).

Nasceu como fork de [auto-crm](https://github.com/Hainrixz/auto-crm), também MIT; o
aviso de copyright se conserva em [`NOTICE`](NOTICE), junto com o das dependências.
A arquitetura de entrega para agências toma ideias de
[vocero-crm](https://github.com/kevinrivm/vocero-crm).
