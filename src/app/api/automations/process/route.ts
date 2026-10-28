import { NextRequest, NextResponse } from "next/server";
import { processStaleRuns } from "@/lib/automations";
import { autorizadoPorSecreto } from "@/lib/secreto-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sweeper de automações. O caminho normal é `after()` logo depois do
 * evento; isto retoma o que ficou `pending` se essa função morreu. O cron do
 * GitHub Actions o chama, com o mesmo segredo que o worker do agente.
 */
export async function GET(request: NextRequest) {
  if (!autorizadoPorSecreto(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reprocessed = await processStaleRuns();
  return NextResponse.json({ ok: true, reprocessed });
}
