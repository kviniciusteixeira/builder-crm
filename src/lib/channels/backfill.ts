import "server-only";
import { iterateConversations, listMessages } from "@/lib/zernio/inbox";
import { hasZernioKey } from "@/lib/zernio/client";
import { normalizePhone } from "@/lib/phone";
import { getAccountByZernioId } from "./accounts";
import {
  findOrCreateContactByIdentity,
  ingestMessage,
  upsertConversation,
} from "./ingest";
import { isChannel, type Channel } from "./types";
import type { ZernioConversation, ZernioInboxMessage } from "@/lib/zernio/types";

/**
 * Importa o histórico que o Zernio já tem replicado.
 *
 * Ao conectar uma conta, o Zernio copia até 500 conversas e as 500 mensagens mais
 * novas de cada uma, mas **isso não chega por webhook**: sem este passo o CRM arranca
 * vazio mesmo que o histórico exista do outro lado.
 *
 * REGRA DURA: nunca enfileira o agente. Importar 500 fios com o bot ligado seria
 * mandar uma resposta automática a centenas de clientes velhos. `ingestMessage`
 * além disso descarta por antiguidade, ou seja, há dois cintos.
 */

export interface BackfillOptions {
  /** Limitar a um canal. Por padrão importa todos os conectados. */
  channel?: Channel;
  /** Teto de conversas a percorrer. */
  maxConversations?: number;
  /** Mensagens por conversa (o Zernio permite até 100 por página). */
  messagesPerConversation?: number;
  /**
   * Orçamento de tempo. O plano Hobby da Vercel corta as funções aos 300s com
   * um 504, então se corta antes por bem e se informa que ficou pendente:
   * melhor uma importação parcial e retomável que uma morta no meio do caminho.
   */
  timeBudgetMs?: number;
}

export interface BackfillResult {
  ok: boolean;
  conversations: number;
  messages: number;
  skipped: number;
  /** true se ficaram fios sem importar: voltar a rodar para continuar. */
  incomplete: boolean;
  errors: string[];
}

export async function backfillFromZernio(
  options: BackfillOptions = {}
): Promise<BackfillResult> {
  const {
    channel,
    maxConversations = 200,
    messagesPerConversation = 100,
    timeBudgetMs = 240_000,
  } = options;

  // As mensagens posteriores ao arranque as traz o webhook ao vivo. Ignorá-las evita
  // inseri-las duas vezes: o REST não expõe `platformMessageId`, então a mesma
  // linha entraria com dois external_id distintos e o índice único não a frearia.
  const startedAt = Date.now();

  const result: BackfillResult = {
    ok: true,
    conversations: 0,
    messages: 0,
    skipped: 0,
    incomplete: false,
    errors: [],
  };

  if (!hasZernioKey()) {
    return {
      ...result,
      ok: false,
      errors: ["ZERNIO_API_KEY no configurada"],
    };
  }

  for await (const page of iterateConversations(
    { platform: channel },
    20,
    (message) => result.errors.push(message)
  )) {
    for (const conv of page) {
      const outOfTime = Date.now() - startedAt > timeBudgetMs;
      if (outOfTime || result.conversations >= maxConversations) {
        // A ingestão é idempotente (external_id único), então voltar a rodar
        // continua sem duplicar nada.
        result.incomplete = true;
        result.errors.push(
          outOfTime
            ? "Se acabo el tiempo de la funcion: volve a importar para continuar."
            : `Tope de ${maxConversations} conversaciones alcanzado: volve a importar para continuar.`
        );
        return result;
      }

      try {
        const imported = await importConversation(
          conv,
          messagesPerConversation,
          startedAt
        );
        if (imported === null) {
          result.skipped++;
        } else {
          result.conversations++;
          result.messages += imported;
        }
      } catch (err) {
        result.errors.push(
          `${conv.id}: ${err instanceof Error ? err.message : "error desconocido"}`
        );
      }
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}

/** @returns quantidade de mensagens importadas, ou null se a conversa foi pulada. */
async function importConversation(
  conv: ZernioConversation,
  limit: number,
  startedAt: number
): Promise<number | null> {
  if (!isChannel(conv.platform)) return null;
  const channel = conv.platform;

  const account = await getAccountByZernioId(conv.accountId);
  if (!account) return null;

  const participantId = conv.participantId
    ? channel === "whatsapp"
      ? `+${normalizePhone(conv.participantId)}`
      : conv.participantId
    : null;
  if (!participantId) return null;

  const contactId = await findOrCreateContactByIdentity({
    tenantId: account.tenantId,
    channel,
    externalId: participantId,
    name: conv.participantName ?? null,
    handle: null,
  });

  const conversation = await upsertConversation({
    tenantId: account.tenantId,
    contactId,
    accountId: account.id,
    channel,
    provider: "zernio",
    externalId: conv.id,
    participantId,
    participantName: conv.participantName ?? null,
    participantHandle: null,
    participantPicture: conv.participantPicture ?? null,
    metadata: conv.metadata,
  });

  const messages = await listMessages(conv.id, {
    accountId: conv.accountId,
    limit,
    sortOrder: "asc",
  });
  if (!messages.success) {
    throw new Error(messages.error.message);
  }

  const items = messages.data.messages ?? messages.data.data ?? [];
  let imported = 0;

  for (const msg of items) {
    if (msg.isDeleted) continue;

    const sentAt = parseDate(msg.sentAt ?? msg.createdAt);
    if (sentAt && sentAt.getTime() >= startedAt) continue;

    const res = await ingestMessage({
      conversation,
      direction: msg.direction === "outgoing" ? "out" : "in",
      externalId: msg.id ?? null,
      body: extractBody(msg),
      type: msg.message?.trim() ? "text" : (msg.attachments?.[0]?.type ?? "text"),
      sentAt,
      status: statusOf(msg),
      rawPayload: msg,
      // O importante de todo o arquivo.
      enqueueAgent: false,
    });

    if (!res.duplicate) imported++;
  }

  return imported;
}

function statusOf(msg: ZernioInboxMessage): string | undefined {
  if (msg.direction === "outgoing") return msg.deliveryStatus ?? "sent";
  // Entrantes históricos entram como lidos: não faz sentido que a caixa de entrada mostre
  // centenas de não lidos a primeira vez que se conecta a conta.
  return "read";
}

function extractBody(msg: ZernioInboxMessage): string {
  const text = msg.message?.trim();
  if (text) return text;

  const attachment = msg.attachments?.[0];
  if (!attachment) return "[mensaje]";

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

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
