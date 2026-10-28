import "server-only";
import { db } from "@/db";
import { pipelines, pipelineStages, deals } from "@/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getConfig } from "@/lib/config";

/**
 * Leva o pipeline padrão ao estado que descreve config/cliente.ts.
 *
 * Roda ao iniciar (instrumentation.ts) e é idempotente:
 *  - Se não há pipeline padrão, cria-o com o nome da config.
 *  - Cada etapa da config se busca por `key`; se ainda não tem key, por nome
 *    (para adotar as etapas que já existiam antes da config); se não existe, cria-se.
 *  - Nome, cor, ordem e ganha/perdida se atualizam a partir da config.
 *  - As etapas que estão na base mas NÃO na config se conservam (podem ter
 *    operações) e se ordenam depois; apagam-se só se não têm operações e
 *    `borrarSobrantes` é true (não é o default).
 *
 * A UI continua podendo criar etapas à mão; essas ficam sem key e sobrevivem.
 */
export async function sincronizarPipeline(opts?: { borrarSobrantes?: boolean }) {
  const { pipeline } = getConfig();

  let [principal] = await db
    .select()
    .from(pipelines)
    .where(eq(pipelines.isDefault, true))
    .limit(1);

  if (!principal) {
    [principal] = await db
      .insert(pipelines)
      .values({ name: pipeline.nombre, isDefault: true, order: 0 })
      .returning();
  } else if (principal.name !== pipeline.nombre) {
    await db
      .update(pipelines)
      .set({ name: pipeline.nombre, updatedAt: new Date() })
      .where(eq(pipelines.id, principal.id));
  }

  const existentes = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, principal.id))
    .orderBy(asc(pipelineStages.order));

  const porClave = new Map(existentes.filter((e) => e.key).map((e) => [e.key as string, e]));
  const sinClave = existentes.filter((e) => !e.key);
  const usadas = new Set<string>();
  let creadas = 0;
  let actualizadas = 0;

  for (let i = 0; i < pipeline.etapas.length; i++) {
    const etapa = pipeline.etapas[i];
    let fila = porClave.get(etapa.clave);
    if (!fila) {
      const idx = sinClave.findIndex(
        (e) => e.name.trim().toLowerCase() === etapa.nombre.trim().toLowerCase()
      );
      if (idx >= 0) fila = sinClave.splice(idx, 1)[0];
    }

    const valores = {
      key: etapa.clave,
      name: etapa.nombre,
      color: etapa.color,
      order: i,
      isWon: etapa.ganada,
      isLost: etapa.perdida,
    };

    if (fila) {
      usadas.add(fila.id);
      const cambio =
        fila.key !== valores.key ||
        fila.name !== valores.name ||
        fila.color !== valores.color ||
        fila.order !== valores.order ||
        fila.isWon !== valores.isWon ||
        fila.isLost !== valores.isLost;
      if (cambio) {
        await db.update(pipelineStages).set(valores).where(eq(pipelineStages.id, fila.id));
        actualizadas++;
      }
    } else {
      await db.insert(pipelineStages).values({ pipelineId: principal.id, ...valores });
      creadas++;
    }
  }

  // Sobrantes: o que está na base e não na config.
  const sobrantes = existentes.filter((e) => !usadas.has(e.id));
  let conservadas = 0;
  let borradas = 0;
  for (let j = 0; j < sobrantes.length; j++) {
    const s = sobrantes[j];
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(deals)
      .where(eq(deals.stageId, s.id));
    if (opts?.borrarSobrantes && n === 0) {
      await db.delete(pipelineStages).where(eq(pipelineStages.id, s.id));
      borradas++;
    } else {
      const orden = pipeline.etapas.length + j;
      if (s.order !== orden) {
        await db.update(pipelineStages).set({ order: orden }).where(eq(pipelineStages.id, s.id));
      }
      conservadas++;
    }
  }

  // Os demais pipelines não são o default.
  if (existentes.length === 0 && creadas > 0) {
    await db
      .update(pipelines)
      .set({ isDefault: false })
      .where(and(eq(pipelines.isDefault, true), inArray(pipelines.id, [principal.id])))
      .then(() => db.update(pipelines).set({ isDefault: true }).where(eq(pipelines.id, principal.id)));
  }

  return { pipelineId: principal.id, creadas, actualizadas, conservadas, borradas };
}
