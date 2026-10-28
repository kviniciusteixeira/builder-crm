# Spec: Módulos (requisito 2 do brief, parte 2)

**Trilho**: completo (contrato público: a interface de um módulo)
**Estado**: aprovada (plano da Fase 0, 2026-10-01)
**Data**: 2026-10-01
**Escrita antes do código**: sim

## Problema

O que é específico de um cliente (pedidos, consultas, imóveis, visitas...) hoje só se pode
adicionar editando `src/`: pastas novas em `src/app`, itens na sidebar, tabelas no
schema, tools no agente. Isso quebra as atualizações. Faz falta uma pasta
`modules/` onde cada acréscimo viva completo (telas, API, tabelas, tools, seed) e se
ligue ou desligue a partir da configuração, sem tocar no núcleo.

## Decisões do dono

- D1 (Fase 0) Misto: automações, atividades, templates, campanha e push ficam
  no núcleo mas desligáveis por config; visitas/calendário e imóveis passam a
  `modules/` (Fase 9).

## Cenários

1. **Criar** — O membro (ou a skill `crear-modulo`) copia `modules/_plantilla/` para
   `modules/<nombre>/`, completa `manifiesto.ts` e `servidor.tsx`, adiciona a
   `migrations/0000_<nombre>.sql` e inclui em `config/modulos.json`.
2. **Ver** — Ao iniciar, o módulo aparece no menu lateral (e móvel) na seção
   que declara, as páginas respondem em `/m/<nombre>/...` e a API em
   `/api/m/<nombre>/...`, já protegidas por `requireMember`.
3. **Desligar** — Tirá-lo de `config/modulos.json` o tira do menu e as rotas
   respondem 404; as tabelas não são tocadas.
4. **Migrar** — `npm run db:migrar` aplica também `modules/<activo>/migrations/*.sql`.
5. **Qualificar** — Os campos de contato que o módulo declara (`campos`) somam-se aos
   de `config/cliente.ts` no formulário, na ficha, na tabela e no agente.
6. **Agente** — As tools que o módulo declara somam-se às do núcleo quando está
   ativo (fiação na Fase 6).

## Requisitos

- FR-001 Um módulo é uma pasta `modules/<nombre>/` (nome em snake_case) com:
  `manifiesto.ts` (seguro para o navegador: nome, título, versão, nav, campos),
  `servidor.tsx` (páginas, api, tools, seed), `migrations/`, `README.md`.
- FR-002 A lista de módulos ativos vive em `config/modulos.json` (`activos`); leem
  `config/cliente.ts`, o runner de migrações e o gerador do registro.
- FR-003 `scripts/generar-registro-modulos.mjs` gera
  `src/lib/modules/registro.generated.ts` (servidor) e
  `registro-cliente.generated.ts` (navegador) com imports estáticos dos módulos
  ativos. Roda ao carregar `next.config.ts` (dev, build, Docker) e em
  `npm run typecheck`. É idempotente (não reescreve se não mudou).
- FR-004 `src/app/m/[modulo]/[[...ruta]]/page.tsx` e
  `src/app/api/m/[modulo]/[[...ruta]]/route.ts` resolvem a página ou o handler por
  padrão (`""`, `"nueva"`, `"[id]"`, `"[id]/editar"`), exigem membro e passam
  `{ params, searchParams, member }`. Módulo inativo ou rota sem match: 404.
- FR-005 A sidebar e o menu móvel se constroem a partir de: funções do núcleo ativas
  (`modulos.nucleo`) + `nav` dos manifestos ativos. As páginas do núcleo
  desligáveis (`/automatizaciones`, `/activities`, `/plantillas`, `/reportes`) respondem
  404 quando estão desligadas (layout servidor com `notFound()`).
- FR-006 `camposContacto()` devolve os campos da config mais os dos módulos
  ativos, sem chaves repetidas (erro de config se se repetirem).
- FR-007 As migrações de um módulo devem habilitar RLS nas suas tabelas; o runner
  força isso no final de qualquer forma.
- FR-008 Um módulo nunca importa de outro módulo nem do núcleo além de `@/lib/*`,
  `@/components/ui/*`, `@/db` e os tipos públicos de `@/lib/modules/types`.

## Configuração e módulos

`config/modulos.json` novo. `modules/_plantilla/` como modelo (não ativável: o
gerador ignora pastas que começam com `_`). `modules/ejemplo/` mínimo para
validar o mecanismo (inativo por padrão).

## Modelo de dados

Nenhum no núcleo. Cada módulo traz as suas tabelas em `migrations/`.

## Agente de IA

Define-se o tipo `ToolModulo` (mesma forma que as tools do núcleo). A fiação em
`src/lib/agent` é da Fase 6.

## Critérios de aceitação

- CA-001 Com `ejemplo` em `config/modulos.json`, `npm run build` termina, aparece
  "Ejemplo" no menu e `/m/ejemplo` e `/api/m/ejemplo` respondem; sem ele, 404 e não
  está no menu.
- CA-002 `npm run db:migrar --status` lista `modules/ejemplo/0000_ejemplo.sql` só
  quando o módulo está ativo.
- CA-003 Desligar `automatizaciones` em `config/cliente.ts` tira o item do menu e
  `/automatizaciones` responde 404.
- CA-004 Um módulo com um campo `clave` repetido em relação a `config/cliente.ts` faz
  `/api/health` responder `config_invalida`.
- CA-005 `typecheck + lint + build` em verde.

## Constitution Check

- I. Núcleo intocável: os módulos são o caminho; `src/` não se edita para adicionar um.
- II. Spec antes do código: esta spec.
- III. Autoverificação: CA-001..005; `probar-instancia` abre cada `/m/<modulo>`.
- IV. Zero segredos: as credenciais de um módulo vão no env, documentadas no README.

## Fora de escopo

- Módulos com layouts próprios ou rotas fora de `/m/<nombre>` (o prefixo é fixo para
  que não choquem com o núcleo).
- Instalar módulos a partir de um registro remoto (copiam-se pastas).
