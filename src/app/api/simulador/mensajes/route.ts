import { NextRequest, NextResponse } from "next/server";
import { moduloActivo } from "@/lib/config";
import { autorizarSimulador, enviarMensajeSimulado } from "@/lib/simulador";

export const dynamic = "force-dynamic";
// Um turno do agente demora entre 5 e 30 s (LLM + tools); espera-se na mesma chamada.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!moduloActivo("simulador")) {
    return NextResponse.json({ error: "Simulador desactivado" }, { status: 404 });
  }
  const auth = await autorizarSimulador(request);
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as { conversationId?: unknown; texto?: unknown } | null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const texto = typeof body?.texto === "string" ? body.texto.trim() : "";
  if (!conversationId || !texto) {
    return NextResponse.json({ error: "conversationId y texto son requeridos" }, { status: 400 });
  }

  // O agente não poder responder NÃO é um erro desta rota: a mensagem entrou no
  // CRM mesmo assim e volta na resposta com `agente.ok === false` e o motivo. Aqui só
  // ficam os dois casos em que não há nada para simular.
  const r = await enviarMensajeSimulado({ conversationId, texto: texto.slice(0, 4000) });
  if ("error" in r) {
    const mensaje =
      r.error === "no_simulada" ? "Esa conversacion no es del simulador." : "Conversacion no encontrada.";
    return NextResponse.json({ error: r.error, mensaje }, { status: r.error === "no_encontrada" ? 404 : 400 });
  }
  return NextResponse.json(r);
}
