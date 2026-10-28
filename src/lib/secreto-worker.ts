import "server-only";
import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * O segredo que autentica os processos internos do CRM contra as próprias rotas:
 * o worker do agente (`/api/agent/process`), a varredura de automações, a
 * varredura de webhooks pendentes e a carga de dados demo.
 *
 * Essas rotas são públicas no middleware de propósito (chama-as um cron ou o próprio
 * servidor, sem sessão), então este segredo é o ÚNICO que as protege.
 *
 * FALHA FECHADA, e esse é o ponto. Até 1.5.1 cada lugar fazia:
 *
 *     const secret = process.env.AGENT_WORKER_SECRET;
 *     if (secret) { ...comprobar... }        // sem variável, não verificava nada
 *
 * Numa instância onde o membro não carregou a variável, qualquer um na internet podia
 * executar trabalhos do agente, relançar eventos de webhook e semear dados. E não havia
 * nenhum sintoma: o CRM funcionava igual. Por isso agora, sem segredo, estas rotas
 * respondem 401 e a variável é obrigatória (ver `src/lib/env.ts`): é preferível que
 * uma instância mal configurada reclame em `/api/health` a que fique aberta em
 * silêncio.
 */

/** Compara em tempo constante. Comprimento diferente = diferente, sem olhar o conteúdo. */
function iguales(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // timingSafeEqual lança se os buffers diferem em comprimento: há que comparar antes,
  // e essa comparação sim filtra o comprimento do segredo, que não é o que protege.
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** O segredo apresentado por quem chama, de `Authorization: Bearer` ou `x-agent-secret`. */
export function secretoPresentado(request: NextRequest): string | null {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return bearer || request.headers.get("x-agent-secret") || null;
}

/**
 * `true` só se há segredo configurado E quem chama apresentou esse mesmo segredo.
 * Sem `AGENT_WORKER_SECRET` devolve `false` sempre.
 */
export function autorizadoPorSecreto(request: NextRequest): boolean {
  const secreto = process.env.AGENT_WORKER_SECRET;
  if (!secreto) {
    console.error(
      "[seguridad] AGENT_WORKER_SECRET no esta configurada: se rechaza la llamada interna. " +
        "Generala con `openssl rand -hex 32` y cargala en la instancia."
    );
    return false;
  }
  const presentado = secretoPresentado(request);
  return presentado !== null && iguales(presentado, secreto);
}
