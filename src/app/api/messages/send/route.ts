import { NextRequest, NextResponse } from "next/server";
import { deliverMessage } from "@/lib/channels/deliver";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canAccessContactId } from "@/lib/team";
import { requireMember } from "@/lib/api-auth";

/**
 * Envio genérico por conversa: serve para WhatsApp, Instagram e Messenger.
 * Substitui o `/api/whatsapp/send` do chat, que raciocinava por telefone e por isso
 * bloqueava os canais onde não há telefone.
 */

export const dynamic = "force-dynamic";

interface SendBody {
  conversationId?: string;
  text?: string;
  template?: {
    name: string;
    language?: string;
    components?: unknown[];
    previewText?: string;
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  let body: SendBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  if (!body.conversationId) {
    return NextResponse.json(
      { error: "Campo 'conversationId' requerido" },
      { status: 400 }
    );
  }
  if (!body.text?.trim() && !body.template) {
    return NextResponse.json(
      { error: "Tenes que enviar 'text' o 'template'" },
      { status: 400 }
    );
  }

  // Um assessor só escreve em fios dos seus contatos (404: não se confirma que exista).
  const [conv] = await db
    .select({ contactId: conversations.contactId })
    .from(conversations)
    .where(eq(conversations.id, body.conversationId))
    .limit(1);
  if (!conv || (conv.contactId && !(await canAccessContactId(member, conv.contactId)))) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  const result = await deliverMessage(
    body.conversationId,
    body.template ? { template: body.template } : { text: body.text },
    body.template ? "template" : "human"
  );

  if (!result.ok) {
    const status = result.error === "conversation_not_found" ? 404 : 502;
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        hint: result.hint,
        messageId: result.messageId,
      },
      { status }
    );
  }

  return NextResponse.json({
    success: true,
    messageId: result.messageId,
    externalId: result.externalId,
  });
}
