import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/db";
import { contacts, activities, messages } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { verifyWebhookSignature } from "@/lib/meta-whatsapp";
import { enqueueAgentJob, queueConfig } from "@/lib/agent/queue";
import { resolveRealPhone, normalizePhone } from "@/lib/phone";
import {
  getAccountByPhoneNumberId,
  type WhatsappAccount,
} from "@/lib/whatsapp-accounts";
import { touchConversation, upsertConversation } from "@/lib/channels/ingest";
import { metaWebhookActive } from "@/lib/channels/provider";

const REACTIVATION_INACTIVITY_DAYS = 7;
const REACTIVATION_INACTIVITY_MS = REACTIVATION_INACTIVITY_DAYS * 24 * 60 * 60 * 1000;

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "";

/**
 * Handshake da Meta: quando se configura o webhook, a Meta faz um GET com
 * `hub.mode=subscribe`, `hub.verify_token` e `hub.challenge`. Se o token
 * coincide com o que está no .env, devolve-se o challenge em text/plain.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.warn("[whatsapp-webhook] handshake fallido", { mode, tokenMatches: token === VERIFY_TOKEN });
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

interface MetaInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string; mime_type: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; caption?: string; mime_type: string };
  document?: { id: string; filename?: string; mime_type: string };
  location?: { latitude: number; longitude: number; name?: string };
  contacts?: unknown[];
}

interface MetaContactProfile {
  wa_id: string;
  profile?: { name?: string };
}

interface MetaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

interface MetaWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value: {
        messaging_product?: string;
        metadata?: { display_phone_number: string; phone_number_id: string };
        contacts?: MetaContactProfile[];
        messages?: MetaInboundMessage[];
        statuses?: MetaStatus[];
      };
    }>;
  }>;
}

function extractMessageBody(msg: MetaInboundMessage): string {
  switch (msg.type) {
    case "text":
      return msg.text?.body ?? "";
    case "image":
      return msg.image?.caption ? `[imagen] ${msg.image.caption}` : "[imagen]";
    case "audio":
      return "[audio]";
    case "video":
      return msg.video?.caption ? `[video] ${msg.video.caption}` : "[video]";
    case "document":
      return msg.document?.filename
        ? `[documento] ${msg.document.filename}`
        : "[documento]";
    case "location":
      return `[ubicacion] ${msg.location?.name ?? `${msg.location?.latitude},${msg.location?.longitude}`}`;
    default:
      return `[${msg.type}]`;
  }
}

function isPlaceholderName(name: string | null | undefined): boolean {
  if (!name) return true;
  return /^WhatsApp\s+\w{2,6}$/i.test(name.trim());
}

async function findOrCreateContact(
  phone: string,
  tenantId: string,
  profileName?: string
): Promise<string> {
  const formatted = phone.startsWith("+") ? phone : `+${phone}`;
  const cleanProfileName = profileName?.trim() || undefined;

  const existingRows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.phone, formatted), eq(contacts.tenantId, tenantId)))
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    if (cleanProfileName && isPlaceholderName(existing.name)) {
      await db
        .update(contacts)
        .set({ name: cleanProfileName, updatedAt: new Date() })
        .where(eq(contacts.id, existing.id));
    }
    return existing.id;
  }

  const now = new Date();
  const placeholderName =
    cleanProfileName || `WhatsApp ${formatted.slice(-4)}`;

  const createdRows = await db
    .insert(contacts)
    .values({
      name: placeholderName,
      phone: formatted,
      source: "whatsapp",
      score: 50,
      tenantId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const created = createdRows[0];

  // Log activity
  await db.insert(activities).values({
    type: "note",
    description: "Nuevo contacto via WhatsApp (escribio primero)",
    contactId: created.id,
    createdAt: now,
  });

  return created.id;
}

/**
 * Se o bot está desligado e não há atividade em >REACTIVATION_INACTIVITY_DAYS dias,
 * reativar o bot automaticamente. A inatividade se mede contra a última mensagem
 * registrada do contato (qualquer direção). Se o cliente nunca voltou a
 * escrever em uma semana, assumimos que o ciclo com o assessor terminou e o bot
 * volta a assumir.
 */
