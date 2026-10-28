import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { canAccessContact } from "@/lib/team";
import { deleteConversation, getConversation } from "@/lib/conversations";

/**
 * DELETE /api/conversations/:id — exclui o fio e suas mensagens.
 *
 * Somente admin: um assessor não deveria poder excluir o histórico de atendimento, nem mesmo o
 * dos próprios contatos. Um fio que o admin não pode ver responde 404, igual ao
 * resto das rotas.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { conversationId } = await params;

  const { conversation, contact } = await getConversation(conversationId);
  const accesible = contact ? canAccessContact(auth.member, contact) : true;
  if (!conversation || !accesible) {
    return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  }

  const result = await deleteConversation(conversationId);
  if (!result.deleted) {
    return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ success: true, messages: result.messages });
}
