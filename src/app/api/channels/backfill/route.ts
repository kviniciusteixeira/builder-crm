import { NextRequest, NextResponse } from "next/server";
import { backfillFromZernio } from "@/lib/channels/backfill";
import { isChannel } from "@/lib/channels/types";
import { requireMember } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
// Percorrer centenas de fios e suas mensagens não cabe no timeout padrão.
export const maxDuration = 300;

/**
 * Importa o histórico que o Zernio já replicou ao conectar a conta. Não dispara o
 * agente: ver a nota em `src/lib/channels/backfill.ts`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;
  const channel = request.nextUrl.searchParams.get("channel");
  const result = await backfillFromZernio({
    channel: isChannel(channel) ? channel : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