async function maybeReactivateAfterInactivity(contactId: string): Promise<void> {
  const [contact] = await db
    .select({
      aiEnabled: contacts.aiEnabled,
      needsHuman: contacts.needsHuman,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) return;
  if (contact.aiEnabled && !contact.needsHuman) return;

  const [lastMsg] = await db
    .select({
      sentAt: messages.sentAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.contactId, contactId))
    .orderBy(desc(messages.createdAt))
    .limit(1);

  if (!lastMsg) return;

  const lastTs = (lastMsg.sentAt ?? lastMsg.createdAt)?.getTime();
  if (!lastTs) return;

  const elapsed = Date.now() - lastTs;
  if (elapsed < REACTIVATION_INACTIVITY_MS) return;

  await db
    .update(contacts)
    .set({
      aiEnabled: true,
      needsHuman: false,
      needsHumanReason: null,
      needsHumanAt: null,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contactId));

  await db.insert(activities).values({
    type: "note",
    description: `Bot reactivado automaticamente: ${REACTIVATION_INACTIVITY_DAYS} dias de inactividad.`,
    contactId,
  });
}

async function handleInboundMessage(
  msg: MetaInboundMessage,
  metadata: { display_phone_number: string; phone_number_id: string } | undefined,
  profile: MetaContactProfile | undefined,
  account: WhatsappAccount
): Promise<{ contactId: string; jobId: string } | null> {
  // Gotcha A: em Coexistence wa_id pode ser um BSUID; usar sempre o número real
  // de messages[0].from. Gotcha B: normalizar o tronco para não duplicar contatos.
  const realPhone = resolveRealPhone(profile?.wa_id, msg.from);
  const fromPhone = `+${realPhone}`;
  const toPhone = metadata?.display_phone_number
    ? `+${normalizePhone(metadata.display_phone_number)}`
    : null;

  // Idempotência: se o meta_message_id já existe, não inserir de novo
  const existingRows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.metaMessageId, msg.id))
    .limit(1);
  if (existingRows[0]) return null;

  const contactId = await findOrCreateContact(
    fromPhone,
    account.tenantId,
    profile?.profile?.name
  );

  // Se o bot está desligado mas já passaram 7 dias desde a última mensagem,
  // reativá-lo antes de inserir a mensagem nova (assim o agente a processa).
  await maybeReactivateAfterInactivity(contactId);

  const sentAt = new Date(parseInt(msg.timestamp, 10) * 1000);
  const body = extractMessageBody(msg);

  // A conversa agora é a unidade da caixa de entrada e do agente: sem vinculá-la, esta
  // mensagem não aparece na lista nem entra no histórico que o bot lê.
  // `legacy:<contactId>` é o mesmo external_id que o backfill da migração usou,
  // então este upsert cai sobre a linha existente em vez de criar um fio novo.
  const conversation = await upsertConversation({
    tenantId: account.tenantId,
    contactId,
    accountId: null,
    channel: "whatsapp",
    provider: "meta",
    externalId: `legacy:${contactId}`,
    participantId: fromPhone,
    participantName: profile?.profile?.name ?? null,
  });

  await db.insert(messages).values({
    contactId,
    conversationId: conversation.id,
    channel: "whatsapp",
    provider: "meta",
    direction: "in",
    type: msg.type,
    body,
    metaMessageId: msg.id,
    externalId: msg.id,
    status: "received",
    rawPayload: msg,
    fromPhone,
    toPhone,
    tenantId: account.tenantId,
    sentAt,
    createdAt: new Date(),
  });

  await touchConversation(conversation.id, { direction: "in", body, sentAt });

  // Touch contact updatedAt para que ordene primeiro na lista
  await db
    .update(contacts)
    .set({ updatedAt: new Date() })
    .where(eq(contacts.id, contactId));

  // Enfileirar job para o agente de IA (debounce + skip se ai_enabled=false)
  const enqueued = await enqueueAgentJob(contactId, msg.id, conversation.id);
  return { contactId, jobId: enqueued.jobId };
}

