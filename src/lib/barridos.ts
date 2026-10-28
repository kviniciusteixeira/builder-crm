/**
 * Varreduras de recuperação dentro do processo (para Coolify / docker / qualquer host
 * com um processo Node vivo).
 *
 * O caminho normal não precisa disto: uma mensagem entrante se responde em ~7 s pelo
 * webhook e `after()`. Mas se esse `after()` morre no meio do caminho, ficam jobs do
 * agente, eventos de webhook e execuções de automação pela metade. Estas
 * varreduras batem a cada SWEEP_INTERVAL_MIN (default 30) nos mesmos endpoints que
 * usava o cron do GitHub Actions, com o mesmo segredo. Na Vercel não rodam (aí
 * manda vercel.json + .github/workflows/sweepers.yml).
 */

const ENDPOINTS = [
  "/api/agent/process",
  "/api/webhooks/zernio",
  "/api/automations/process",
];

declare global {
  var __builderBarridos: ReturnType<typeof setInterval> | undefined;
}

export function iniciarBarridos() {
  if (globalThis.__builderBarridos) return;

  const secreto = process.env.AGENT_WORKER_SECRET;
  if (!secreto) {
    console.warn("[barridos] AGENT_WORKER_SECRET vacio: los barridos no arrancan");
    return;
  }

  const minutos = Number(process.env.SWEEP_INTERVAL_MIN) || 30;
  const base = `http://127.0.0.1:${process.env.PORT || 3000}`;

  const correr = async () => {
    for (const ruta of ENDPOINTS) {
      try {
        const res = await fetch(base + ruta, {
          headers: { authorization: `Bearer ${secreto}` },
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) console.warn(`[barridos] ${ruta} -> ${res.status}`);
      } catch (err) {
        console.warn(`[barridos] ${ruta} fallo:`, err instanceof Error ? err.message : err);
      }
    }
  };

  // Primeira varredura ao minuto de arrancar (deixa que o servidor termine de subir).
  const primero = setTimeout(correr, 60_000);
  primero.unref?.();
  globalThis.__builderBarridos = setInterval(correr, minutos * 60_000);
  globalThis.__builderBarridos.unref?.();
  console.log(`[barridos] activos cada ${minutos} min`);
}
