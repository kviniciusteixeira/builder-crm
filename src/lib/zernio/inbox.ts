import { zernioFetch, getProfileId } from "./client";
import type {
  ZernioAttachment,
  ZernioConversation,
  ZernioInboxMessage,
  ZernioListResponse,
  ZernioPlatform,
  ZernioResult,
} from "./types";

/** Caixa de entrada unificada do Zernio: conversas e mensagens de todas as plataformas. */

export interface ListConversationsParams {
  platform?: ZernioPlatform;
  accountId?: string;
  status?: "active" | "archived";
  sortOrder?: "asc" | "desc";
  /** 1-100, default 50 do lado do Zernio. */
  limit?: number;
  cursor?: string;
  profileId?: string;
}

export async function listConversations(
  params: ListConversationsParams = {}
): Promise<ZernioResult<ZernioListResponse<ZernioConversation>>> {
  return zernioFetch<ZernioListResponse<ZernioConversation>>(
    "/inbox/conversations",
    {
      query: {
        profileId: params.profileId ?? getProfileId() ?? undefined,
        platform: params.platform,
        accountId: params.accountId,
        status: params.status,
        sortOrder: params.sortOrder,
        limit: params.limit,
        cursor: params.cursor,
      },
    }
  );
}

/**
 * Pagina todas as conversas seguindo `nextCursor`. `maxPages` é um teto duro:
 * sem ele, um cursor que não avança (bug do provedor) faria um loop infinito.
 */
export async function* iterateConversations(
  params: ListConversationsParams = {},
  maxPages = 20,
  onError?: (message: string) => void
): AsyncGenerator<ZernioConversation[], void, void> {
  let cursor = params.cursor;

  for (let page = 0; page < maxPages; page++) {
    const result = await listConversations({ ...params, cursor });
    if (!result.success) {
      // Sem este callback quem chama não distingue "não há conversas" de
      // "a API falhou", e uma importação quebrada se lê como bem-sucedida.
      console.error("[zernio] listConversations fallo:", result.error.message);
      onError?.(result.error.message);
      return;
    }

    const { data, pagination, meta } = result.data;
    if (meta?.failedAccounts?.length) {
      // Não é um erro da request: o Zernio degrada por conta. Se não se loga, uma
      // sincronização parcial se lê como completa.
      console.warn(
        "[zernio] cuentas que fallaron en la consulta:",
        meta.failedAccounts.map((a) => `${a.accountUsername ?? a.accountId}: ${a.error}`)
      );
    }

    if (data.length > 0) yield data;

    if (!pagination?.hasMore || !pagination.nextCursor) return;
    if (pagination.nextCursor === cursor) {
      console.warn("[zernio] nextCursor no avanza, corto la paginacion");
      return;
    }
    cursor = pagination.nextCursor;
  }

  console.warn(`[zernio] tope de ${maxPages} paginas alcanzado`);
}

export interface ListMessagesParams {
  accountId?: string;
  /** 1-100, default 100. */
  limit?: number;
  cursor?: string;
  sortOrder?: "asc" | "desc";
}

/** A resposta traz as mensagens em `messages`, não em `data`. */
export interface ListMessagesResponse {
  messages?: ZernioInboxMessage[];
  data?: ZernioInboxMessage[];
  pagination?: { hasMore: boolean; nextCursor?: string | null };
  lastUpdated?: string;
}

export async function listMessages(
  conversationId: string,
  params: ListMessagesParams = {}
): Promise<ZernioResult<ListMessagesResponse>> {
  return zernioFetch<ListMessagesResponse>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      query: {
        accountId: params.accountId,
        limit: params.limit,
        cursor: params.cursor,
        sortOrder: params.sortOrder,
      },
    }
  );
}

/** Referência a um template aprovado, tal como o espera o endpoint de envio. */
export interface ZernioTemplateRef {
  name: string;
  language: string;
  components?: unknown[];
}

export interface SendMessageInput {
  accountId: string;
  message?: string;
  /**
   * Fora da janela de 24h, Instagram e Messenger só aceitam HUMAN_AGENT
   * (válida 7 dias) e há que acompanhá-lo de messagingType MESSAGE_TAG.
   */
  messageTag?: "HUMAN_AGENT";
  messagingType?: "RESPONSE" | "MESSAGE_TAG";
  attachments?: ZernioAttachment[];
  /** WhatsApp: template aprovado dentro de um fio que já existe. */
  template?: ZernioTemplateRef;
  /**
   * WhatsApp Direct Send: mensagem de utilidade iniciada pelo negócio SEM template
   * aprovado. Requer que a WABA seja elegível; se não é, a Meta rejeita o envio.
   */
  category?: "utility";
  /** O Zernio replica a resposta original em vez de reenviar. Válido 24h. */
  idempotencyKey?: string;
}

