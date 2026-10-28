import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { sql } from "drizzle-orm";
import { requireAdmin, requireMember } from "@/lib/api-auth";
import { listMembers } from "@/lib/team";
import { createAdminClient } from "@/lib/supabase/admin";
import { correoDeAccesoActivo, enviarEnlaceDeAcceso, invitarPorCorreo } from "@/lib/auth-correo";

export const dynamic = "force-dynamic";

/** Lista da equipe. Qualquer membro a vê (para o seletor de proprietário). */
export async function GET() {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await listMembers());
}

/**
 * Cadastro de um membro (somente admin). Cria o usuário no Supabase Auth e o adiciona à
 * equipe. Não passa pelo signup público, que está fechado.
 *
 * Duas formas de dar acesso, segundo `invitar`:
 *   - convite por e-mail: a pessoa recebe um link e escolhe a própria senha.
 *     Só se a instância declara que o servidor de autenticação envia e-mails.
 *   - senha temporária (ou nenhuma, se entra com um provedor externo): o admin a
 *     passa por onde quiser. É o único caminho quando não há e-mail configurado.
 *
 * Se o e-mail já tem usuário no Auth (cadastrou-se antes, ou entrou com o Google),
 * reutiliza-se esse usuário e a senha que vier é ignorada.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  let body: { email?: string; name?: string; role?: string; password?: string; invitar?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const role = body.role === "admin" ? "admin" : "asesor";
  const password = body.password ?? "";
  // O interruptor manda sobre o que o navegador peça: sem e-mail configurado, um
  // "convite enviado" seria mentira (ver src/lib/auth-correo.ts).
  const invitar = Boolean(body.invitar) && correoDeAccesoActivo();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email invalido" }, { status: 400 });
  }

  // Usuário de Auth existente?
  const [existing] = await db.execute<{ id: string }>(
    sql`select id from auth.users where lower(email) = ${email} limit 1`
  );

  let userId = existing?.id ?? null;
  let correoEnviado = false;
  let avisoCorreo: string | null = null;

  if (!userId && invitar) {
    // O GoTrue cria o usuário e envia o e-mail na mesma transação: se o envio
    // falha, não fica nenhum usuário pela metade e o erro pode ser mostrado tal qual.
    const r = await invitarPorCorreo(email, name);
    if ("error" in r) {
      return NextResponse.json(
        { error: `No se pudo enviar la invitacion: ${r.error}` },
        { status: 502 }
      );
    }
    userId = r.userId;
    correoEnviado = true;
  }

  if (!userId) {
    // A senha é opcional: se a equipe entra com um provedor externo (Google e
    // similares), inventar uma temporária só acrescenta algo que ninguém vai usar. Sem
    // senha a conta existe e entra pelo provedor; com senha, pelos dois.
    if (password && password.length < 8) {
      return NextResponse.json(
        { error: "La contrasena temporal debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: password || undefined,
      email_confirm: true,
      user_metadata: { full_name: name || null },
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "No se pudo crear el usuario" },
        { status: 502 }
      );
    }
    userId = data.user.id;
  }

  // Usuário que já existia e o admin pediu para avisá-lo: não dá para convidar duas vezes,
  // manda-se um link para definir a senha. Se o envio falha, o cadastro mesmo assim
  // vale: avisa-se e o admin passa o acesso por outro lado.
  if (existing && invitar) {
    const { error } = await enviarEnlaceDeAcceso(email);
    if (error) avisoCorreo = error;
    else correoEnviado = true;
  }

  const [row] = await db
    .insert(teamMembers)
    .values({ id: userId, email, name: name || null, role, active: true })
    .onConflictDoUpdate({
      target: teamMembers.id,
      set: { name: name || null, role, active: true, updatedAt: new Date() },
    })
    .returning();

  return NextResponse.json(
    { ...row, reusedAuthUser: Boolean(existing), correoEnviado, avisoCorreo },
    { status: 201 }
  );
}
