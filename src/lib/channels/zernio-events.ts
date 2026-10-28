import "server-only";
import { getAccountByZernioId, markAccountStatus, upsertZernioAccount } from "./accounts";
import {
  findOrCreateContactByIdentity,
  ingestMessage,
  linkExtraIdentity,
  updateMessageStatus,
  upsertConversation,
} from "./ingest";
import { isChannel, type Channel } from "./types";
import { resolveDefaultTenantId } from "@/lib/tenants";
import { normalizePhone } from "@/lib/phone";
import type {
  ZernioMessage,
  ZernioWebhookConversation,
  ZernioWebhookPayload,
} from "@/lib/zernio/types";

/**
 * Dispatch dos webhooks do Zernio para a persistência do CRM.
 *
 * Vive fora do route handler de propósito: o handler o importa dinamicamente dentro
 * de `after()` para não arrastar o grafo de imports do agente (embeddings -> sheets ->
 * tokko -> openai) ao cold start. O Zernio exige 2xx em 5 segundos e esse grafo os come.
 *
 * O envelope é `{ id, event, message, conversation, account, timestamp }`.
 */

export type ProcessStatus = "processed" | "ignored" | "retry";

export interface ProcessResult {
  status: ProcessStatus;
  reason?: string;
  jobIds: string[];
}

const ignored = (reason: string): ProcessResult => ({
  status: "ignored",
  reason,
  jobIds: [],
});

export async function processZernioEvent(
  payload: ZernioWebhookPayload
): Promise<ProcessResult> {
  switch (payload.event) {
    case "account.connected":
      return handleAccountConnected(payload);
    case "account.disconnected":
      return handleAccountDisconnected(payload);
    case "conversation.started":
    case "message.received":
    case "message.sent":
      return handleMessageEvent(payload);
    case "message.delivered":
    case "message.read":
    case "message.failed":
    case "message.deleted":
      return handleStatusEvent(payload);
    default:
      return ignored(`evento no manejado: ${payload.event}`);
  }
}

// ============================================================
// Contas
// ============================================================

async function handleAccountConnected(
  payload: ZernioWebhookPayload
): Promise<ProcessResult> {
  const info = payload.account;
  const accountId = info?.accountId ?? info?.id;
  const platform = info?.platform;

  if (!accountId || !isChannel(platform)) {
    return ignored(
      `account.connected sin accountId o con plataforma no usada: ${platform}`
    );
  }

  const tenantId = await resolveDefaultTenantId();
  if (!tenantId) return ignored("sin tenant default");

  await upsertZernioAccount({
    tenantId,
    platform,
    zernioAccountId: accountId,
    zernioProfileId: info?.profileId ?? null,
    username: info?.username ?? null,
    displayName: info?.displayName ?? info?.username ?? null,
  });

  return { status: "processed", jobIds: [] };
}

async function handleAccountDisconnected(
  payload: ZernioWebhookPayload
): Promise<ProcessResult> {
  const accountId = payload.account?.accountId ?? payload.account?.id;
  if (!accountId) return ignored("account.disconnected sin accountId");
  await markAccountStatus(accountId, "disconnected");
  return { status: "processed", jobIds: [] };
}

// ============================================================
// Mensagens
// ============================================================

async function handleMessageEvent(
  payload: ZernioWebhookPayload
): Promise<ProcessResult> {
  const msg = payload.message;
  const conv = payload.conversation;

  const platform = msg?.platform ?? payload.account?.platform;
  if (!isChannel(platform)) {
    return ignored(`plataforma no usada por el CRM: ${platform}`);
  }

  const zernioAccountId = payload.account?.accountId ?? payload.account?.id;
  const account = await getAccountByZernioId(zernioAccountId);
  if (!account) {
    // Igual ao webhook da Meta com phone_number_id: uma conta que não está na
    // nossa tabela não é nossa, e criar contatos com as suas mensagens seria lixo.
    return ignored(`cuenta de Zernio no registrada: ${zernioAccountId}`);
  }

  const conversationExternalId = conv?.id ?? msg?.conversationId;
  if (!conversationExternalId) return ignored("evento sin conversationId");

  const direction = msg?.direction === "outgoing" ? "out" : "in";
  const identity = resolveParticipant(platform, conv, msg, direction);
  if (!identity.externalId) {
    return ignored("no se pudo resolver el participante");
  }

  const contactId = await findOrCreateContactByIdentity({
    tenantId: account.tenantId,
    channel: platform,
    externalId: identity.externalId,
    handle: identity.handle,
    name: identity.name,
  });

  // O WhatsApp está migrando para BSUID: um usuário com username pode escrever sem expor
  // o telefone. Guardar o BSUID como segunda identidade faz com que essas mensagens
  // futuras caiam no mesmo contato em vez de criar um novo.
  if (identity.bsuid && identity.bsuid !== identity.externalId) {
    await linkExtraIdentity(contactId, platform, identity.bsuid, identity.handle);
  }

  const conversation = await upsertConversation({
    tenantId: account.tenantId,
    contactId,
    accountId: account.id,
    channel: platform,
    provider: "zernio",
    externalId: conversationExternalId,
    participantId: identity.externalId,
    participantName: identity.name,
    participantHandle: identity.handle,
    participantPicture: conv?.participantPicture ?? null,
    metadata: conv?.metadata,
  });

  // conversation.started pode vir sem mensagem: só abre o fio (e guarda a
  // atribuição do anúncio, que é de onde sai de que anúncio veio o lead).
  if (!msg) return { status: "processed", jobIds: [] };

  const result = await ingestMessage({
    conversation,
    direction,
    // platformMessageId (wamid.* no WhatsApp) e não o id interno do Zernio: mantém a
    // deduplicação contra as mensagens que o webhook da Meta possa ter guardado.
    externalId: msg.platformMessageId ?? msg.id ?? null,
    body: extractBody(msg),
    type: messageType(msg),
    sentAt: parseDate(msg.sentAt ?? payload.timestamp),
    status: direction === "in" && msg.isRead ? "read" : undefined,
    rawPayload: payload,
  });

  return {
    status: "processed",
    reason: result.duplicate ? "duplicado" : undefined,
    jobIds: result.jobId ? [result.jobId] : [],
  };
}

