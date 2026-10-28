# Spec: Modelo imobiliário e dados de demonstração (requisitos 7 e 6 do brief)

**Trilho**: completo (tira tabelas do núcleo para módulos)
**Estado**: aprovada (plano da Fase 0, 2026-10-01)
**Data**: 2026-10-01
**Escrita antes do código**: sim

## Problema

O CRM nasceu para uma imobiliária e o que é imobiliário (visitas, calendário, catálogo
Tokko, busca semântica, prompt) está dentro do núcleo. O brief pede um
**modelo de nicho** que se ative a partir da configuração sem tocar no núcleo, com
pipeline, campos, agente qualificador e dados de demo coerentes, pronto para uma
reunião de venda.

## Decisões do dono

- D1 (Fase 0) Visitas/calendário e imóveis/Tokko passam a `modules/`.
- D2 Dados demo: nenhum real; nomes e telefones inventados.

## Cenários

1. **Ativar** — O membro importa `plantillaInmobiliaria` em `config/cliente.ts`,
   põe `["propiedades", "visitas"]` em `config/modulos.json`, roda `db:migrar` e
   reinicia: pipeline de 7 etapas, 5 campos, menu com Propiedades, Visitas e
   Calendario, e o agente qualificando.
2. **Demo** — `npm run seed` (ou o botão do início) carrega contatos, conversas,
   operações, visitas e imóveis coerentes com uma imobiliária; o simulador
   responde com esses imóveis.
3. **Genérico** — Sem o modelo, o núcleo não tem nada imobiliário (nem tabelas, nem
   tools, nem textos).

## Requisitos

- FR-001 `modules/visitas`: tabela `visitas`, páginas `/m/visitas` e
  `/m/visitas/calendario`, API, tool `agendar_visita`, seed.
- FR-002 `modules/propiedades`: tabela `propiedades` (pgvector), função
  `propiedades_buscar`, página `/m/propiedades`, API, tools `buscar_propiedades`
  (semântica com OpenAI ou filtros SQL sem ela) e `buscar_info_propiedades`, seed de 6
  imóveis, `scripts/sync-tokko.ts`.
- FR-003 O núcleo deixa de ter `visits`, `properties`, pgvector, Tokko, Firecrawl,
  embeddings, Google Sheets e as tools de nicho; `base.sql` se regenera.
- FR-004 `config/plantillas/inmobiliaria.ts` com pipeline (Nuevo lead, Calificado,
  Visita agendada, Visita realizada, Negociacion, Cerrado ganado, Cerrado perdido),
  campos (tipo_operacion, tipo_propiedad, zona, presupuesto, dormitorios), prompt
  qualificador e módulos ativos.
- FR-005 Seed de demonstração do núcleo (`src/lib/seed-demo.ts`): contatos,
  conversas com mensagens (recebidas e enviadas com origem), operações por
  etapa e atividades, com valores de campos personalizados gerados conforme a
  configuração; depois o seed de cada módulo ativo. Idempotente. Exposto como
  `POST /api/seed/demo` (admin ou segredo do worker) e `npm run seed`.
- FR-006 As conversas do seed usam o conector `simulador` para que se possa
  responder e o agente conteste na demo; os relatórios excluem só os contatos
  com fonte `simulador` (os criados a partir de /simulador), não estas.

## Configuração e módulos

`config/plantillas/inmobiliaria.ts`; `config/modulos.json` com os dois módulos quando
se usa o modelo.

## Modelo de dados

Tabelas `visitas` e `propiedades` nos seus módulos. Núcleo sem elas.

## Agente de IA

Tools de nicho nos módulos; prompt qualificador no modelo.

## Critérios de aceitação

- CA-001 Com o modelo ativo, `typecheck + lint + build` em verde e
  `/m/propiedades`, `/m/visitas`, `/m/visitas/calendario` compilam.
- CA-002 Sem módulos ativos, não existe nada imobiliário no bundle nem em base.sql.
- CA-003 `POST /api/seed/demo` duas vezes deixa a mesma quantidade de linhas.
- CA-004 Com o seed e o simulador, o agente oferece imóveis do catálogo demo
  (exige OPENROUTER_API_KEY; sem OPENAI_API_KEY usa filtros).

## Constitution Check

- I. Núcleo intocável: é o movimento que o cumpre.
- II. Spec antes do código: esta spec.
- III. Autoverificação: CA-001..003 por build e script; CA-004 com credenciais.
- IV. Zero segredos: Tokko/Firecrawl/OpenAI por env, documentados no módulo.

## Fora de escopo

- Sincronização com Google Calendar; portais diferentes do Tokko (documenta-se como
  copiar o script de sync).
