import "server-only";
import { db } from "@/db";
import { agentConfigs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { resolveDefaultTenantId } from "@/lib/tenants";
import { CHANNELS, type Channel } from "@/lib/channels/types";
import { getEnabledToolNames, nombresDeTools } from "./tools";
import { getDefaultSystemPromptTemplate, getGlobalSystemPromptTemplate } from "./prompt";
import { getAgentModel } from "./openrouter";

/**
 * Configuração do agente POR CANAL.
 *
 * O pedido concreto foi "os agentes não devem ser iguais": o que responde um DM de
 * Instagram não pode ter o mesmo prompt que o de WhatsApp. A resolução é em
 * cascata, assim nada do que já estava configurado se quebra:
 *
 *   agent_configs[canal]  ->  crm_settings['agent.*'] (global)  ->  default do código
 */

export interface ResolvedAgentConfig {
  channel: Channel;
  enabled: boolean;
  systemPrompt: string;
  enabledTools: string[];
  model: string;
  /** true se o valor vem do global e não de uma config própria do canal. */
  promptInherited: boolean;
  toolsInherited: boolean;
  modelInherited: boolean;
}

export async function getAgentConfig(
  channel: Channel
): Promise<ResolvedAgentConfig> {
  const tenantId = await resolveDefaultTenantId();

  const row = tenantId ? await readRow(tenantId, channel) : null;

  const ownPrompt = row?.systemPrompt?.trim();
  const ownTools = row?.enabledTools;
  const ownModel = row?.model?.trim();

  return {
    channel,
    // Sem linha, o WhatsApp fica ligado (comportamento atual) e os canais novos
    // também: a linha da migração os cria explicitamente em false.
    enabled: row?.enabled ?? true,
    systemPrompt: ownPrompt || (await getGlobalSystemPromptTemplate()),
    enabledTools: ownTools?.length
      ? filterValidTools(ownTools)
      : await getEnabledToolNames(),
    model: ownModel || getAgentModel(),
    promptInherited: !ownPrompt,
    toolsInherited: !ownTools?.length,
    modelInherited: !ownModel,
  };
}

async function readRow(tenantId: string, channel: Channel) {
  const [row] = await db
    .select()
    .from(agentConfigs)
    .where(
      and(eq(agentConfigs.tenantId, tenantId), eq(agentConfigs.channel, channel))
    )
    .limit(1);
  return row ?? null;
}

function filterValidTools(names: string[]): string[] {
  const validos = new Set(nombresDeTools());
  return names.filter((n) => validos.has(n));
}

export interface AgentConfigPatch {
  enabled?: boolean;
  /** null volta a herdar do global. */
  systemPrompt?: string | null;
  enabledTools?: string[] | null;
  model?: string | null;
}

export async function saveAgentConfig(
  channel: Channel,
  patch: AgentConfigPatch
): Promise<ResolvedAgentConfig | null> {
  const tenantId = await resolveDefaultTenantId();
  if (!tenantId) return null;

  const values = {
    tenantId,
    channel,
    enabled: patch.enabled ?? true,
    systemPrompt: patch.systemPrompt?.trim() || null,
    enabledTools: patch.enabledTools?.length
      ? filterValidTools(patch.enabledTools)
      : null,
    model: patch.model?.trim() || null,
    updatedAt: new Date(),
  };

  await db
    .insert(agentConfigs)
    .values(values)
    .onConflictDoUpdate({
      target: [agentConfigs.tenantId, agentConfigs.channel],
      set: {
        ...(patch.enabled !== undefined ? { enabled: values.enabled } : {}),
        ...(patch.systemPrompt !== undefined
          ? { systemPrompt: values.systemPrompt }
          : {}),
        ...(patch.enabledTools !== undefined
          ? { enabledTools: values.enabledTools }
          : {}),
        ...(patch.model !== undefined ? { model: values.model } : {}),
        updatedAt: values.updatedAt,
      },
    });

  return getAgentConfig(channel);
}

/** Volta a herdar tudo do global sem apagar o on/off do canal. */
export async function resetAgentConfig(
  channel: Channel
): Promise<ResolvedAgentConfig | null> {
  return saveAgentConfig(channel, {
    systemPrompt: null,
    enabledTools: null,
    model: null,
  });
}

export async function listAgentConfigs(): Promise<ResolvedAgentConfig[]> {
  return Promise.all(CHANNELS.map((c) => getAgentConfig(c)));
}

export { getDefaultSystemPromptTemplate };
