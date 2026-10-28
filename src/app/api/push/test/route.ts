import { NextResponse } from "next/server";
import { requireMember } from "@/lib/api-auth";
import { sendPushToMember } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Envia um push de teste aos dispositivos do membro atual. */
export async function POST() {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;

  try {
    const outcome = await sendPushToMember(auth.member.id, {
      title: "Notificaciones activas",
      body: "Asi vas a recibir los avisos del CRM en este dispositivo.",
      url: "/settings",
      tag: "push-test",
    });
    return NextResponse.json(outcome);
  } catch (err) {
    // A mensagem do provedor de push pode trazer detalhes internos (endpoints,
    // chaves parciais): fica no log do servidor e para fora vai algo genérico.
    console.error("[push] fallo la notificacion de prueba:", err);
    return NextResponse.json(
      { error: "No se pudo enviar la notificacion de prueba" },
      { status: 500 }
    );
  }
}
