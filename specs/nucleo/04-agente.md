# Spec: Agente de IA (requisito 4 do brief)

**Trilho**: completo (mexe no modelo de dados, no loop do agente e na configuração)
**Estado**: aprovada (plano da Fase 0, 2026-10-01)
**Data**: 2026-10-01
**Escrita antes do código**: sim

## Problema

O agente existe e funciona (OpenRouter, histórico por fio, tools, config por canal),
mas (1) não consegue agir sobre o CRM genérico: não move etapas, não atualiza a ficha,
não deixa um resumo; (2) o prompt default é o de uma imobiliária concreta e as
tools de nicho vivem no núcleo; (3) a pausa (handoff) está desacoplada: a tool
desliga a conversa mas a UI só liga/desliga o contato, então um fio
encaminhado aparece "ON" e ninguém consegue reativá-lo; (4) envia por um caminho próprio em vez
de `deliverMessage`.

## Decisões do dono

- D1 (Fase 0) Se o repositório já tem agente, adapta-se; não se define um microsserviço
  externo agora.
- D2 (Fase 0) Visitas e imóveis passam a módulos na Fase 9; até lá as
  tools ficam no núcleo mas fora do prompt genérico.

## Cenários

1. **Qualificar** — O cliente escreve; o agente responde pelo mesmo canal e, com o que
   descobre, chama `actualizar_contacto` (campos de `config/cliente.ts` marcados
   `agente`) e `mover_etapa` quando couber segundo o prompt.
2. **Resumir** — Ao terminar uma conversa útil, o agente chama `resumen_lead`;
   a ficha mostra "Resumo do agente" com data, e o painel do chat também.
3. **Encaminhar** — `derivar_asesor` pausa SÓ essa conversa; o painel do chat a
   mostra como pausada com o motivo e oferece "Reativar"; o contato continua com IA
   nos outros fios. O admin também pode pausar ou reativar à mão.
4. **Configurar** — O membro define em `config/cliente.ts` o nome do agente, o
   prompt base, o modelo e a mensagem de encaminhamento; `AGENT_MODEL` (env) manda sobre
   o modelo da config; Ajustes -> Agente continua podendo sobrepor prompt e tools por
   canal (cascata: canal -> global -> config -> default do núcleo).
5. **Estender** — Um módulo ativo contribui tools (`servidor.tools`); aparecem em
   Ajustes -> Agente junto com as do núcleo e o modelo pode usá-las.

## Requisitos

- FR-001 Tools genéricas do núcleo: `mover_etapa` (por chave ou nome de etapa do
  pipeline padrão; cria a operação se o contato não tiver uma aberta; usa
  `setDealStage`), `actualizar_contacto` (nome, e-mail, telefone, notas e campos
  personalizados validados), `registrar_actividad` (nota ou tarefa com data),
  `resumen_lead` (texto + campos), `derivar_asesor`, `asignar_asesor`.
- FR-002 Registro de tools como mapa `{ definicion, descripcionUI, ejecutar }`; os
  nomes válidos se calculam (núcleo + módulos ativos); Ajustes -> Agente os lista.
- FR-003 `contacts.ai_summary text` + `ai_summary_at`; visíveis na ficha e no chat.
- FR-004 O prompt default do núcleo é genérico e se monta com: marca e nome do
  agente, regras de estilo, catálogo de tools genéricas, e um bloco CONTEXTO com o
  contato (nome, campos conhecidos, etapa atual), as etapas disponíveis (chave e
  nome) e os campos a qualificar (`agente.descripcion`). `config.agente.prompt` o
  substitui como base.
- FR-005 Modelo: `agent_configs.model` -> `AGENT_MODEL` -> `config.agente.modelo` ->
  default do núcleo.
- FR-006 `PATCH /api/conversations/:id/agente` `{ enabled?, clearNeedsHuman? }` com
  acesso ao contato; o painel do chat mostra e muda o estado da CONVERSA.
- FR-007 O agente responde SÓ por `deliverMessage(conversationId, { text }, "agent")`.
  Elimina-se o transporte injetável (`AgentSender`) e `adapters.ts`.
- FR-008 Mensagem de encaminhamento a partir de `config.agente.mensajeDerivacion`.
- FR-009 Elimina-se `/api/agent/debug` (o simulador da Fase 7 o substitui).

## Configuração e módulos

`agente: { nombre, prompt?, modelo?, mensajeDerivacion? }` em `config/cliente.ts`.
Tools de módulos por `servidor.tools`.

## Modelo de dados

`contacts.ai_summary`, `contacts.ai_summary_at`. Base regenerada (pré-1.0.0).

## Agente de IA

É esta spec.

## Critérios de aceitação

- CA-001 Com o simulador (Fase 7): uma mensagem "quero um apto de 2 cômodos, tenho
  150 mil" termina com campos atualizados e a operação na etapa que o
  prompt indicar.
- CA-002 `derivar_asesor` deixa a conversa em pausa e o painel mostra o motivo;
  "Reativar" a liga de novo; outro fio do mesmo contato continua respondendo.
- CA-003 `resumen_lead` aparece na ficha com data.
- CA-004 Ajustes -> Agente lista as tools de um módulo ativo.
- CA-005 `typecheck + lint + build` em verde.

## Constitution Check

- I. Núcleo intocável: prompt e tools de nicho saem para config e módulos.
- II. Spec antes do código: esta spec.
- III. Autoverificação: CA-001..004 são exercitados por `probar-instancia` com o simulador.
- IV. Zero segredos: OPENROUTER_API_KEY só no env.

## Fora de escopo

- API para um cérebro externo (microsserviço): fica documentada como extensão
  possível em CLAUDE.md, não se implementa.
- Agendamento genérico: o agendamento é do módulo `visitas` (Fase 9).
