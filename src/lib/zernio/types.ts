/**
 * Tipos da API do Zernio (https://docs.zernio.com), escritos à mão contra a doc.
 * Só se tipa o que consumimos; o resto da superfície chega como `unknown`.
 */

/** O Zernio suporta 16 plataformas; o CRM usa estas três mais as que possam chegar. */
export type ZernioPlatform =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "twitter"
  | "bluesky"
  | "reddit"
  | "telegram"
  | (string & {});

export interface ZernioError {
  status: number;
  code?: string;
  message: string;
  /** Segundos a esperar se o status é 429. */
  retryAfter?: number;
  raw?: unknown;
}

export type ZernioResult<T> =
  | { success: true; data: T }
  | { success: false; error: ZernioError };

export interface ZernioPagination {
  hasMore: boolean;
  nextCursor?: string | null;
}

export interface ZernioFailedAccount {
  accountId: string;
  accountUsername?: string;
  platform?: string;
  error?: string;
  code?: string;
  retryAfter?: number;
}

/**
 * O Zernio não falha a request inteira se uma conta não responde: degrada-a aqui. Há que
 * olhar ou uma sincronização parcial se lê como completa.
 */
export interface ZernioListMeta {
  accountsQueried?: number;
  accountsFailed?: number;
  failedAccounts?: ZernioFailedAccount[];
  lastUpdated?: string;
}

export interface ZernioListResponse<T> {
  data: T[];
  pagination?: ZernioPagination;
  meta?: ZernioListMeta;
}

export interface ZernioInstagramProfile {
  isFollower?: boolean;
  isFollowing?: boolean;
  followerCount?: number;
  isVerified?: boolean;
  fetchedAt?: string;
}

/**
 * Atribuição de origem. `ctwa_*` = Click To WhatsApp Ads, `meta_ad_*` = anúncio da
 * Meta que gerou o DM. Para uma imobiliária isto é saber de que anúncio veio o lead.
 */
export interface ZernioConversationMetadata {
  ctwa_clid?: string;
  ctwa_source_id?: string;
  ctwa_source_type?: string;
  ctwa_source_url?: string;
  ctwa_headline?: string;
  ctwa_captured_at?: string;
  meta_ad_id?: string;
  meta_ad_source?: string;
  meta_ad_type?: string;
  meta_ad_ref?: string;
  meta_ad_title?: string;
  meta_ad_photo_url?: string;
  meta_ad_video_url?: string;
  meta_ad_post_id?: string;
  meta_ad_product_id?: string;
  meta_ad_flow_id?: string;
  meta_ad_captured_at?: string;
}

export interface ZernioConversation {
  id: string;
  platform: ZernioPlatform;
  accountId: string;
  accountUsername?: string;
  /** IGSID no Instagram, PSID no Messenger, telefone no WhatsApp. */
  participantId?: string;
  participantName?: string;
  participantPicture?: string;
  participantVerifiedType?: string;
  lastMessage?: string;
  updatedTime?: string;
  status?: "active" | "archived" | (string & {});
  unreadCount?: number;
  url?: string;
  instagramProfile?: ZernioInstagramProfile;
  metadata?: ZernioConversationMetadata;
}

export interface ZernioAttachment {
  type?: string;
  url?: string;
  name?: string;
  mimeType?: string;
  [key: string]: unknown;
}

/** Direção tal qual o Zernio manda; normaliza-se a "in"/"out" ao persistir. */
export type ZernioDirection = "incoming" | "outgoing";

export interface ZernioMessageSender {
  /**
   * Identificador do remetente na plataforma. No WhatsApp é o telefone SEM o `+`
   * quando está disponível, e senão o `businessScopedUserId`.
   */
  id: string;
  /** Contato do CRM do Zernio, se já o tem mapeado. Não o usamos: o CRM é o nosso. */
  contactId?: string;
  name?: string;
  username?: string;
  /**
   * Só WhatsApp, E.164 com `+`. NULLABLE desde o rollout de BSUID (abril 2026): os
   * usuários com username podem escrever sem expor o telefone. Para esses casos há
   * que ancorar a identidade em `businessScopedUserId`.
   */
  phone?: string | null;
  businessScopedUserId?: string;
}

