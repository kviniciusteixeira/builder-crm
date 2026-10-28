import "server-only";
import { db } from "@/db";
import { channelAccounts, contacts, conversations, messages } from "@/db/schema";
import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { isChannel, type Channel } from "@/lib/channels/types";

/**
 * Camada de leitura da caixa de entrada.
 *
 * Antes uma "conversa" era uma projeção de `contacts ⟕ última mensagem`, agrupada
 * por contato. Com três canais isso colapsava os fios: a mesma pessoa escrevendo
 * por WhatsApp e por Instagram ficava num só chat misturado. Agora se lê da
 * tabela `conversations`, que além disso traz `unread_count` e `last_*` materializados: a
 * lista passa de N+1 queries a uma só.
 */

export interface ConversationListItem {
  conversationId: string;
  contactId: string | null;
  name: string;
  channel: Channel;
  provider: string;
  /** Telefone no WhatsApp, @usuário no Instagram, nome no Messenger. */
  handle: string | null;
  phone: string | null;
  participantPicture: string | null;
  lastBody: string | null;
  lastDirection: "in" | "out" | null;
  lastAt: Date | null;
  unreadCount: number;
  /** Efetivo: o contato é o kill-switch global, a conversa desliga um canal. */
  aiEnabled: boolean;
  needsHuman: boolean;
  needsHumanReason: string | null;
}

export interface ConversationMessage {
  id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  templateName: string | null;
  status: string;
  errorMessage: string | null;
  externalId: string | null;
  metaMessageId: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface ConversationDetail {
  conversationId: string;
  channel: Channel;
  provider: string;
  handle: string | null;
  participantName: string | null;
  participantPicture: string | null;
  /** Último entrante: define a janela de 24h do lado do servidor. */
  lastInboundAt: Date | null;
  aiEnabled: boolean;
  needsHuman: boolean;
  needsHumanReason: string | null;
  metadata: unknown;
}

function toChannel(value: string): Channel {
  return isChannel(value) ? value : "whatsapp";
}

function handleOf(row: {
  channel: string;
  participantHandle: string | null;
  participantId: string | null;
  phone: string | null;
}): string | null {
  if (row.channel === "whatsapp") return row.participantId ?? row.phone;
  if (row.participantHandle) return `@${row.participantHandle.replace(/^@/, "")}`;
  return row.participantId;
}

export async function listConversations(filter?: {
  channel?: Channel;
  /** Só fios de contatos com este proprietário (visibilidade de assessor). */
  ownerId?: string;
}): Promise<ConversationListItem[]> {
  const base = db
    .select({
      conversationId: conversations.id,
      contactId: conversations.contactId,
      channel: conversations.channel,
      provider: conversations.provider,
      participantHandle: conversations.participantHandle,
      participantId: conversations.participantId,
      participantName: conversations.participantName,
      participantPicture: conversations.participantPicture,
      lastBody: conversations.lastMessageBody,
      lastDirection: conversations.lastDirection,
      lastAt: conversations.lastMessageAt,
      unreadCount: conversations.unreadCount,
      convAiEnabled: conversations.aiEnabled,
      convNeedsHuman: conversations.needsHuman,
      convNeedsHumanReason: conversations.needsHumanReason,
      contactName: contacts.name,
      phone: contacts.phone,
      contactAiEnabled: contacts.aiEnabled,
      contactNeedsHuman: contacts.needsHuman,
      contactNeedsHumanReason: contacts.needsHumanReason,
    })
    .from(conversations)
    .leftJoin(contacts, eq(contacts.id, conversations.contactId))
    .leftJoin(channelAccounts, eq(channelAccounts.id, conversations.accountId));

  // Os fios de uma conta desconectada não se mostram.
  //
  // Ao desconectar uma conta e conectar outra, as suas conversas continuavam aparecendo
  // na caixa de entrada: pareciam ativas, mas respondê-las falhava porque a conta já não
  // existe do lado do provedor. Não se apagam — se se volta a conectar a mesma
  // conta, o histórico reaparece sozinho. Para eliminá-las de verdade está
  // `npm run channels:purge`.
  //
  // As conversas sem conta associada (históricas, ou de outro provedor) se
  // mostram igual: não há nenhuma conta que as invalide.
  const soloConectadas = or(
    isNull(conversations.accountId),
    isNull(channelAccounts.id),
    ne(channelAccounts.status, "disconnected")
  );

  const rows = await base
    .where(
      and(
        soloConectadas,
        filter?.channel ? eq(conversations.channel, filter.channel) : undefined,
        // Um assessor vê só os fios dos seus contatos. Os fios sem contato
        // (raros: chegaram antes de criar o contato) só o admin os vê.
        filter?.ownerId ? eq(contacts.ownerId, filter.ownerId) : undefined
      )
    )
    .orderBy(desc(conversations.lastMessageAt));

  return rows.map((r) => ({
    conversationId: r.conversationId,
    contactId: r.contactId,
    name: r.contactName ?? r.participantName ?? "Sin nombre",
    channel: toChannel(r.channel),
    provider: r.provider,
    handle: handleOf(r),
    phone: r.phone,
    participantPicture: r.participantPicture,
    lastBody: r.lastBody,
    lastDirection: (r.lastDirection as "in" | "out" | null) ?? null,
    lastAt: r.lastAt,
    unreadCount: r.unreadCount,
    aiEnabled: (r.contactAiEnabled ?? true) && r.convAiEnabled,
    needsHuman: (r.contactNeedsHuman ?? false) || r.convNeedsHuman,
    needsHumanReason: r.convNeedsHumanReason ?? r.contactNeedsHumanReason ?? null,
  }));
}

export async function getConversation(conversationId: string): Promise<{
  conversation: ConversationDetail | null;
  contact: typeof contacts.$inferSelect | null;
  messages: ConversationMessage[];
}> {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv) return { conversation: null, contact: null, messages: [] };

