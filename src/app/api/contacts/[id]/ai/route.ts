import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canAccessContactId } from "@/lib/team";
import { requireMember } from "@/lib/api-auth";

interface Body {
  enabled?: boolean;
  clearNeedsHuman?: boolean;
}

/**
 * Toggle do agente de IA por contato.
 * - { enabled: true, clearNeedsHuman: true }  -> reativar bot (o mais comum, ex. cliente fechou caso humano)
 * - { enabled: false }                         -> desligar bot manualmente
 * - { clearNeedsHuman: true }                  -> só limpar a bandeira de "precisa de humano"
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { id } = await params;
  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!(await canAccessContactId(member, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const update: Partial<typeof contacts.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof body.enabled === "boolean") update.aiEnabled = body.enabled;
  if (body.clearNeedsHuman) {
    update.needsHuman = false;
    update.needsHumanReason = null;
    update.needsHumanAt = null;
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json(
      { error: "Nada para actualizar" },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(contacts)
    .set(update)
    .where(eq(contacts.id, id))
    .returning({
      id: contacts.id,
      aiEnabled: contacts.aiEnabled,
      needsHuman: contacts.needsHuman,
      needsHumanReason: contacts.needsHumanReason,
    });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
