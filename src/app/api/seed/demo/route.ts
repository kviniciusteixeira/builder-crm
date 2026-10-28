import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/team";
import { cargarDatosDemo } from "@/lib/seed-demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Carrega os dados de demonstração. Aceita um admin com sessão (botão do início) ou o
 * segredo do worker como Bearer (scripts/seed-demo.mjs e a skill deploy-coolify).
 * Idempotente: uma segunda chamada não duplica nada.
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.AGENT_WORKER_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const porSecreto = Boolean(secreto) && bearer === secreto;

  if (!porSecreto) {
    const member = await getCurrentMember();
    if (!member || member.role !== "admin") {
      return NextResponse.json({ error: "Solo un administrador puede cargar la demo" }, { status: 403 });
    }
  }

  try {
    const resultado = await cargarDatosDemo();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("[seed] fallo:", err);
    // Um erro do Postgres traz nomes de tabelas e restrições: não sai daqui.
    console.error("[seed] fallo cargando la demo:", err);
    return NextResponse.json({ ok: false, error: "No se pudieron cargar los datos demo" }, { status: 500 });
  }
}
