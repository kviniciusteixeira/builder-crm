import { NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/api-auth";
import { correoDeAccesoActivo, enviarEnlaceDeAcceso } from "@/lib/auth-correo";

export const dynamic = "force-dynamic";

/**
 * Reenviar o acesso a um membro que já está na equipe (somente admin): chega um
 * e-mail com um link para definir a senha.
 *
 * É para o caso de todos os dias: perdeu a senha, nunca abriu o convite, ou
 * lhe passaram por um chat que já não encontra. Não muda nada até que a pessoa use
 * o link, então reenviá-lo duas vezes não quebra nada.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  if (!correoDeAccesoActivo()) {
    return NextResponse.json(
      { error: "Esta instancia no manda correos de acceso. Ver docs/CORREIO.md" },
      { status: 400 }
    );
  }

  const [miembro] = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.id, id))
    .limit(1);
  if (!miembro) {
    return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
  }
  if (!miembro.active) {
    return NextResponse.json(
      { error: "Esta persona esta desactivada: reactivala primero" },
      { status: 409 }
    );
  }

  // Um membro sem usuário de Auth não pode receber nada: acontece se alguém apagou o
  // usuário à mão. Melhor dizer isso do que mandar um e-mail para o vazio.
  const [usuario] = await db.execute<{ id: string }>(
    sql`select id from auth.users where id = ${id} limit 1`
  );
  if (!usuario) {
    return NextResponse.json(
      { error: "Esta persona no tiene usuario de acceso: quitala del equipo y volve a invitarla" },
      { status: 409 }
    );
  }

  const { error } = await enviarEnlaceDeAcceso(miembro.email);
  if (error) {
    return NextResponse.json({ error: `No se pudo enviar: ${error}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, email: miembro.email });
}
