import { NextResponse } from "next/server";
import {
  getConversation,
  markConversationAsRead,
} from "@/lib/conversations";
import { requireMember } from "@/lib/api-auth";
import { canAccessContact } from "@/lib/team";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;

  const { conversationId } = await params;
  const { conversation, contact, messages } = await getConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Fio de um contato alheio (ou sem contato, se não é admin): como se não existisse.
  const accesible = contact
    ? canAccessContact(auth.member, contact)
    : auth.member.role === "admin";
  if (!accesible) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await markConversationAsRead(conversationId);
  return NextResponse.json({
    conversation,
    contact: contact
      ? {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          tags: contact.tags,
          notes: contact.notes,
          ownerId: contact.ownerId,
        }
      : null,
    messages,
  });
}
