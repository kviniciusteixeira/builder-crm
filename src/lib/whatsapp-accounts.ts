/**
 * Resolução de contas de WhatsApp por tenant. Substitui o modelo de
 * credenciais globais de env: cada número conectado vive em `whatsapp_accounts`.
 * - Entrante (webhook): roteia-se por `phone_number_id`.
 * - Saída (envio/agente): resolve-se com que conta responder via o tenant.
 */
import { db } from "@/db";
import { whatsappAccounts, contacts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface WhatsappAccount {
  id: string;
  tenantId: string;
  phoneNumberId: string;
  accessToken: string | null;
  wabaId: string | null;
  displayPhone: string | null;
}

function mapRow(row: typeof whatsappAccounts.$inferSelect): WhatsappAccount {
  return {
    id: row.id,
    tenantId: row.tenantId,
    phoneNumberId: row.phoneNumberId,
    accessToken: row.accessToken,
    wabaId: row.wabaId,
    displayPhone: row.displayPhone,
  };
}

/** Routing de entrada: resolve a conta do CRM pelo phone_number_id do webhook. */
export async function getAccountByPhoneNumberId(
  phoneNumberId: string | null | undefined
): Promise<WhatsappAccount | null> {
  if (!phoneNumberId) return null;
  const [row] = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.phoneNumberId, phoneNumberId))
    .limit(1);
  return row ? mapRow(row) : null;
}

/** Saída: primeira conta ativa de um tenant (Fase 1 = uma conta por tenant). */
export async function getAccountByTenant(
  tenantId: string | null | undefined
): Promise<WhatsappAccount | null> {
  if (!tenantId) return null;
  const [row] = await db
    .select()
    .from(whatsappAccounts)
    .where(
      and(
        eq(whatsappAccounts.tenantId, tenantId),
        eq(whatsappAccounts.status, "active")
      )
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

/** Saída: resolve a conta com a qual responder a um contato (via o seu tenant). */
export async function getAccountForContact(
  contactId: string
): Promise<WhatsappAccount | null> {
  const [contact] = await db
    .select({ tenantId: contacts.tenantId })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  return getAccountByTenant(contact?.tenantId);
}

/**
 * Conta ativa "principal" para operações não ligadas a um contato (ex.: ABM de
 * templates, que vivem no WABA). Fase 1 = single-tenant, devolve a primeira
 * conta ativa. Fase 2: resolver pelo tenant do usuário logado.
 */
export async function getPrimaryAccount(): Promise<WhatsappAccount | null> {
  const [row] = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.status, "active"))
    .limit(1);
  return row ? mapRow(row) : null;
}
