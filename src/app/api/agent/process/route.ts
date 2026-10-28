import { NextRequest, NextResponse } from "next/server";
import { claimAgentJob, markJobDone, markJobFailed, findStaleJobs } from "@/lib/agent/queue";
import { runAgentForContact, runAgentForConversation } from "@/lib/agent";
import { autorizadoPorSecreto } from "@/lib/secreto-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Worker do agente. Recebe { jobId } e processa o job.
 *
 * É chamado a partir de:
 * - O webhook do WhatsApp via `after()` com setTimeout (debounce)
 * - Um cron periódico (que chama GET e varre jobs stale)
 *
 * Auth: `x-agent-secret` (ou Bearer) deve coincidir com AGENT_WORKER_SECRET. Sem essa
 * variável NÃO se atende ninguém: a rota é pública no middleware e o segredo é
 * o único que a protege.
 */
export async function POST(request: NextRequest) {
  if (!autorizadoPorSecreto(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { jobId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.jobId) {
    return NextResponse.json({ error: "jobId requerido" }, { status: 400 });
  }

  return await processJob(body.jobId);
}

/**
 * GET = scan de jobs stale (cron). Processa até 5 em série.
 */
export async function GET(request: NextRequest) {
  if (!autorizadoPorSecreto(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stale = await findStaleJobs();
  const results: Array<{ jobId: string; ok: boolean; reason?: string }> = [];
  for (const job of stale.slice(0, 5)) {
    try {
      const claim = await claimAgentJob(job.id);
      if (!claim.ok) {
        results.push({ jobId: job.id, ok: false, reason: claim.reason });
        continue;
      }
      const run = await runClaim(claim);
      if (run.ok) {
        await markJobDone(job.id, run.reason);
        results.push({ jobId: job.id, ok: true, reason: run.reason });
      } else {
        await markJobFailed(job.id, run.reason ?? "unknown");
        results.push({ jobId: job.id, ok: false, reason: run.reason });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      await markJobFailed(job.id, msg);
      results.push({ jobId: job.id, ok: false, reason: msg });
    }
  }

  return NextResponse.json({ scanned: stale.length, processed: results });
}

/**
 * Os jobs novos trazem `conversationId` e rodam por fio; os que ficaram
 * enfileirados antes da migração multicanal só têm contato e caem no wrapper,
 * que resolve a conversa mais recente.
 */
function runClaim(claim: {
  contactId: string;
  conversationId: string | null;
}) {
  return claim.conversationId
    ? runAgentForConversation(claim.conversationId)
    : runAgentForContact(claim.contactId);
}

async function processJob(jobId: string): Promise<NextResponse> {
  const claim = await claimAgentJob(jobId);
  if (!claim.ok) {
    return NextResponse.json({ skipped: true, reason: claim.reason });
  }

  try {
    const run = await runClaim(claim);
    if (run.ok) {
      await markJobDone(jobId, run.reason);
      return NextResponse.json({
        ok: true,
        reply: run.reply,
        toolCalls: run.toolCalls,
        reason: run.reason,
      });
    } else {
      await markJobFailed(jobId, run.reason ?? "unknown");
      return NextResponse.json(
        { ok: false, reason: run.reason },
        { status: 200 }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[agent-worker] error", err);
    await markJobFailed(jobId, msg);
    return NextResponse.json({ ok: false, reason: msg }, { status: 500 });
  }
}
