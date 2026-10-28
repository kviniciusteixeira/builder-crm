import "server-only";
import { NextResponse } from "next/server";
import { getCurrentMember, type TeamMember } from "@/lib/team";

/**
 * Guardas para route handlers. Devolvem o membro ou a resposta de erro já
 * montada, para que cada rota seja:
 *
 *   const auth = await requireMember();
 *   if ("response" in auth) return auth.response;
 *   const { member } = auth;
 */

type Guard = { member: TeamMember } | { response: NextResponse };

export async function requireMember(): Promise<Guard> {
  const member = await getCurrentMember();
  if (!member) {
    return {
      response: NextResponse.json(
        { error: "No tienes acceso. Pide a un administrador que te agregue al equipo." },
        { status: 403 }
      ),
    };
  }
  return { member };
}

export async function requireAdmin(): Promise<Guard> {
  const auth = await requireMember();
  if ("response" in auth) return auth;
  if (auth.member.role !== "admin") {
    return {
      response: NextResponse.json(
        { error: "Solo un administrador puede hacer esto." },
        { status: 403 }
      ),
    };
  }
  return auth;
}