export interface ZernioMessage {
  id: string;
  conversationId: string;
  platform: ZernioPlatform;
  /** Id da mensagem na plataforma (wamid.* no WhatsApp). */
  platformMessageId?: string;
  direction: ZernioDirection;
  text?: string | null;
  attachments?: ZernioAttachment[];
  sender?: ZernioMessageSender;
  sentAt?: string;
  isRead?: boolean;
  deliveryStatus?: "sent" | "delivered" | "read" | "failed" | "deleted" | (string & {});
  deliveryError?: { code?: number; title?: string; message?: string } | null;
  metadata?: Record<string, unknown>;
}

/**
 * Mensagem tal como a devolve o REST (`GET /inbox/conversations/{id}/messages`).
 *
 * ATENÇÃO: NÃO é a mesma forma que a do webhook. O REST usa `message` / `senderId` /
 * `createdAt` e não expõe `platformMessageId`; o webhook usa `text` / `sender.id` /
 * `sentAt` e sim o expõe. São dois contratos distintos para a mesma entidade.
 */
export interface ZernioInboxMessage {
  id: string;
  conversationId?: string;
  accountId?: string;
  platform?: ZernioPlatform;
  message?: string | null;
  senderId?: string;
  senderName?: string | null;
  direction?: ZernioDirection;
  createdAt?: string;
  sentAt?: string | null;
  readAt?: string | null;
  deliveredAt?: string | null;
  deliveryStatus?: string | null;
  attachments?: ZernioAttachment[];
  isDeleted?: boolean;
}

export interface ZernioAccount {
  id: string;
  platform: ZernioPlatform;
  profileId?: string;
  username?: string;
  name?: string;
  displayName?: string;
  picture?: string;
  status?: string;
  connectedAt?: string;
}

export interface ZernioProfile {
  _id?: string;
  id?: string;
  name: string;
  description?: string;
}

// ============================================================
// Webhooks
// ============================================================

export const ZERNIO_INBOX_EVENTS = [
  "message.received",
  "message.sent",
  "conversation.started",
  "message.edited",
  "message.deleted",
  "message.delivered",
  "message.read",
  "message.failed",
  "reaction.received",
  "comment.received",
  "review.new",
  "review.updated",
] as const;

export const ZERNIO_ACCOUNT_EVENTS = [
  "account.connected",
  "account.disconnected",
] as const;

export type ZernioEventName =
  | (typeof ZERNIO_INBOX_EVENTS)[number]
  | (typeof ZERNIO_ACCOUNT_EVENTS)[number]
  | (string & {});

/** A conversa tal como viaja dentro de um webhook (não é a do endpoint de listagem). */
export interface ZernioWebhookConversation {
  id: string;
  platformConversationId?: string;
  participantId?: string;
  participantName?: string;
  participantUsername?: string;
  participantPicture?: string;
  status?: "active" | "archived" | (string & {});
  contactId?: string;
  metadata?: ZernioConversationMetadata;
}

export interface ZernioWebhookAccount {
  id?: string;
  accountId?: string;
  profileId?: string;
  platform?: ZernioPlatform;
  username?: string;
  displayName?: string;
}

/**
 * Envelope de todo webhook do Zernio: `{ id, event, message, conversation, account,
 * timestamp }`. Os campos concretos variam por evento, então se leem defensivamente
 * e o payload inteiro se guarda em `webhook_events.payload` / `messages.raw_payload`.
 */
export interface ZernioWebhookPayload {
  id?: string;
  event: ZernioEventName;
  timestamp?: string;
  message?: ZernioMessage;
  conversation?: ZernioWebhookConversation;
  account?: ZernioWebhookAccount;
  [key: string]: unknown;
}

export interface ZernioWebhookSubscription {
  id: string;
  url: string;
  events: string[];
  status?: string;
}
