/**
 * Inicialização do servidor (o Next.js o chama uma vez por processo).
 *
 * - Avisa no log que variáveis obrigatórias faltam (sem valores).
 * - Fora da Vercel, liga as varreduras de recuperação no processo.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { envFaltantes } = await import("./lib/env");
  const faltan = envFaltantes();
  if (faltan.length > 0) {
    console.error(`[boot] faltan variables obligatorias: ${faltan.join(", ")} (ver .env.example)`);
  }

  const { erroresConfig } = await import("./lib/config");
  const problemas = erroresConfig();
  if (problemas.length > 0) {
    console.error(`[boot] config/cliente.ts invalido:\n${problemas.map((p) => `  - ${p}`).join("\n")}`);
  } else if (faltan.length === 0) {
    // O pipeline de config/cliente.ts existe na base antes de atender a primeira
    // request. Se a base não está, avisa-se e o app sobe mesmo assim.
    try {
      const { sincronizarPipeline } = await import("./lib/pipeline/sincronizar");
      const r = await sincronizarPipeline();
      console.log(`[boot] pipeline sincronizado: ${r.creadas} creadas, ${r.actualizadas} actualizadas, ${r.conservadas} conservadas`);
    } catch (err) {
      console.error("[boot] no se pudo sincronizar el pipeline:", err instanceof Error ? err.message : err);
    }
  }

  if (process.env.VERCEL || process.env.SWEEPERS_DISABLED === "true") return;
  const { iniciarBarridos } = await import("./lib/barridos");
  iniciarBarridos();
}
