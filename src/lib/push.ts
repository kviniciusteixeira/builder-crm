import "server-only";
import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Web Push com VAPID. Vai pelo Google (Chrome/Android) e Apple (iOS 16.4+ com a PWA
 * instalada na tela de início) sem Firebase nem conta de desenvolvedor.
 *
 * Regras que não são óbvias:
 *  - É best-effort. Um push que não chega não é um bug do CRM: o sistema operacional
 *    pode atrasá-lo ou descartá-lo. Por isso o push é o AVISO; a atribuição se vê
 *    no CRM mesmo que o push nunca chegue.
 *  - Uma assinatura morta (410/404) se apaga na hora. O iOS além disso pode falhar
 *    SEM status: também se trata como morta, senão se acumulam linhas que nunca
 *    entregam.
 *  - 429 e 5xx não apagam: é o provedor pedindo calma.
 */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export function hasVapidKeys(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  /** Rota a abrir ao tocar a notificação (relativa: "/contacts/abc"). */
  url?: string;
  /** Agrupa notificações do mesmo assunto: a nova substitui a anterior. */
  tag?: string;
}

export interface PushOutcome {
  sent: number;
  failed: number;
  removed: number;
  /** Não havia nenhum dispositivo inscrito para esse membro. */
  noDevices: boolean;
}

export async function sendPushToMember(
  memberId: string,
  payload: PushPayload
): Promise<PushOutcome> {
  const outcome: PushOutcome = { sent: 0, failed: 0, removed: 0, noDevices: false };

  if (!ensureConfigured()) {
    throw new Error(
      "Faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Generarlas con `npx web-push generate-vapid-keys`."
    );
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.memberId, memberId));

  if (subs.length === 0) {
    outcome.noDevices = true;
    return outcome;
  }

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60, urgency: "high" }
        );
        outcome.sent++;
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.id, sub.id));
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        const dead = status === 404 || status === 410 || status === undefined;
        if (dead) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          outcome.removed++;
        } else {
          outcome.failed++;
          console.warn(
            `[push] fallo envio a ${sub.endpoint.slice(0, 40)}... status=${status}`,
            err instanceof Error ? err.message : err
          );
        }
      }
    })
  );

  return outcome;
}

export async function saveSubscription(input: {
  memberId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      memberId: input.memberId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: [pushSubscriptions.memberId, pushSubscriptions.endpoint],
      set: {
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    });
}

export async function removeSubscription(
  memberId: string,
  endpoint: string
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.memberId, memberId),
        eq(pushSubscriptions.endpoint, endpoint)
      )
    );
}

export async function countSubscriptions(memberId: string): Promise<number> {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.memberId, memberId));
  return rows.length;
}
