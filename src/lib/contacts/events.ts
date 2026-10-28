import "server-only";
import { emitAutomationEvent } from "@/lib/automations";
import type { ContactCreatedPayload } from "@/lib/automations/triggers";

/**
 * Emite `contact.created`. Chama-se de cada lugar que dá alta a um contato real
 * (formulário, webhook de leads, importação, e a ingestão de mensagens quando alguém
 * novo escreve). Nunca lança: uma falha aqui não deve quebrar a alta.
 */
export async function emitContactCreated(
  contactId: string,
  info: { name: string; source: string; channel?: string | null }
): Promise<void> {
  const payload: ContactCreatedPayload = {
    contactName: info.name,
    source: info.source,
    channel: info.channel ?? null,
  };
  try {
    await emitAutomationEvent({
      trigger: "contact.created",
      contactId,
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch (err) {
    console.error("[automations] contact.created fallo", err);
  }
}
