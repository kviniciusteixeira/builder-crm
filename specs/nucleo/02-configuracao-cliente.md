# Spec: Configuração por cliente (requisito 2 do brief, parte 1)

**Trilho**: completo (mexe no modelo de dados e no núcleo)
**Estado**: aprovada (plano da Fase 0, 2026-10-01)
**Data**: 2026-10-01
**Escrita antes do código**: sim

## Problema

Hoje a marca (nome, logo, cores), o nome da PWA, o pipeline inicial e
os campos do contato estão espalhados e hardcoded em `src/` (`layout.tsx`,
`Sidebar.tsx`, `AppShell.tsx`, `globals.css`, `manifest.json`, `prompt.ts`...). Adaptar
o CRM a um cliente obriga a editar o núcleo, e isso torna impossível atualizar sem
conflitos. O brief exige: mudar nome, logo, cores e pipeline de um cliente
**sem editar nenhum arquivo do núcleo**.

## Decisões do dono

- D1 (Fase 0) A configuração é um arquivo TypeScript tipado: `config/cliente.ts`.
- D2 (Fase 0) O papel `asesor` fica na base; o rótulo visível sai da
  configuração.

## Cenários

1. **Marcar** — O membro edita `config/cliente.ts` (nome, nome curto, logo,
   ícone, cor primária) e ao reiniciar o app a sidebar, o login, a aba, a
   PWA instalável e as notificações mostram a marca do cliente.
2. **Definir o pipeline** — As etapas de `config/cliente.ts` existem na base ao
   iniciar (criam-se se faltarem, renomeiam-se/recolorem-se se mudaram, nunca se apagam
   se tiverem operações). Pela UI continua possível adicionar etapas.
3. **Definir campos** — Os campos personalizados do contato aparecem no
   formulário de alta/edição, na ficha, no painel do chat e (os marcados) na
   tabela; gravam-se e filtram-se.
4. **Validar** — Um erro na configuração (cor inválida, etapa duplicada, campo
   sem chave) é detectado na inicialização e em `/api/health`, com uma mensagem clara.
5. **Atualizar** — Trazer uma versão nova do núcleo não toca em `config/` nem em `public/marca/`.

## Requisitos

- FR-001 `config/cliente.ts` exporta a configuração validada com o esquema zod de
  `src/lib/config/schema.ts` (`definirConfig`). Alias `@config/*` no tsconfig.
- FR-002 A configuração inclui: `marca` (nombre, nombreCorto, descripcion, logo,
  icono, colorPrimario, colorFondo opcional, tema), `idioma`, `moneda`, `roles`
  (rótulo do assessor), `pipeline` (nome + etapas com clave, nombre, color,
  ganada/perdida), `contacto.campos`, `agente` (nombre, prompt base opcional, modelo
  opcional), `modulos` (núcleo desligável + módulos de `modules/`).
- FR-003 A cor primária é injetada como CSS variables no SSR (sem flash) e deriva a
  cor de texto sobre o primário por contraste. `globals.css` conserva os defaults.
- FR-004 `src/app/manifest.ts` gera o manifesto da PWA a partir da configuração;
  `public/manifest.json` desaparece. Os ícones da PWA são gerados com
  `npm run pwa:icons` a partir de `marca.icono`.
- FR-005 Os assets de marca vivem em `public/marca/` (zona do cliente).
- FR-006 `sincronizarPipeline()` roda na inicialização (instrumentation) e é idempotente:
  upsert por `pipeline_stages.key`; não apaga etapas com operações.
- FR-007 `contacts.custom_fields jsonb` (default `{}`). `POST/PUT /api/contacts`
  aceitam `customFields` e validam contra a configuração (tipo, opções,
  obrigatório). Tipos: texto, numero, seleccion, booleano, fecha.
- FR-008 `src/lib/config` não importa nada server-only: os componentes cliente leem a
  marca e os campos diretamente.
- FR-009 Toda string de marca escrita à mão no núcleo sai da configuração.

## Configuração e módulos

Cria `config/cliente.ts` (valores padrão do Builder CRM) e `public/marca/`.
`modulos` ainda não é consumido para rotear (Fase 4): aqui só se define e valida.

## Modelo de dados

- `pipeline_stages.key text` (nullable; única por pipeline).
- `contacts.custom_fields jsonb not null default '{}'`.
- Regenera-se `20261001000000_base.sql` (pré-1.0.0, decisão D2 da spec 06).

## Agente de IA

O prompt base e o modelo podem vir da configuração (`agente.prompt`,
`agente.modelo`); a fiação em `src/lib/agent` é da Fase 6.

## Critérios de aceitação

- CA-001 Mudar `marca.nombre`, `marca.colorPrimario` e `marca.logo` em
  `config/cliente.ts` e reiniciar: sidebar, login, `<title>`, manifesto e notificações
  mudam; `git status` não mostra mudanças em `src/`.
- CA-002 Com `pipeline.etapas` de 7 etapas e uma base vazia, ao iniciar existem as 7
  nessa ordem; mudar um nome e reiniciar reflete; apagar da config uma etapa com
  operações não a elimina da base.
- CA-003 Um campo `seleccion` com opções aparece no formulário com as opções,
  grava-se em `custom_fields` e se vê na ficha.
- CA-004 Uma cor inválida na config faz `/api/health` responder 503 com
  `error: "config_invalida"` e o detalhe.
- CA-005 `typecheck + lint + build` em verde.

## Constitution Check

- I. Núcleo intocável: é justamente o que isso torna possível; `config/` e
  `public/marca/` são zona do cliente.
- II. Spec antes do código: esta spec.
- III. Autoverificação: `probar-instancia` compara marca e etapas com a config.
- IV. Zero segredos: a configuração não leva credenciais (vão no env).

## Fora de escopo

- Editar marca ou campos pela UI (a fonte da verdade é o arquivo, que viaja com
  o repositório do cliente e é versionado).
- Vários pipelines a partir da config (um; os demais se criam pela UI).
- Campos personalizados em operações (deals).
