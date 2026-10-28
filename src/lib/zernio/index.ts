/**
 * Cliente do Zernio (https://docs.zernio.com) — provedor unificado de mensageria para
 * Instagram DM, Facebook Messenger e WhatsApp.
 *
 * Usa-se `fetch` à mão e não o SDK `@zernio/node` por três razões:
 *  - os 4 integradores externos do repo (meta-whatsapp, ghl, tokko, firecrawl) são
 *    fetch à mão com o mesmo contrato de retorno; um SDK quebra a convenção;
 *  - o SDK é pré-1.0 autogerado e se publica quase por commit: um rename na
 *    superfície gerada quebra o build num `npm i`;
 *  - a verificação de assinatura precisa do raw body, ou seja, código próprio de qualquer forma.
 */

export {
  zernioFetch,
  hasZernioKey,
  getProfileId,
  zernioConfig,
  type ZernioFetchOptions,
} from "./client";

export {
  listConversations,
  iterateConversations,
  listMessages,
  sendMessage,
  createConversation,
  extractMessageId,
  type ListConversationsParams,
  type ListMessagesParams,
  type ListMessagesResponse,
  type CreateConversationInput,
  type ZernioTemplateRef,
  type SendMessageInput,
  type SendMessageResponse,
} from "./inbox";

export {
  listAccounts,
  getAccount,
  listProfiles,
  buildConnectUrl,
  connectWhatsappHeadless,
  accountIdOf,
  profileIdOf,
  type ConnectWhatsappCredentials,
} from "./accounts";

export {
  listTemplates,
  createTemplate,
  deleteTemplate,
  connectWhatsapp,
  type CreateTemplateInput,
  type ZernioTemplate,
} from "./whatsapp";

export {
  verifyZernioSignature,
  hasZernioWebhookSecret,
  SUBSCRIBED_EVENTS,
} from "./webhooks";

export type * from "./types";
