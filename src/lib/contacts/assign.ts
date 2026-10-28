import "server-only";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { emitAutomationEvent } from "@/lib/automations";
import type { ContactAssignedPayload } from "@/lib/automations/triggers";
import { displayName, getMember, type TeamMember } from "@/lib/team";

/**
 * Atribui (ou desatribui) o proprietário de um contato.
 *
 * É o ÚNICO caminho: a ficha do contato, o painel da conversa e a tool
 * `asignar_asesor` do agente passam todos por aqui. Assim o evento `contact.assigned`
 * se emite uma única vez e da mesma forma, venha de onde vier.
 */

export type AssignedBy =
  | { type: "member"; member: TeamMember }
  | { type: "agent" }
  | { type: "automation" };

export interface AssignResult {
  ok: boolean;
  /** true se o proprietário já era esse: não se toca nada nem se emite evento. */
  unchanged?: boolean;
  owner: TeamMember | null;
  error?: string;
}

export async function assignContact(input: {
  contactId: string;
  ownerId: string | null;
  by: AssignedBy;
  /** Guarda-se na atividade, para que fique por que se atribuiu. */
  reason?: string;
  /** Profundidade do evento quando a atribuição vem de outra automação. */
  depth?: number;
}): Promise<AssignResult> {
  const [contact] = await db
    .select({ id: contacts.id, name: contacts.name, ownerId: contacts.ownerId })
    .from(contacts)
    .where(eq(contacts.id, input.contactId))
    .limit(1);

  if (!contact) return { ok: false, owner: null, error: "Contacto no encontrado" };

  let owner: TeamMember | null = null;
  if (input.ownerId) {
    owner = await getMember(input.ownerId);
    if (!owner) return { ok: false, owner: null, error: "El asesor no existe" };
    if (!owner.active) {
      return { ok: false, owner: null, error: "El asesor esta inactivo" };
    }
  }

  if (contact.ownerId === input.ownerId) {
    return { ok: true, unchanged: true, owner };
  }

  const now = new Date();
  await db
    .update(contacts)
    .set({
      ownerId: input.ownerId,
      assignedAt: input.ownerId ? now : null,
      updatedAt: now,
    })
    .where(eq(contacts.id, contact.id));

  const byLabel =
    input.by.type === "agent"
      ? "el agente de IA"
      : input.by.type === "automation"
        ? "una automatizacion"
        : displayName(input.by.member);
  const description = owner
    ? `Asignado a ${displayName(owner)} por ${byLabel}` +
      (input.reason ? `. Motivo: ${input.reason}` : "")
    : `Se quito el propietario (${byLabel})`;

  await db.insert(activities).values({
    type: "note",
    description,
    contactId: contact.id,
  });

  const payload: ContactAssignedPayload = {
    contactName: contact.name,
    ownerId: input.ownerId,
    previousOwnerId: contact.ownerId,
    assignedBy:
      input.by.type === "member"
        ? {
            type: "member",
            memberId: input.by.member.id,
            name: displayName(input.by.member),
          }
        : { type: "agent" },
  };

  await emitAutomationEvent({
    trigger: "contact.assigned",
    contactId: contact.id,
    payload: payload as unknown as Record<string, unknown>,
    depth: input.depth ?? 0,
  });

  return { ok: true, owner };
}
