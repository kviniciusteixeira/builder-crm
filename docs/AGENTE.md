# Agente de IA: como funciona

O agente responde as mensagens recebidas de WhatsApp, Instagram e Messenger, descobre
o que o negócio precisa saber de cada pessoa e deixa isso escrito no CRM. É
genérico: o que ele sabe do negócio vem de `config/cliente.ts`, dos módulos ativos
e de Ajustes -> Agente.

## Fluxo de um turno

1. Entra uma mensagem pelo webhook do conector (`src/lib/channels/webhook.ts`) e a
   ingestão (`ingest.ts`) cria ou atualiza contato, conversa e mensagem, e enfileira um
   job (`agent_jobs`) com debounce de 6 s por conversa.
2. O webhook dispara o worker `POST /api/agent/process` com `AGENT_WORKER_SECRET`;
   o worker pega o job (`claimAgentJob`) e roda `runAgentForConversation`
   (`src/lib/agent/index.ts`).
3. O agente carrega as últimas 30 mensagens do fio, resolve a configuração do
   canal, monta o system prompt e entra no loop de tool calling (até 6 rodadas).
4. A resposta sai por `deliverMessage` (único caminho de saída), que escolhe o
   conector por `conversations.provider`: Zernio, Meta direto ou o simulador.
5. Se algo ficou pendente (o `after()` morreu), as varreduras (`GET` de
   `/api/agent/process`, `/api/webhooks/zernio`, `/api/automations/process` com o
   segredo) retomam: a cada 30 min dentro do processo no Coolify, ou por
   `vercel.json` + GitHub Actions na Vercel.

## Quando NÃO responde

- O contato tem o agente desligado ou "precisa de humano" (kill-switch global).
- A conversa está pausada (`derivar_asesor` ou pausa manual a partir do chat).
- O agente está desligado para esse canal (Ajustes -> Agente; Instagram e Messenger
  começam desligados).
- Falta `OPENROUTER_API_KEY`, não há mensagens do cliente, ou a última mensagem já é
  do agente.

## System prompt

Cascata: `agent_configs[canal]` (Ajustes -> Agente, por canal) -> `crm_settings`
(Ajustes -> Agente, global) -> `config.agente.prompt` (modelo ou cliente) -> default
genérico do núcleo (`src/lib/agent/prompt.ts`). Placeholders: `{{agente}}`,
`{{negocio}}`, `{{canal}}`, `{{fecha}}`.

No final o agente sempre acrescenta:

- **CANAL**: guia de estilo conforme a rede (tamanho, tom, links).
- **CONTEXTO**: nome e dados conhecidos do cliente, resumo anterior, etapa atual,
  **PIPELINE** (chave: nome de cada etapa) e **DADOS A DESCOBRIR** (os campos da
  config com `agente.descripcion` que ainda estão vazios).
- **EQUIPE** (se puder atribuir): assessores ativos e quem tem o contato.

## Ferramentas

| Tool | O que faz |
|---|---|
| `actualizar_contacto` | Grava nome, e-mail, telefone, notas e campos personalizados (validados contra a config). |
| `mover_etapa` | Move a operação aberta do contato para uma etapa (por chave ou nome); se não houver operação, cria. Passa por `setDealStage`, então dispara automações. |
| `registrar_actividad` | Nota ou tarefa com data na ficha. |
| `resumen_lead` | Resumo de 2-4 frases em `contacts.ai_summary` (ficha e chat). |
| `derivar_asesor` | Pausa o agente NESTE fio, marca "precisa de humano" com motivo e envia `config.agente.mensajeDerivacion`. |
| `asignar_asesor` | Atribui o contato a um membro pelo nome (dispara o aviso push). |
| *de módulos* | O que cada módulo ativo declarar em `servidor.tools` (ex. `buscar_propiedades`, `agendar_visita`). |

Cada tool pode ser desligada por canal em Ajustes -> Agente. O registro é dinâmico:
`listarTools()` em `src/lib/agent/tools.ts`.

## Modelo e provedor

OpenRouter (compatível com OpenAI) com `OPENROUTER_API_KEY`. Modelo:
`agent_configs.model` -> `AGENT_MODEL` (ambiente) -> `config.agente.modelo` -> default
do núcleo. Qualquer modelo com tool calling serve.

## Testar sem canal

`/simulador` (só admin): você escreve como cliente, o agente responde na mesma
chamada e o painel mostra etapa, campos, resumo e atividades. É também o que usa
`scripts/verificar-instancia.mjs`. As conversas simuladas aparecem na
caixa de entrada com a marca `sim`.

## Mudar o comportamento

| Quero… | Mexo em… |
|---|---|
| Que pergunte outros dados | `contacto.campos[].agente` em `config/cliente.ts` |
| Que mova para outra etapa em outro momento | o prompt (`config.agente.prompt` ou Ajustes -> Agente) |
| Que saiba de um catálogo ou reserve horários | um módulo com tools (`modules/README.md`) |
| A mensagem ao encaminhar | `config.agente.mensajeDerivacion` |
| Outro modelo | `AGENT_MODEL` |
| Tom diferente no Instagram | Ajustes -> Agente -> Instagram (prompt próprio do canal) |
