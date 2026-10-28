import "server-only";
import { db } from "@/db";
import { contacts, deals, pipelineStages, pipelines } from "@/db/schema";
import { eq } from "drizzle-orm";
import { emitAutomationEvent } from "@/lib/automations";
import type { DealStageChangedPayload } from "@/lib/automations/triggers";

/**
 * Move uma operação de etapa e emite `deal.stage_changed`.
 *
 * É o ÚNICO caminho: o drag do kanban (`PUT /api/pipeline`), a edição da
 * operação (`PUT /api/deals/:id`) e a criação (`POST /api/deals`, com
 * `previousStageId = null`: "lead colocado no pipeline") passam todos por aqui. Se se
 * escreve `stageId` por outro lado, as automações não ficam sabendo.
 */
export async function setDealStage(input: {
  dealId: string;
  stageId: string;
  /** Só para a criação: a linha já tem a etapa, não há que atualizá-la. */
  justCreated?: boolean;
}): Promise<{ ok: boolean; error?: string; changed: boolean }> {
  const [deal] = await db
    .select({
      id: deals.id,
      title: deals.title,
      stageId: deals.stageId,
      contactId: deals.contactId,
    })
    .from(deals)
    .where(eq(deals.id, input.dealId))
    .limit(1);
  if (!deal) return { ok: false, error: "Deal no encontrado", changed: false };

  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.id, input.stageId))
    .limit(1);
  if (!stage) return { ok: false, error: "Etapa no encontrada", changed: false };

  const previousStageId = input.justCreated ? null : deal.stageId;
  if (!input.justCreated && previousStageId === input.stageId) {
    return { ok: true, changed: false };
  }

  if (!input.justCreated) {
    await db
      .update(deals)
      .set({ stageId: input.stageId, updatedAt: new Date() })
      .where(eq(deals.id, deal.id));
  }

  const [pipeline] = await db
    .select({ name: pipelines.name })
    .from(pipelines)
    .where(eq(pipelines.id, stage.pipelineId))
    .limit(1);
  const [previous] = previousStageId
    ? await db
        .select({ name: pipelineStages.name })
        .from(pipelineStages)
        .where(eq(pipelineStages.id, previousStageId))
        .limit(1)
    : [];
  const [contact] = await db
    .select({ name: contacts.name })
    .from(contacts)
    .where(eq(contacts.id, deal.contactId))
    .limit(1);

  const payload: DealStageChangedPayload = {
    dealId: deal.id,
    dealTitle: deal.title,
    contactName: contact?.name ?? "",
    pipelineId: stage.pipelineId,
    pipelineName: pipeline?.name ?? "",
    stageId: stage.id,
    stageName: stage.name,
    previousStageId,
    previousStageName: previous?.name ?? null,
  };

  await emitAutomationEvent({
    trigger: "deal.stage_changed",
    contactId: deal.contactId,
    payload: payload as unknown as Record<string, unknown>,
  });

  return { ok: true, changed: true };
}
