import "server-only";
import { db } from "@/db";
import { channelAccounts } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import type { Channel, Provider } from "./types";

/**
 * Resolução de contas conectadas por canal. Espelha `whatsapp-accounts.ts`, que faz
 * o mesmo mas só para WhatsApp pela Meta direta:
 *  - Entrante (webhook): roteia-se por `zernioAccountId`.
 *  - Saída (envio/agente): resolve-se pela conversa ou por tenant + canal.
 */

export interface ChannelAccount {
  id: string;
  tenantId: string;
  provider: Provider;
  platform: Channel;
  /** Id da conta no Zernio: a chave de routing de entrada. */
  zernioAccountId: string | null;
  zernioProfileId: string | null;
  username: string | null;
  displayName: string | null;
  /** phone_number_id | page_id | ig_business_id, conforme a plataforma. */
  externalRef: string | null;
  status: string;
}

type Row = typeof channelAccounts.$inferSelect;

function mapRow(row: Row): ChannelAccount {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider as Provider,
    platform: row.platform as Channel,
    zernioAccountId: row.zernioAccountId,
    zernioProfileId: row.zernioProfileId,
    username: row.username,
    displayName: row.displayName,
    externalRef: row.externalRef,
    status: row.status,
  };
}

/** Routing de entrada: resolve a conta do CRM pelo accountId que o Zernio manda. */
export async function getAccountByZernioId(
  zernioAccountId: string | null | undefined
): Promise<ChannelAccount | null> {
  if (!zernioAccountId) return null;
  const [row] = await db
    .select()
    .from(channelAccounts)
    .where(eq(channelAccounts.zernioAccountId, zernioAccountId))
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function getAccountById(
  id: string | null | undefined
): Promise<ChannelAccount | null> {
  if (!id) return null;
  const [row] = await db
    .select()
    .from(channelAccounts)
    .where(eq(channelAccounts.id, id))
    .limit(1);
  return row ? mapRow(row) : null;
}

/**
 * Saída: conta ativa de um canal dentro de um tenant.
 *
 * Prioriza a conta do Zernio sobre qualquer resto da integração direta com a Meta.
 * Sem isto, um WhatsApp migrado ficaria com duas linhas e a mais velha (a da Meta, que
 * não tem `zernioAccountId`) ganharia por data, fazendo falhar todos os envios.
 */
export async function getAccountForChannel(
  tenantId: string | null | undefined,
  platform: Channel
): Promise<ChannelAccount | null> {
  if (!tenantId) return null;
  const rows = await db
    .select()
    .from(channelAccounts)
    .where(
      and(
        eq(channelAccounts.tenantId, tenantId),
        eq(channelAccounts.platform, platform),
        eq(channelAccounts.status, "active")
      )
    )
    .orderBy(asc(channelAccounts.createdAt));

  const preferred =
    rows.find((r) => r.provider === "zernio" && r.zernioAccountId) ?? rows[0];
  return preferred ? mapRow(preferred) : null;
}

export async function listAccounts(
  tenantId?: string | null
): Promise<ChannelAccount[]> {
  const rows = tenantId
    ? await db
        .select()
        .from(channelAccounts)
        .where(eq(channelAccounts.tenantId, tenantId))
        .orderBy(asc(channelAccounts.platform), asc(channelAccounts.createdAt))
    : await db
        .select()
        .from(channelAccounts)
        .orderBy(asc(channelAccounts.platform), asc(channelAccounts.createdAt));
  return rows.map(mapRow);
}

export interface UpsertChannelAccountInput {
  tenantId: string;
  platform: Channel;
  provider?: Provider;
  zernioAccountId?: string | null;
  zernioProfileId?: string | null;
  username?: string | null;
  displayName?: string | null;
  externalRef?: string | null;
  status?: string;
  connectedAt?: Date | null;
}

/**
 * Alta/atualização idempotente por `zernioAccountId`. Usam tanto o callback de
 * OAuth como o webhook `account.connected`, que podem chegar em qualquer ordem.
 */
export async function upsertZernioAccount(
  input: UpsertChannelAccountInput
): Promise<ChannelAccount | null> {
  if (!input.zernioAccountId) return null;

  const values = {
    tenantId: input.tenantId,
    provider: input.provider ?? ("zernio" as Provider),
    platform: input.platform,
    zernioAccountId: input.zernioAccountId,
    zernioProfileId: input.zernioProfileId ?? null,
    username: input.username ?? null,
    displayName: input.displayName ?? null,
    externalRef: input.externalRef ?? null,
    status: input.status ?? "active",
    connectedAt: input.connectedAt ?? new Date(),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(channelAccounts)
    .values(values)
    .onConflictDoUpdate({
      target: channelAccounts.zernioAccountId,
      set: {
        platform: values.platform,
        zernioProfileId: values.zernioProfileId,
        username: values.username,
        displayName: values.displayName,
        status: values.status,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return row ? mapRow(row) : null;
}

export async function markAccountStatus(
  zernioAccountId: string,
  status: string
): Promise<void> {
  await db
    .update(channelAccounts)
    .set({ status, updatedAt: new Date() })
    .where(eq(channelAccounts.zernioAccountId, zernioAccountId));
}
