# Conectores de canal

Um **conector** é por onde uma mensagem viaja. A caixa de entrada, o agente e Ajustes só
conhecem a interface `Conector` (`../conector.ts`): `enviar`, `webhook` e `estado`.

| Conector | Arquivo | Canais | Estado |
|---|---|---|---|
| Zernio | `zernio.ts` | WhatsApp, Instagram, Messenger | Completo. Caminho normal. |
| Meta Cloud API (direto) | `meta-cloud.ts` | WhatsApp | Parcial: `enviar` + `estado`. A ingestão vive na rota legada `/api/webhooks/whatsapp`. |
| Simulador | `simulador.ts` | todos (de teste) | Grava em vez de enviar; para demos e autoverificação. |

## Como uma mensagem flui

- **Sai**: `deliverMessage` (`../deliver.ts`) resolve o conector por
  `conversations.provider`, insere a linha `pending`, chama `enviar` e marca
  `sent`/`failed`. Ninguém mais sai para a rede.
- **Entra**: `POST /api/webhooks/<conector>` chama `manejarWebhook(conector, req)`
  (`../webhook.ts`): verifica a assinatura com `webhook.verificar`, reivindica o evento em
  `webhook_events` com `webhook.idEvento` (ou o hash do corpo), responde 2xx e em
  `after()` roda `webhook.procesar`, que normaliza e persiste com `../ingest.ts`
  (`findOrCreateContactByIdentity`, `upsertConversation`, `ingestMessage`,
  `updateMessageStatus`). `GET` com `AGENT_WORKER_SECRET` varre o que ficou pendente.
- **Estado**: `GET /api/channels` devolve `estado()` de cada conector.

## Adicionar o conector da API oficial do WhatsApp (Cloud API / Tech Provider)

Não está implementado de propósito (brief, requisito 3). Quando chegar a hora:

1. **Completar `meta-cloud.ts`** (ou criar `cloud-api.ts` com `id: "meta"`):
   - `webhook.verificar`: `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET`
     (`verifyWebhookSignature` de `src/lib/meta-whatsapp.ts` já faz isso).
   - `webhook.idEvento`: o `wamid` da mensagem ou o `id` do status; `null` se não houver
     (o núcleo usa o hash do corpo).
   - `webhook.procesar`: percorrer `entry[].changes[].value.messages[]` e `statuses[]`,
     resolver a conta por `metadata.phone_number_id` (`whatsapp_accounts`) e chamar
     as funções de `../ingest.ts`. A lógica de referência está em
     `src/app/api/webhooks/whatsapp/route.ts` (`handleInboundMessage`,
     `handleStatusUpdate`): migrá-la para cá e deixar essa rota como
     `manejarWebhook(metaCloud, req)` mais o `GET` de verificação do hub
     (`hub.challenge`).
2. **Conexão a partir da UI**: Embedded Signup da Meta (ou colar token + ids) que escreva
   em `whatsapp_accounts`; hoje existe só `scripts/connect-whatsapp-account.ts`.
3. **Registrar**: já está em `index.ts`. Se for criado outro id, adicionar o valor a
   `PROVIDERS` em `../types.ts`.
4. **Tech Provider**: a instância do cliente recebe o token da plataforma da
   agência; o webhook é roteado com `override_callback_uri` por WABA para
   `https://<instancia>/api/webhooks/whatsapp`. Mesmo conector, outra forma de obter
   credenciais.
5. **Testar**: `probar-instancia` já cobre caixa de entrada, agente e pipeline com o simulador;
   para Cloud API, mandar uma mensagem real para o número de teste e ver se entra.

Nada disso toca na caixa de entrada nem no agente: eles falam com `Conector`, não com a Meta.

## Regras

- Credenciais por ambiente (`ZERNIO_*`, `WHATSAPP_*`), nunca no código.
- O módulo do conector importa só o leve no nível de módulo; a ingestão e o
  cliente HTTP são importados dinamicamente (o Zernio exige 2xx em 5 s).
- Um conector nunca escreve em `messages` direto: devolve `SendOutcome` e deixa que
  `deliverMessage` persista.