async function handleStatusUpdate(status: MetaStatus) {
  const targetRows = await db
    .select()
    .from(messages)
    .where(eq(messages.metaMessageId, status.id))
    .limit(1);
  const target = targetRows[0];

  if (!target) return;

  const ts = new Date(parseInt(status.timestamp, 10) * 1000);
  const updates: Partial<typeof messages.$inferInsert> = {
    status: status.status,
  };

  if (status.status === "delivered") updates.deliveredAt = ts;
  if (status.status === "read") updates.readAt = ts;
  if (status.status === "failed") {
    updates.errorMessage = JSON.stringify(status.errors ?? []);
  }

  await db
    .update(messages)
    .set(updates)
    .where(eq(messages.id, target.id));
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[whatsapp-webhook] firma invalida");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.object !== "whatsapp_business_account") {
    // Devolver 200 mesmo assim: a Meta retira o webhook se responde mal
    return NextResponse.json({ ignored: true });
  }

  // O WhatsApp sai pelo Zernio. Este handler fica como válvula de escape
  // (WHATSAPP_PROVIDER=meta) e não processa nada enquanto o Zernio for o provedor: se os
  // dois caminhos ingerissem a mesma mensagem, o agente responderia duas vezes.
  if (!metaWebhookActive()) {
    return NextResponse.json({ ignored: true, reason: "whatsapp_provider=zernio" });
  }

  const enqueuedJobs: Array<{ contactId: string; jobId: string }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;

      // Routing por phone_number_id: SÓ processamos números da nossa tabela.
      // Qualquer outro número que compartilhe o Meta App é ignorado com
      // 200 para não roubar/duplicar mensagens nem criar contatos lixo.
      const account = await getAccountByPhoneNumberId(
        value.metadata?.phone_number_id
      );
      if (!account) {
        console.warn(
          "[whatsapp-webhook] phone_number_id no registrado, ignorando:",
          value.metadata?.phone_number_id
        );
        continue;
      }

      const profile = value.contacts?.[0];

      for (const msg of value.messages ?? []) {
        try {
          const result = await handleInboundMessage(
            msg,
            value.metadata,
            profile,
            account
          );
          if (result) enqueuedJobs.push(result);
        } catch (err) {
          console.error("[whatsapp-webhook] error mensaje entrante", err);
        }
      }

      for (const status of value.statuses ?? []) {
        try {
          await handleStatusUpdate(status);
        } catch (err) {
          console.error("[whatsapp-webhook] error status", err);
        }
      }
    }
  }

  // Disparar o worker do agente de IA depois de devolver 200 OK.
  // Cada job faz o próprio debounce: se chegam mais mensagens nos próximos
  // 6s do mesmo contato, o worker executa mas claimAgentJob detecta
  // debounce_still_active e sai; o setTimeout seguinte é que processa.
  if (enqueuedJobs.length > 0) {
    after(async () => {
      const uniqueJobIds = Array.from(
        new Set(enqueuedJobs.map((j) => j.jobId))
      );
      const baseUrl = getWorkerBaseUrl(request);
      // Vazio = falta APP_BASE_URL em produção. Não se dispara: mandar o segredo a um
      // host tirado do cabeçalho seria entregá-lo a quem o colocou. Quem retoma é a varredura.
      if (!baseUrl) {
        console.error(
          `[meta-webhook] sin APP_BASE_URL no se dispara el worker; quedan ${uniqueJobIds.length} en cola`
        );
        return;
      }
      const secret = process.env.AGENT_WORKER_SECRET;

      await Promise.all(
        uniqueJobIds.map(async (jobId) => {
          await new Promise((r) => setTimeout(r, queueConfig.debounceMs + 250));
          try {
            const res = await fetch(`${baseUrl}/api/agent/process`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(secret ? { "x-agent-secret": secret } : {}),
              },
              body: JSON.stringify({ jobId }),
            });
            if (!res.ok) {
              console.warn(
                "[whatsapp-webhook] agent worker no-200",
                res.status,
                await res.text().catch(() => "")
              );
            }
          } catch (err) {
            console.error("[whatsapp-webhook] error disparando worker", err);
          }
        })
      );
    });
  }

  // A Meta espera 200 OK; se demora demais ou devolve erro, retira o webhook
  return NextResponse.json({ received: true });
}

/**
 * URL pública do app para que o webhook possa chamar a si mesmo.
 *
 * A esta URL se manda AGENT_WORKER_SECRET num cabeçalho, então NÃO pode sair da
 * requisição que entra: quem controlar o `Host` de uma requisição que chegue até aqui
 * leva o segredo ao próprio servidor. Hoje o caminho está atrás da assinatura HMAC do
 * webhook, mas isso é uma defesa de outra coisa, não desta função.
 *
 * Em produção exige-se APP_BASE_URL (ou NEXT_PUBLIC_APP_URL). Se falta, devolve-se
 * cadeia vazia e quem chama não dispara nada: o agente fica sem processar e fica dito
 * no log, o que é preferível a vazar o segredo. Fora de produção cai em
 * localhost, que é onde roda `npm run dev`.
 */
function getWorkerBaseUrl(_request?: NextRequest): string {
  const fromEnv = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[seguridad] falta APP_BASE_URL: no se llama al worker del agente. " +
        "Derivar la URL del host de la peticion filtraria AGENT_WORKER_SECRET."
    );
    return "";
  }

  return "http://localhost:3000";
}