export interface SendMessageResponse {
  /**
   * O Zernio envolve a resposta: `{ success, data: { messageId, conversationId } }`.
   * O cliente devolve o corpo cru, então o id útil vive UM NÍVEL ADENTRO.
   */
  data?: {
    messageId?: string;
    conversationId?: string;
    /**
     * Facebook e Instagram quando se manda anexo + texto: a Meta o parte em duas
     * mensagens. A primeira é o anexo e coincide com `messageId`.
     */
    messageIds?: string[];
    [key: string]: unknown;
  };
  id?: string;
  messageId?: string;
  conversationId?: string;
  [key: string]: unknown;
}

export async function sendMessage(
  conversationId: string,
  input: SendMessageInput
): Promise<ZernioResult<SendMessageResponse>> {
  return zernioFetch<SendMessageResponse>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : undefined,
      body: {
        accountId: input.accountId,
        ...(input.message ? { message: input.message } : {}),
        ...(input.messageTag ? { messageTag: input.messageTag } : {}),
        ...(input.messagingType ? { messagingType: input.messagingType } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
        ...(input.category ? { category: input.category } : {}),
        // O endpoint espera o template envolvido em `elements`, com um só elemento.
        ...(input.template
          ? { template: { elements: [input.template] } }
          : {}),
      },
    }
  );
}

export interface CreateConversationInput {
  accountId: string;
  /** WhatsApp: telefone em formato internacional, SEM o `+`. */
  participantId?: string;
  participantUsername?: string;
  message?: string;
  templateName?: string;
  templateLanguage?: string;
  /**
   * Valores das variáveis num ÚNICO array plano e na ordem em que aparecem no
   * template: primeiro as do header de texto, depois as do body, e no final
   * uma por cada botão de URL dinâmica.
   */
  templateParams?: string[];
  category?: "utility";
  idempotencyKey?: string;
}

export interface CreateConversationResponse {
  conversationId?: string;
  id?: string;
  messageId?: string;
  [key: string]: unknown;
}

/**
 * Inicia uma conversa de WhatsApp com um número com o qual não há fio aberto.
 *
 * É TAMBÉM a única forma de reengajar alguém passadas as 24 horas: o WhatsApp não
 * permite texto livre para abrir conversa, então sem `templateName` a API
 * devolve TEMPLATE_REQUIRED (salvo Direct Send com `category: 'utility'`).
 * Se já existe um fio com esse número, o template entra nesse mesmo fio.
 */
export async function createConversation(
  input: CreateConversationInput
): Promise<ZernioResult<CreateConversationResponse>> {
  return zernioFetch<CreateConversationResponse>("/inbox/conversations", {
    method: "POST",
    headers: input.idempotencyKey
      ? { "Idempotency-Key": input.idempotencyKey }
      : undefined,
    body: {
      accountId: input.accountId,
      ...(input.participantId ? { participantId: input.participantId } : {}),
      ...(input.participantUsername
        ? { participantUsername: input.participantUsername }
        : {}),
      ...(input.message ? { message: input.message } : {}),
      ...(input.templateName ? { templateName: input.templateName } : {}),
      ...(input.templateLanguage
        ? { templateLanguage: input.templateLanguage }
        : {}),
      ...(input.templateParams?.length
        ? { templateParams: input.templateParams }
        : {}),
      ...(input.category ? { category: input.category } : {}),
    },
  });
}

/** O Zernio devolve o id da mensagem com nome diferente conforme o endpoint. */
/**
 * Id da mensagem recém-enviada.
 *
 * IMPORTA MAIS DO QUE PARECE: é a chave com a qual se deduplica o eco. O Zernio
 * manda um webhook `message.sent` por cada mensagem que sai, incluídas as que mandou
 * o próprio CRM. Se a linha de saída se guarda sem este id, o índice único (que é
 * parcial, `where external_id is not null`) não pode frear nada e a mensagem aparece
 * DUAS VEZES na caixa de entrada, mesmo que ao cliente chegue uma só.
 *
 * Leem-se as duas formas —com e sem envelope— para não depender de a API não
 * mudar de opinião.
 */
export function extractMessageId(res: SendMessageResponse): string | null {
  return (
    res.data?.messageId ??
    res.data?.messageIds?.[0] ??
    res.messageId ??
    res.id ??
    null
  );
}
