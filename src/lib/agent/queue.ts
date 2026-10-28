import { db } from "@/db";
import { agentJobs, contacts, conversations } from "@/db/schema";
import { and, eq, isNull, lte } from "drizzle-orm";

const DEBOUNCE_MS = 6000;

/**
 * Enfileira um job para processar o agente de IA.
 * - Se já há um job pending para a mesma CONVERSA, NÃO cria um novo:
 *   só estende o `process_after` para "absorver" mensagens em rajada.
 * - Se não há, cria um novo.
 *
 * A unidade de debounce é a conversa, não o contato: a mesma pessoa pode
 * te escrever por WhatsApp e por Instagram, e são dois fios que há que responder
 * separado. Sem `conversationId` (fluxo WhatsApp pela Meta, ainda sem migrar) cai-se
 * no comportamento velho por contato, isolado dos jobs que sim têm conversa.
 */
export async function enqueueAgentJob(
  contactId: string,
  triggerMessageId: string,
  conversationId?: string | null
): Promise<{ jobId: string; created: boolean }> {
  const processAfter = new Date(Date.now() + DEBOUNCE_MS);

  const pendingFilter = conversationId
    ? and(
        eq(agentJobs.conversationId, conversationId),
        eq(agentJobs.status, "pending")
      )
    : and(
        eq(agentJobs.contactId, contactId),
        isNull(agentJobs.conversationId),
        eq(agentJobs.status, "pending")
      );

  const [existing] = await db
    .select({ id: agentJobs.id })
    .from(agentJobs)
    .where(pendingFilter)
    .limit(1);

  if (existing) {
    await db
      .update(agentJobs)
      .set({
        processAfter,
        triggerMessageId,
        updatedAt: new Date(),
      })
      .where(eq(agentJobs.id, existing.id));
    return { jobId: existing.id, created: false };
  }

  const [created] = await db
    .insert(agentJobs)
    .values({
      contactId,
      conversationId: conversationId ?? null,
      status: "pending",
      processAfter,
      triggerMessageId,
    })
    .returning({ id: agentJobs.id });

  return { jobId: created.id, created: true };
}

/**
 * Tenta tomar um job para processar.
 * - Se o job já não está pending, não faz nada (outro worker o tomou).
 * - Se o processAfter ainda é futuro, não faz nada (debounce ativo, outro setTimeout virá).
 * - Se OK, marca processing e devolve o job + contato.
 */
export async function claimAgentJob(jobId: string): Promise<
  | { ok: true; contactId: string; conversationId: string | null; attempts: number }
  | { ok: false; reason: string }
> {
  const [job] = await db
    .select()
    .from(agentJobs)
    .where(eq(agentJobs.id, jobId))
    .limit(1);

  if (!job) return { ok: false, reason: "job_not_found" };
  if (job.status !== "pending") return { ok: false, reason: `status_${job.status}` };

  const now = Date.now();
  if (job.processAfter.getTime() > now) {
    return { ok: false, reason: "debounce_still_active" };
  }

  // Pré-checagem rápida do contato
  const [contact] = await db
    .select({ aiEnabled: contacts.aiEnabled, needsHuman: contacts.needsHuman })
    .from(contacts)
    .where(eq(contacts.id, job.contactId))
    .limit(1);

  if (!contact) {
    await db
      .update(agentJobs)
      .set({ status: "failed", error: "contact_not_found", updatedAt: new Date() })
      .where(eq(agentJobs.id, jobId));
    return { ok: false, reason: "contact_not_found" };
  }

  if (!contact.aiEnabled || contact.needsHuman) {
    await db
      .update(agentJobs)
      .set({
        status: "done",
        error: !contact.aiEnabled ? "ai_disabled" : "needs_human",
        updatedAt: new Date(),
      })
      .where(eq(agentJobs.id, jobId));
    return { ok: false, reason: "bot_off" };
  }

  // O toggle do contato é o kill-switch global; o da conversa desliga o bot
  // num canal sem desligá-lo nos outros (transferir a humano pelo Instagram não deveria
  // calar o bot no WhatsApp).
  if (job.conversationId) {
    const [conv] = await db
      .select({
        aiEnabled: conversations.aiEnabled,
        needsHuman: conversations.needsHuman,
      })
      .from(conversations)
      .where(eq(conversations.id, job.conversationId))
      .limit(1);

    if (conv && (!conv.aiEnabled || conv.needsHuman)) {
      await db
        .update(agentJobs)
        .set({
          status: "done",
          error: !conv.aiEnabled ? "ai_disabled_conversation" : "needs_human_conversation",
          updatedAt: new Date(),
        })
        .where(eq(agentJobs.id, jobId));
      return { ok: false, reason: "bot_off" };
    }
  }

  // Marcar processing (não usamos transações distribuídas; no MVP single-runner basta)
  const updated = await db
    .update(agentJobs)
    .set({
      status: "processing",
      attempts: job.attempts + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(agentJobs.id, jobId), eq(agentJobs.status, "pending")))
    .returning({ id: agentJobs.id });

  if (updated.length === 0) {
    return { ok: false, reason: "race_condition" };
  }

  return {
    ok: true,
    contactId: job.contactId,
    conversationId: job.conversationId,
    attempts: job.attempts + 1,
  };
}

export async function markJobDone(
  jobId: string,
  reason?: string
): Promise<void> {
  await db
    .update(agentJobs)
    .set({
      status: "done",
      error: reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(agentJobs.id, jobId));
}

export async function markJobFailed(
  jobId: string,
  error: string
): Promise<void> {
  await db
    .update(agentJobs)
    .set({
      status: "failed",
      error,
      updatedAt: new Date(),
    })
    .where(eq(agentJobs.id, jobId));
}

/**
 * Recolhe jobs pendentes vencidos (caso o setTimeout falhe ou o serverless mate
 * o worker). Pensado para se chamar de um cron periódico.
 */
export async function findStaleJobs(): Promise<
  Array<{ id: string; contactId: string; conversationId: string | null }>
> {
  const rows = await db
    .select({
      id: agentJobs.id,
      contactId: agentJobs.contactId,
      conversationId: agentJobs.conversationId,
    })
    .from(agentJobs)
    .where(and(eq(agentJobs.status, "pending"), lte(agentJobs.processAfter, new Date())))
    .limit(50);
  return rows;
}

export const queueConfig = {
  debounceMs: DEBOUNCE_MS,
};
