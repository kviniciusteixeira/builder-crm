import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/api-auth";
import { canAccessContact } from "@/lib/team";
import { documentContact, documentDownloadUrl, getDocument } from "@/lib/documents";

/**
 * Redireciona para uma URL assinada de um minuto. O link que se compartilha é este (estável e
 * com sessão), nunca o do bucket. `?dl=1` força o download; sem isso abre em aba.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const doc = await getDocument(id);
  const contact = doc ? await documentContact(doc) : null;
  if (!doc || doc.status !== "ready" || !contact || !canAccessContact(auth.member, contact)) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const inline = request.nextUrl.searchParams.get("dl") !== "1";
  const url = await documentDownloadUrl(doc, inline);
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
