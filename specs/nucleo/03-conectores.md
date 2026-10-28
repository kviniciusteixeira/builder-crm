# Spec: Conectores de canais (requisito 3 do brief)

**Trilho**: completo (contrato público: a interface de conector)
**Estado**: aprovada (plano da Fase 0, 2026-10-01)
**Data**: 2026-10-01
**Escrita antes do código**: sim

## Problema

Hoje a saída de mensagens passa por uma interface comum (`ChannelAdapter.send` e
`deliverMessage`), mas a entrada não: cada webhook (Zernio, Meta direto) verifica,
deduplica e ingere do seu jeito, e não há forma uniforme de perguntar "este canal está
conectado?". O brief pede uma camada de conectores com interface comum (enviar, receber
webhook, estado), com Zernio funcionando e a porta aberta para um conector da
API oficial do WhatsApp (Cloud API / Tech Provider) **sem implementá-lo agora**.

## Decisões do dono

- D1 (Fase 0) O código da Meta Cloud API direta não se apaga nem se estende: fica
  como conector parcial documentado.

## Cenários

1. **Enviar** — `deliverMessage` busca o conector por `conversations.provider` e chama
   `enviar`. Nada mais sai para a rede por outro caminho.
2. **Receber** — `POST /api/webhooks/<conector>` verifica a assinatura com o conector,
   reivindica o evento em `webhook_events` (idempotência), responde 2xx rápido e processa
   em `after()` com `conector.webhook.procesar`, que normaliza e persiste usando as
   mesmas funções de `ingest.ts`. A varredura (`GET` com segredo) reprocessa o que
   ficou pendente, para qualquer conector.
3. **Estado** — Ajustes → Canales mostra, por conector, se está configurado, quais
   variáveis faltam e as contas conectadas; vem de `conector.estado()`.
4. **Adicionar Cloud API** — Um desenvolvedor cria `conectores/meta-cloud.ts` completo
   seguindo `conectores/README.md`, registra no índice e adiciona a rota
   `/api/webhooks/meta-cloud` de 10 linhas. A caixa de entrada e o agente não mudam.
5. **Leads por webhook** — Formulários externos postam em `/api/webhooks/leads` (público,
   com segredo), que antes vivia em `/api/webhook` e o middleware bloqueava.

## Requisitos

- FR-001 `src/lib/channels/conector.ts` define `Conector { id, nombre, canales,
  enviar(), webhook?: { verificar, idEvento, procesar }, estado() }` e os tipos de
  mensagem de saída, resultado de envio e estado.
- FR-002 `src/lib/channels/conectores/index.ts` registra os conectores por id;
  `conectorParaConversacion(conv)` resolve por `provider`.
- FR-003 `conectores/zernio.ts` implementa a interface completa reutilizando o código
  atual (envio por `inbox.sendMessage`, assinatura HMAC, `processZernioEvent`). Sem mudanças
  de comportamento nem de URL (`/api/webhooks/zernio` continua sendo a que está
  registrada no Zernio).
- FR-004 `conectores/meta-cloud.ts` implementa `enviar` e `estado` com o código de
  `meta-whatsapp.ts`; `webhook` fica sem implementar e documentado (a ingestão legada
  continua em `/api/webhooks/whatsapp` enquanto `WHATSAPP_PROVIDER=meta`).
- FR-005 `src/lib/channels/webhook.ts` concentra a mecânica genérica de webhooks
  (verificar, reivindicar, `after()`, varredura) para que cada rota seja mínima e importe o
  mínimo possível (o Zernio exige 2xx em 5 s).
- FR-006 `GET /api/channels` devolve `conectores: EstadoConector[]`; a UI os mostra.
- FR-007 O webhook de leads passa a `/api/webhooks/leads` (público por prefixo) e
  Ajustes mostra essa URL.
- FR-008 Credenciais só por ambiente (`ZERNIO_*`, `WHATSAPP_*`), nunca no código.

## Configuração e módulos

Nenhum. (Um conector não é um módulo: é núcleo, porque a caixa de entrada depende dele.)

## Modelo de dados

Nenhum. `webhook_events.provider` já distingue o conector.

## Agente de IA

Sem mudanças: responde por `deliverMessage`.

## Critérios de aceitação

- CA-001 Um `POST /api/webhooks/zernio` com assinatura válida e um `message.received`
  termina com uma linha em `messages` e um job do agente, exatamente como hoje.
- CA-002 Com assinatura inválida responde 401; repetido com o mesmo id responde
  `duplicate: true`.
- CA-003 `GET /api/channels` inclui `conectores` com `zernio` e `meta-cloud`, cada um
  com `configurado` e `faltan`.
- CA-004 `POST /api/webhooks/leads` sem sessão e com o segredo correto cria o
  contato; sem segredo responde 401.
- CA-005 `typecheck + lint + build` em verde.

## Constitution Check

- I. Núcleo intocável: os conectores são núcleo; um cliente não os edita, os
  configura por env.
- II. Spec antes do código: esta spec.
- III. Autoverificação: CA-001..005; o simulador (Fase 7) será mais um conector.
- IV. Zero segredos: só variáveis de ambiente.

## Fora de escopo

- Implementar o conector Cloud API completo (ingestão, conexão a partir da UI, Tech
  Provider). Ficam a interface, o `enviar` existente e o guia.
- Mover a ingestão legada de `/api/webhooks/whatsapp` para o conector (faz-se ao
  implementar Cloud API).
