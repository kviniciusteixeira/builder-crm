import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { APP_VERSION, BUILD_COMMIT } from "@/lib/version";
import { envFaltantes } from "@/lib/env";
import { erroresConfig } from "@/lib/config";
import { modoLocal } from "@/lib/modo-local";
import { correoDeAccesoActivo } from "@/lib/auth-correo";

export const dynamic = "force-dynamic";

/**
 * Health check público (sem sessão). O HEALTHCHECK do contêiner, o Coolify
 * e `scripts/verificar-instancia.mjs` o usam.
 *
 *   200 {"ok":true,"version":"1.0.0","commit":"abc1234","db":"ok","correo":false}
 *   503 {"ok":false,"error":"db_unavailable" | "env_invalida","faltan":[...]}
 *
 * Nunca expõe valores de variáveis, só nomes das que faltam.
 */
export async function GET() {
  const faltan = envFaltantes();
  if (faltan.length > 0) {
    return NextResponse.json(
      { ok: false, version: APP_VERSION, commit: BUILD_COMMIT, error: "env_invalida", faltan },
      { status: 503 }
    );
  }

  const problemas = erroresConfig();
  if (problemas.length > 0) {
    return NextResponse.json(
      { ok: false, version: APP_VERSION, commit: BUILD_COMMIT, error: "config_invalida", detalle: problemas },
      { status: 503 }
    );
  }

  try {
    const { db } = await import("@/db");
    await db.execute(sql`select 1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[health] base no disponible:", message);
    return NextResponse.json(
      { ok: false, version: APP_VERSION, commit: BUILD_COMMIT, error: "db_unavailable" },
      { status: 503 }
    );
  }

  // `correo` é uma capacidade, não um segredo: `verificar-instancia.mjs` o usa para
  // dizer se esta instância pode convidar por e-mail ou se distribui senhas à mão.
  return NextResponse.json({
    ok: true,
    version: APP_VERSION,
    commit: BUILD_COMMIT,
    db: "ok",
    correo: correoDeAccesoActivo(),
    // Para que ninguém confunda uma instância de verdade com alguém testando no próprio PC.
    modoLocal: modoLocal(),
  });
}
