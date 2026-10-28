import "server-only";
import { listAccounts as listZernioAccounts, accountIdOf } from "@/lib/zernio/accounts";
import { resolveDefaultTenantId } from "@/lib/tenants";
import { listAccounts, upsertZernioAccount, type ChannelAccount } from "./accounts";
import { isChannel } from "./types";

/**
 * Sincroniza as contas conectadas no Zernio para `channel_accounts`.
 *
 * O webhook `account.connected` faz o mesmo de forma idempotente, mas não basta:
 * as contas conectadas antes de dar alta ao webhook nunca dispararam o evento.
 */
export async function syncAccountsFromZernio(): Promise<{
  ok: boolean;
  synced: number;
  skipped: number;
  error?: string;
}> {
  const tenantId = await resolveDefaultTenantId();
  if (!tenantId) {
    return { ok: false, synced: 0, skipped: 0, error: "No existe el tenant default" };
  }

  const result = await listZernioAccounts();
  if (!result.success) {
    return { ok: false, synced: 0, skipped: 0, error: result.error.message };
  }

  let synced = 0;
  let skipped = 0;

  for (const account of result.data.data ?? []) {
    // O Zernio suporta 16 plataformas; o CRM modela três. O resto se ignora em vez de
    // criar linhas de canais que a UI não sabe renderizar.
    if (!isChannel(account.platform)) {
      skipped++;
      continue;
    }
    const id = accountIdOf(account);
    if (!id) {
      skipped++;
      continue;
    }

    await upsertZernioAccount({
      tenantId,
      platform: account.platform,
      zernioAccountId: id,
      zernioProfileId: account.profileId ?? null,
      username: account.username ?? null,
      displayName: account.displayName ?? account.name ?? null,
      status: account.status ?? "active",
    });
    synced++;
  }

  return { ok: true, synced, skipped };
}

export async function listChannelAccounts(): Promise<ChannelAccount[]> {
  const tenantId = await resolveDefaultTenantId();
  return listAccounts(tenantId);
}