async function handleStatusEvent(
  payload: ZernioWebhookPayload
): Promise<ProcessResult> {
  const msg = payload.message;
  const externalId = msg?.platformMessageId ?? msg?.id;
  if (!externalId) return ignored("evento de estado sin id de mensaje");

  const at = parseDate(payload.timestamp) ?? new Date();

  const patch =
    payload.event === "message.delivered"
      ? { status: "delivered", deliveredAt: at }
      : payload.event === "message.read"
        ? { status: "read", readAt: at }
        : payload.event === "message.failed"
          ? {
              status: "failed",
              errorMessage: JSON.stringify(
                msg?.deliveryError ?? { message: "envio fallido" }
              ).slice(0, 1000),
            }
          : { status: "deleted" };

  const found = await updateMessageStatus({ externalId, ...patch });
  if (!found) {
    // O estado chegou antes da mensagem. Marca-se para nova tentativa em vez de
    // descartá-lo em silêncio, que é o que faz hoje o webhook da Meta.
    return { status: "retry", reason: "mensaje todavia no persistido", jobIds: [] };
  }

  return { status: "processed", jobIds: [] };
}

// ============================================================
// Helpers
// ============================================================

interface ResolvedParticipant {
  externalId: string | null;
  name: string | null;
  handle: string | null;
  bsuid: string | null;
}

/**
 * Quem é o cliente nesta conversa.
 *
 * Nas mensagens de saída o `sender` é o negócio, não o contato: por isso a
 * conversa manda e o sender só se usa como respaldo nas entrantes.
 */
function resolveParticipant(
  channel: Channel,
  conv: ZernioWebhookConversation | undefined,
  msg: ZernioMessage | undefined,
  direction: "in" | "out"
): ResolvedParticipant {
  const sender = direction === "in" ? msg?.sender : undefined;
  const bsuid = sender?.businessScopedUserId ?? null;

  const raw =
    conv?.participantId ??
    (channel === "whatsapp" ? (sender?.phone ?? sender?.id) : sender?.id) ??
    null;

  const externalId =
    channel === "whatsapp" && raw ? `+${normalizePhone(raw)}` : raw;

  return {
    externalId,
    name: conv?.participantName ?? sender?.name ?? null,
    handle: conv?.participantUsername ?? sender?.username ?? null,
    bsuid,
  };
}

/** Espelha `extractMessageBody` do webhook da Meta para que o chat se leia igual. */
function extractBody(msg: ZernioMessage): string {
  const text = msg.text?.trim();
  if (text) return text;

  const attachment = msg.attachments?.[0];
  if (attachment) {
    const kind = (attachment.type ?? "adjunto").toLowerCase();
    const label =
      kind === "image"
        ? "imagen"
        : kind === "video"
          ? "video"
          : kind === "audio"
            ? "audio"
            : kind === "file"
              ? "documento"
              : kind;
    const extra =
      msg.attachments && msg.attachments.length > 1
        ? ` (+${msg.attachments.length - 1})`
        : "";
    return `[${label}]${extra}`;
  }

  return "[mensaje]";
}

function messageType(msg: ZernioMessage): string {
  if (msg.text?.trim()) return "text";
  const kind = msg.attachments?.[0]?.type;
  return kind ? String(kind) : "text";
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