  const [contact] = conv.contactId
    ? await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, conv.contactId))
        .limit(1)
    : [];

  const rows = await db
    .select({
      id: messages.id,
      direction: messages.direction,
      type: messages.type,
      body: messages.body,
      templateName: messages.templateName,
      status: messages.status,
      errorMessage: messages.errorMessage,
      externalId: messages.externalId,
      metaMessageId: messages.metaMessageId,
      sentAt: messages.sentAt,
      deliveredAt: messages.deliveredAt,
      readAt: messages.readAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.sentAt), asc(messages.createdAt));

  return {
    conversation: {
      conversationId: conv.id,
      channel: toChannel(conv.channel),
      provider: conv.provider,
      handle: handleOf({
        channel: conv.channel,
        participantHandle: conv.participantHandle,
        participantId: conv.participantId,
        phone: contact?.phone ?? null,
      }),
      participantName: conv.participantName,
      participantPicture: conv.participantPicture,
      lastInboundAt: conv.lastInboundAt,
      aiEnabled: (contact?.aiEnabled ?? true) && conv.aiEnabled,
      needsHuman: (contact?.needsHuman ?? false) || conv.needsHuman,
      needsHumanReason: conv.needsHumanReason ?? contact?.needsHumanReason ?? null,
      metadata: conv.metadata,
    },
    contact: contact ?? null,
    messages: rows.map((m) => ({
      ...m,
      direction: m.direction as "in" | "out",
    })),
  };
}

export async function markConversationAsRead(
  conversationId: string
): Promise<void> {
  await db
    .update(messages)
    .set({ status: "read", readAt: new Date() })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.direction, "in"),
        eq(messages.status, "received")
      )
    );

  await db
    .update(conversations)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

/** Todos os fios de um contato, para o painel de detalhe. */
export async function listConversationsForContact(
  contactId: string
): Promise<Array<{ conversationId: string; channel: Channel; lastAt: Date | null }>> {
  const rows = await db
    .select({
      conversationId: conversations.id,
      channel: conversations.channel,
      lastAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .where(eq(conversations.contactId, contactId))
    .orderBy(desc(conversations.lastMessageAt));

  return rows.map((r) => ({ ...r, channel: toChannel(r.channel) }));
}

/**
 * Retrocompatibilidade de links velhos: `/conversations/<contactId>` continua funcionando.
 * Devolve o id de conversa se o parâmetro era um contato.
 */
export async function resolveConversationId(
  id: string
): Promise<string | null> {
  const [asConversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (asConversation) return asConversation.id;

  const [byContact] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.contactId, id))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);

  return byContact?.id ?? null;
}

export async function countUnreadByChannel(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      channel: conversations.channel,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(conversations)
    .groupBy(conversations.channel);

  return Object.fromEntries(rows.map((r) => [r.channel, Number(r.total)]));
}

/**
 * Apaga um fio e tudo o que pende dele.
 *
 * `messages` e `agent_jobs` vão por cascade (FK com ON DELETE CASCADE). NÃO se toca
 * o contato nem `contact_identities`: a pessoa continua no CRM e, se volta a
 * escrever, a ingestão cria um fio novo e o engancha ao mesmo contato. Também não se
 * tocam `webhook_events`: são o registro do que o provedor entregou e servem de
 * idempotência; apagá-los faria com que uma nova tentativa reinsira as mensagens.
 *
 * Não se pode desfazer: o histórico dessa conversa se perde para sempre.
 */
export async function deleteConversation(conversationId: string): Promise<{
  deleted: boolean;
  messages: number;
}> {
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));

  const rows = await db
    .delete(conversations)
    .where(eq(conversations.id, conversationId))
    .returning({ id: conversations.id });

  return { deleted: rows.length > 0, messages: count };
}
