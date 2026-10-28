# Spec: Simulador de conversas (requisito 5.6 do brief)

**Trilho**: completo (conector novo + rotas públicas da instância)
**Estado**: aprovada (plano da Fase 0, 2026-10-01)
**Data**: 2026-10-01
**Escrita antes do código**: sim

## Problema

Para testar o agente hoje é preciso ter um número de WhatsApp conectado e escrever para ele
a partir de um telefone. Isso impede (1) a autoverificação automática de uma instância
recém-implantada e (2) mostrar o CRM funcionando numa reunião de venda antes de
o cliente conectar o número.

## Decisões do dono

- D1 (Fase 0) O simulador é mais um conector (`provider = "simulador"`): a
  conversa simulada entra na caixa de entrada como qualquer outra, o agente a atende
  pelo mesmo caminho, e a saída nunca chega à rede.

## Cenários

1. **Demo** — O admin abre `/simulador`, escolhe o canal a simular (WhatsApp, Instagram
   ou Messenger), escreve como se fosse um cliente e vê a resposta do agente em
   segundos. Ao lado vê o que o agente foi mudando no CRM: etapa, campos,
   resumo, atividades.
2. **Caixa de entrada** — A mesma conversa aparece em Conversas marcada como
   "Simulador"; dá para abrir, ver as mensagens e o estado do agente.
3. **Autoverificação** — `probar-instancia` cria uma conversa por API, manda uma
   mensagem, espera a resposta e confere se a etapa mudou.
4. **Segurança** — Um assessor não vê o menu nem pode usar as rotas (403); nada do
   simulado sai pelo Zernio nem pela Meta.

## Requisitos

- FR-001 `PROVIDERS` inclui `"simulador"`; `conectores/simulador.ts` implementa
  `enviar` (devolve sucesso com id `sim:<uuid>`, sem rede) e `estado`; sem `webhook`.
- FR-002 `POST /api/simulador/conversaciones { canal, nombre? }` (admin) cria um
  contato sintético (fonte `simulador`, etiqueta `simulador`, proprietário = quem o
  cria) com a identidade e uma conversa `provider="simulador"`. Devolve ids.
- FR-003 `POST /api/simulador/mensajes { conversationId, texto }` (admin) ingere a
  mensagem recebida com `ingestMessage` (sem enfileirar) e roda o agente de forma
  síncrona; devolve `{ agente: { ok, reason, reply, toolCalls }, messages }`.
  Rejeita conversas que não sejam do simulador. `maxDuration = 60`.
- FR-004 `GET /api/simulador/conversaciones` (admin) lista as simuladas recentes.
- FR-005 `/simulador`: página só admin (404 para o resto) e desligável com
  `modulos.nucleo.simulador`; item no menu (seção Inteligencia) visível só para
  admin.
- FR-006 A caixa de entrada marca as conversas com `provider === "simulador"`.
- FR-007 Sem `OPENROUTER_API_KEY` a rota responde 503 `agente_no_configurado` com uma
  mensagem clara (o simulador não finge respostas).

## Configuração e módulos

`modulos.nucleo.simulador` (já existe, default true).

## Modelo de dados

Nenhum: `provider` distingue o simulado.

## Agente de IA

O prompt recebe o guia de canal `simulador`; o resto é idêntico à produção.

## Critérios de aceitação

- CA-001 Criar conversa + mandar "Olá, busco informação" devolve uma resposta
  do agente e a conversa aparece em `/conversations` marcada como Simulador.
- CA-002 Com um prompt que indique mover para "contactado" na primeira mensagem, a
  operação do contato simulado fica nessa etapa (visível no painel).
- CA-003 Um assessor recebe 403 nas rotas e não vê o item do menu.
- CA-004 `webhook_events` e os conectores reais não registram nada durante uma
  simulação.
- CA-005 `typecheck + lint + build` em verde.

## Constitution Check

- I. Núcleo intocável: é núcleo; não toca na config do cliente.
- II. Spec antes do código: esta spec.
- III. Autoverificação: é a base de `probar-instancia`.
- IV. Zero segredos: nada novo no env.

## Fora de escopo

- Clientes simulados automáticos com roteiro (tipo Laboratório do vocero): o membro
  escreve à mão ou `probar-instancia` manda um roteiro fixo.
- Simular anexos, templates ou estados de entrega.
