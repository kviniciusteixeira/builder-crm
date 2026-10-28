import "server-only";
import crypto from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { and, asc, eq, lt } from "drizzle-orm";
import type { Conector } from "./conector";
import { autorizadoPorSecreto } from "@/lib/secreto-worker";

/**
 * Mecânica genérica de webhooks para qualquer conector:
 *
 *   POST -> manejarWebhook(conector, req)   verifica assinatura, reivindica o evento
 *                                            (idempotência), responde 2xx, processa em after()
 *   GET  -> barrerWebhook(conector, req)     reprocessa o que ficou pendente (com segredo)
 *
 * Os provedores entregam at-least-once: o claim em `webhook_events` descarta as
 * novas tentativas. Mas se o `after()` morre, o evento fica reivindicado e ninguém o volta a
 * ver; por isso o payload se guarda e a varredura o tenta de novo até MAX_ATTEMPTS.
 *
 * Este módulo importa o mínimo (db, crypto). O pesado entra por `import()` dentro de
 * `conector.webhook.procesar`.
 */

const STALE_AFTER_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export async function manejarWebhook(conector: Conector, request: NextRequest): Promise<NextResponse> {
  if (!conector.webhook) {
    return NextResponse.json({ error: "Este conector no recibe webhooks" }, { status: 404 });
  }

  const rawBody = await request.text();

  if (!conector.webhook.verificar(rawBody, request.headers)) {
    console.warn(`[webhook ${conector.id}] firma invalida`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId =
    conector.webhook.idEvento(rawBody, request.headers, payload) ??
    `sha:${crypto.createHash("sha256").update(rawBody).digest("hex")}`;

  const claimed = await db
    .insert(webhookEvents)
    .values({
      eventId,
      provider: conector.id,
      event: nombreEvento(payload),
      status: "received",
      payload: payload as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ eventId: webhookEvents.eventId });

  if (claimed.length === 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const headers = new Headers(request.headers);
  after(async () => {
    await ejecutarEvento(conector, eventId, payload, headers);
  });

  return NextResponse.json({ received: true });
}

export async function barrerWebhook(conector: Conector, request: NextRequest): Promise<NextResponse> {
  if (!autorizadoPorSecreto(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!conector.webhook) {
    return NextResponse.json({ ok: true, found: 0, reprocessed: 0 });
  }

  const stale = await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.status, "received"),
        eq(webhookEvents.provider, conector.id),
        lt(webhookEvents.receivedAt, new Date(Date.now() - STALE_AFTER_MS))
      )
    )
    .orderBy(asc(webhookEvents.receivedAt))
    .limit(20);

  let reprocessed = 0;
  for (const row of stale) {
    if (row.attempts >= MAX_ATTEMPTS) {
      await db
        .update(webhookEvents)
        .set({ status: "failed", error: `sin procesar tras ${row.attempts} intentos`, processedAt: new Date() })
        .where(eq(webhookEvents.eventId, row.eventId));
      continue;
    }
    if (!row.payload) continue;
    await ejecutarEvento(conector, row.eventId, row.payload, request.headers);
    reprocessed++;
  }

  return NextResponse.json({ ok: true, found: stale.length, reprocessed });
}

/**
 * Os crons da Vercel só mandam `Authorization: Bearer`; o worker do agente aceita
 * também `x-agent-secret`. Sem AGENT_WORKER_SECRET configurado NÃO se atende: esta
 * rota é pública no middleware e o segredo é o único que a protege.
 */
// Reexporta-se para não quebrar quem já o importava daqui.
export { autorizadoPorSecreto };

async function ejecutarEvento(conector: Conector, eventId: string, payload: unknown, headers: Headers): Promise<void> {
  try {
    const result = await conector.webhook!.procesar(payload);

    if (result.status === "retry") {
      // Fora de ordem (típico: `delivered` antes que exista a mensagem). Fica em
      // 'received' para que a varredura tente de novo.
      await db
        .update(webhookEvents)
        .set({ attempts: (await intentos(eventId)) + 1, error: result.reason ?? null })
        .where(eq(webhookEvents.eventId, eventId));
      return;
    }

    await db
      .update(webhookEvents)
      .set({ status: result.status, error: result.reason ?? null, processedAt: new Date() })
      .where(eq(webhookEvents.eventId, eventId));

    if (result.jobIds.length > 0) {
      const { triggerAgentWorker, getWorkerBaseUrl } = await import("@/lib/agent/trigger");
      await triggerAgentWorker(result.jobIds, getWorkerBaseUrl(headers), `${conector.id}-webhook`);
    }
  } catch (err) {
    console.error(`[webhook ${conector.id}] error procesando evento`, eventId, err);
    await db
      .update(webhookEvents)
      .set({ status: "failed", error: err instanceof Error ? err.message : "error desconocido", processedAt: new Date() })
      .where(eq(webhookEvents.eventId, eventId))
      .catch(() => {});
  }
}

async function intentos(eventId: string): Promise<number> {
  const [row] = await db
    .select({ attempts: webhookEvents.attempts })
    .from(webhookEvents)
    .where(eq(webhookEvents.eventId, eventId))
    .limit(1);
  return row?.attempts ?? 0;
}

function nombreEvento(payload: unknown): string | null {
  const e = (payload as { event?: unknown } | null)?.event;
  return typeof e === "string" ? e : null;
}
