import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { contacts, conversations, deals, pipelineStages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/api-auth";
import { listMembers } from "@/lib/team";
import { ingestMessage, linkExtraIdentity, upsertConversation } from "@/lib/channels/ingest";
import { resolveDefaultTenantId } from "@/lib/tenants";
import { emitContactCreated } from "@/lib/contacts/events";
import { assignContact } from "@/lib/contacts/assign";
import { getConversation } from "@/lib/conversations";
import { runAgentForConversation } from "@/lib/agent";
import { hasOpenRouterKey } from "@/lib/agent/openrouter";
import type { Channel } from "@/lib/channels/types";
import type { TeamMember } from "@/lib/team";

/**
 * Simulador de conversas: cria contatos e fios sintéticos (provider
 * "simulador") e roda o agente de forma síncrona para que a resposta volte na
 * mesma chamada. Usam /simulador (demos) e scripts/verificar-instancia.mjs.
 */

export const PROVEEDOR_SIMULADOR = "simulador";

/**
 * Quem pode usar o simulador: um admin com sessão, ou um script com
 * AGENT_WORKER_SECRET como Bearer (scripts/verificar-instancia.mjs). No segundo
 * caso o "membro" é o primeiro admin ativo da instância.
 */
export async function autorizarSimulador(
  request: NextRequest
): Promise<{ member: TeamMember } | { response: NextResponse }> {
  const secreto = process.env.AGENT_WORKER_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secreto && bearer === secreto) {
    const admin = (await listMembers({ onlyActive: true })).find((m) => m.role === "admin");
    if (admin) return { member: admin };
    return { response: NextResponse.json({ error: "La instancia no tiene ningun administrador" }, { status: 409 }) };
  }
  return requireAdmin();
}

export async function crearConversacionSimulada(input: {
  canal: Channel;
  nombre?: string | null;
  member: TeamMember;
}): Promise<{ conversationId: string; contactId: string }> {
  const tenantId = await resolveDefaultTenantId();
  if (!tenantId) throw new Error("No existe el tenant default (correr las migraciones)");

  const uuid = crypto.randomUUID();
  const externalId = `sim:${uuid}`;
  const nombre = input.nombre?.trim() || `Cliente simulado ${uuid.slice(0, 4)}`;
  const now = new Date();

  const [contact] = await db
    .insert(contacts)
    .values({
      name: nombre,
      source: "simulador",
      tags: ["simulador"],
      tenantId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: contacts.id });

  await linkExtraIdentity(contact.id, input.canal, externalId, null);
  await emitContactCreated(contact.id, { name: nombre, source: "simulador" });
  // Quem simula fica com o contato: um assessor não vê os dos outros, e o admin vê tudo.
  await assignContact({ contactId: contact.id, ownerId: input.member.id, by: { type: "member", member: input.member } });

  const conversation = await upsertConversation({
    tenantId,
    contactId: contact.id,
    accountId: null,
    channel: input.canal,
    provider: PROVEEDOR_SIMULADOR,
    externalId,
    participantId: externalId,
    participantName: nombre,
    participantHandle: null,
    participantPicture: null,
  });

  return { conversationId: conversation.id, contactId: contact.id };
}

export interface EstadoContactoSimulado {
  nombre: string;
  etapa: string | null;
  operaciones: number;
  campos: Record<string, unknown>;
  resumen: string | null;
  etiquetas: string[];
}

export interface ResultadoSimulacion {
  agente: { ok: boolean; reason?: string; reply?: string; toolCalls?: number };
  messages: Awaited<ReturnType<typeof getConversation>>["messages"];
  /** O que o agente deixou no CRM (para o painel e para a autoverificação). */
  estado: EstadoContactoSimulado | null;
}

async function estadoContacto(contactId: string | null): Promise<EstadoContactoSimulado | null> {
  if (!contactId) return null;
  const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!c) return null;
  const ops = await db
    .select({ etapa: pipelineStages.name })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(eq(deals.contactId, contactId))
    .orderBy(desc(deals.updatedAt));
  return {
    nombre: c.name,
    etapa: ops[0]?.etapa ?? null,
    operaciones: ops.length,
    campos: (c.customFields as Record<string, unknown> | null) ?? {},
    resumen: c.aiSummary ?? null,
    etiquetas: c.tags ?? [],
  };
}

/**
 * O turno do agente, que nunca leva embora a mensagem de quem escreve.
 *
 * Sem chave não há a quem perguntar; e com uma chave vencida ou mal copiada, o
 * provedor responde 401 e a exceção chegava até a rota, que devolvia 500. Nos
 * dois casos a pessoa via "Error" e a mensagem desaparecia da tela, quando na
 * realidade o CRM tinha feito bem a sua parte.
 */
async function turnoDelAgente(conversationId: string): Promise<ResultadoSimulacion["agente"]> {
  if (!hasOpenRouterKey()) {
    return { ok: false, reason: "falta OPENROUTER_API_KEY en .env.local" };
  }
  try {
    return await runAgentForConversation(conversationId);
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[simulador] el agente fallo:", detalle);
    return { ok: false, reason: detalle.slice(0, 200) };
  }
}

export async function enviarMensajeSimulado(input: {
  conversationId: string;
  texto: string;
}): Promise<ResultadoSimulacion | { error: "no_simulada" | "no_encontrada" }> {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId)).limit(1);
  if (!conv) return { error: "no_encontrada" };
  if (conv.provider !== PROVEEDOR_SIMULADOR) return { error: "no_simulada" };

  // Entrante como se viesse de um webhook, mas sem enfileirar: o agente corre aqui mesmo.
  //
  // A mensagem se guarda ANTES de olhar se o agente pode responder, e de propósito.
  // Sem chave do OpenRouter isto cortava antes de guardar nada: o simulador não servia
  // para ver o CRM funcionando, que é justamente o que alguém quer fazer quando o
  // testa pela primeira vez. Agora a conversa entra na caixa de entrada, o contato se
  // cria e a ficha se monta igual; a única coisa que falta é a resposta do agente.
  await ingestMessage({
    conversation: conv,
    direction: "in",
    externalId: `sim:in:${crypto.randomUUID()}`,
    body: input.texto.trim(),
    type: "text",
    enqueueAgent: false,
  });

  const agente = await turnoDelAgente(conv.id);
  const { messages } = await getConversation(conv.id);
  const estado = await estadoContacto(conv.contactId);
  return { agente, messages, estado };
}

export async function listarConversacionesSimuladas(limit = 20) {
  return db
    .select({
      id: conversations.id,
      contactId: conversations.contactId,
      channel: conversations.channel,
      participantName: conversations.participantName,
      lastMessageAt: conversations.lastMessageAt,
      lastMessageBody: conversations.lastMessageBody,
    })
    .from(conversations)
    .where(eq(conversations.provider, PROVEEDOR_SIMULADOR))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit);
}
