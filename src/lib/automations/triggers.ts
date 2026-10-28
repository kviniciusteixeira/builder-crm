import "server-only";
import { db } from "@/db";
import { pipelineStages, pipelines } from "@/db/schema";
import { asc } from "drizzle-orm";
import { SOURCE_LABELS } from "@/lib/constants";
import { CHANNEL_LABELS } from "@/lib/channels/types";
import { displayName, listMembers } from "@/lib/team";

/**
 * Catálogo de gatilhos: O QUE pode iniciar uma regra e com que dados.
 *
 * Cada gatilho declara os campos pelos quais se pode filtrar e de onde saem
 * as opções (pipelines, etapas, assessores, fontes). A UI do construtor lê isto
 * por `GET /api/automations/catalog`; o motor o usa para avaliar filtros.
 *
 * Para adicionar um: uma entrada aqui + um `emitAutomationEvent` no lugar do código
 * onde a coisa acontece (ver `src/lib/deals/stage.ts` e `src/lib/contacts/events.ts`).
 */

export type TriggerKey = "contact.created" | "contact.assigned" | "deal.stage_changed";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FilterField {
  key: string;
  label: string;
  options: () => Promise<SelectOption[]>;
}

export interface TriggerDef {
  key: TriggerKey;
  label: string;
  description: string;
  filterFields: FilterField[];
  /** Placeholders que as ações podem usar nos seus textos com este gatilho. */
  placeholders: string[];
}

export type FilterOp = "eq" | "neq" | "in";

export interface AutomationFilter {
  field: string;
  op: FilterOp;
  value: string | string[];
}

/** O que viaja com cada evento. `payload` é específico do gatilho. */
export interface AutomationEvent {
  trigger: TriggerKey;
  contactId: string | null;
  payload: Record<string, unknown>;
  /**
   * Profundidade de encadeamento. Uma ação que por sua vez emite (atribuir assessor ->
   * contact.assigned) soma 1. Passado o teto, o motor ignora o evento: é a guarda
   * contra regras que se disparam entre si para sempre.
   */
  depth?: number;
}

export const MAX_EVENT_DEPTH = 3;

// ---------------------------------------------------------------------------
// Payloads por gatilho
// ---------------------------------------------------------------------------

export interface ContactCreatedPayload {
  contactName: string;
  source: string;
  /** whatsapp | instagram | facebook quando o contato nasceu de uma mensagem. */
  channel?: string | null;
}

export interface ContactAssignedPayload {
  contactName: string;
  ownerId: string | null;
  previousOwnerId: string | null;
  assignedBy: { type: "member"; memberId: string; name: string } | { type: "agent" };
}

export interface DealStageChangedPayload {
  dealId: string;
  dealTitle: string;
  contactName: string;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  /** null quando a operação acaba de se criar: "lead colocado no pipeline". */
  previousStageId: string | null;
  previousStageName: string | null;
}

// ---------------------------------------------------------------------------
// Opções
// ---------------------------------------------------------------------------

async function memberOptions(): Promise<SelectOption[]> {
  const members = await listMembers({ onlyActive: true });
  return members.map((m) => ({ value: m.id, label: displayName(m) }));
}

async function pipelineOptions(): Promise<SelectOption[]> {
  const rows = await db.select().from(pipelines).orderBy(asc(pipelines.order));
  return rows.map((p) => ({ value: p.id, label: p.name }));
}

/** Etapas de todos os pipelines, etiquetadas "Pipeline › Etapa" para que não se confundam. */
async function stageOptions(): Promise<SelectOption[]> {
  const [ps, stages] = await Promise.all([
    db.select().from(pipelines).orderBy(asc(pipelines.order)),
    db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)),
  ]);
  const nameOf = new Map(ps.map((p) => [p.id, p.name]));
  const varios = ps.length > 1;
  return stages.map((s) => ({
    value: s.id,
    label: varios ? `${nameOf.get(s.pipelineId) ?? "?"} › ${s.name}` : s.name,
  }));
}

async function sourceOptions(): Promise<SelectOption[]> {
  return Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }));
}

async function channelOptions(): Promise<SelectOption[]> {
  return Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }));
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const TRIGGERS: TriggerDef[] = [
  {
    key: "deal.stage_changed",
    label: "Etapa del pipeline",
    description:
      "Se activa cuando una operacion entra al pipeline o cambia de etapa. Filtra por pipeline y etapa para reaccionar solo a un movimiento concreto.",
    filterFields: [
      { key: "pipelineId", label: "Pipeline", options: pipelineOptions },
      { key: "stageId", label: "Etapa (nueva)", options: stageOptions },
      { key: "previousStageId", label: "Etapa anterior", options: stageOptions },
    ],
    placeholders: ["contacto", "etapa", "etapa_anterior", "pipeline", "operacion", "asesor"],
  },
  {
    key: "contact.assigned",
    label: "Contacto asignado a un asesor",
    description:
      "Se activa cuando se asigna (o cambia) el asesor a cargo de un contacto, desde la ficha o por el agente de IA.",
    filterFields: [{ key: "ownerId", label: "Asesor asignado", options: memberOptions }],
    placeholders: ["contacto", "asesor", "quien"],
  },
  {
    key: "contact.created",
    label: "Lead nuevo",
    description:
      "Se activa cuando entra un contacto nuevo: por un mensaje, por el webhook, por importacion o creado a mano.",
    filterFields: [
      { key: "source", label: "Fuente", options: sourceOptions },
      { key: "channel", label: "Canal", options: channelOptions },
    ],
    placeholders: ["contacto", "fuente"],
  },
];

export function triggerFor(key: string): TriggerDef | undefined {
  return TRIGGERS.find((t) => t.key === key);
}

/**
 * Avalia os filtros de uma regra contra o payload do evento. Sem filtros = passa.
 * Puro: sem DB, para poder testá-lo solto.
 */
export function evaluateFilters(
  filters: AutomationFilter[] | null | undefined,
  payload: Record<string, unknown>
): boolean {
  if (!filters || filters.length === 0) return true;

  return filters.every((f) => {
    const actual = payload[f.field];
    const actualStr = actual === null || actual === undefined ? "" : String(actual);
    const wanted = Array.isArray(f.value) ? f.value.map(String) : [String(f.value)];

    switch (f.op) {
      case "eq":
        return wanted.length > 0 && actualStr === wanted[0];
      case "neq":
        return wanted.length > 0 && actualStr !== wanted[0];
      case "in":
        return wanted.includes(actualStr);
      default:
        return false;
    }
  });
}

/** Normaliza o que chega do cliente a filtros válidos para esse gatilho. */
export function sanitizeFilters(trigger: TriggerDef, raw: unknown): AutomationFilter[] {
  if (!Array.isArray(raw)) return [];
  const fields = new Set(trigger.filterFields.map((f) => f.key));
  const out: AutomationFilter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { field, op, value } = item as Record<string, unknown>;
    if (typeof field !== "string" || !fields.has(field)) continue;
    if (op !== "eq" && op !== "neq" && op !== "in") continue;
    if (Array.isArray(value)) {
      const vals = value.filter((v): v is string => typeof v === "string" && v !== "");
      if (vals.length === 0) continue;
      out.push({ field, op, value: op === "in" ? vals : vals[0] });
    } else if (typeof value === "string" && value !== "") {
      out.push({ field, op, value: op === "in" ? [value] : value });
    }
  }
  return out;
}
