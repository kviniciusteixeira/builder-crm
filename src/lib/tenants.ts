import "server-only";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Tenant padrão. O CRM é single-tenant por agora: a migração da Fase 1 de
 * WhatsApp Coexistence fez backfill de tudo no tenant com slug 'default'.
 *
 * Estava duplicado dentro do webhook do GHL; os ingressos do Zernio também
 * precisam, então vive aqui.
 */
let cached: string | null = null;

export async function resolveDefaultTenantId(): Promise<string | null> {
  if (cached) return cached;
  const [row] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, "default"))
    .limit(1);
  cached = row?.id ?? null;
  return cached;
}
