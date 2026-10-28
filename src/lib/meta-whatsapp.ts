import crypto from "node:crypto";
import { normalizePhone } from "@/lib/phone";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";

const GRAPH_BASE = `https://graph.facebook.com/${API_VERSION}`;

// A fonte única de normalizePhone está em phone.ts; reexport por compatibilidade.
export { normalizePhone };

/**
 * Credenciais de envio que se passam às funções de envio. `accessToken` pode
 * vir null (conta sem token carregado); nesse caso usa-se o fallback de env.
 */
export interface WhatsappSendCredentials {
  phoneNumberId: string;
  accessToken: string | null;
}

interface ResolvedCreds {
  phoneNumberId: string;
  accessToken: string;
}

/**
 * Resolve credenciais de envio: usa as da conta (multi-tenant) ou cai nas
 * env globais (fallback de transição para não quebrar o fluxo single-tenant).
 */
function resolveCreds(
  account?: WhatsappSendCredentials | null
): ResolvedCreds | null {
  if (account?.phoneNumberId && account.accessToken) {
    return {
      phoneNumberId: account.phoneNumberId,
      accessToken: account.accessToken,
    };
  }
  if (PHONE_NUMBER_ID && ACCESS_TOKEN) {
    console.warn(
      "[meta-whatsapp] sin cuenta resuelta, usando credenciales de env (fallback)"
    );
    return { phoneNumberId: PHONE_NUMBER_ID, accessToken: ACCESS_TOKEN };
  }
  return null;
}

interface MetaError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  error_data?: { details?: string };
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: MetaError;
  rawResponse?: unknown;
}

export async function sendTextMessage(
  account: WhatsappSendCredentials | null,
  to: string,
  body: string
): Promise<SendResult> {
  const creds = resolveCreds(account);
  if (!creds) {
    return {
      success: false,
      error: { message: "Sin credenciales de WhatsApp (ni cuenta ni env)" },
    };
  }

  const url = `${GRAPH_BASE}/${creds.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(to),
    type: "text",
    text: { preview_url: false, body },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      return { success: false, error: json.error, rawResponse: json };
    }

    const messageId = json.messages?.[0]?.id;
    return { success: true, messageId, rawResponse: json };
  } catch (err) {
    return {
      success: false,
      error: { message: err instanceof Error ? err.message : "Network error" },
    };
  }
}

export async function sendTemplateMessage(
  account: WhatsappSendCredentials | null,
  to: string,
  templateName: string,
  language = "es",
  components: unknown[] = []
): Promise<SendResult> {
  const creds = resolveCreds(account);
  if (!creds) {
    return {
      success: false,
      error: { message: "Sin credenciales de WhatsApp (ni cuenta ni env)" },
    };
  }

  const url = `${GRAPH_BASE}/${creds.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      return { success: false, error: json.error, rawResponse: json };
    }

    const messageId = json.messages?.[0]?.id;
    return { success: true, messageId, rawResponse: json };
  } catch (err) {
    return {
      success: false,
      error: { message: err instanceof Error ? err.message : "Network error" },
    };
  }
}

export interface CreateTemplatePayload {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: unknown[];
}

/**
 * Credenciais para operar templates. Os templates vivem no WABA (não no
 * phone number), por isso isto pede `wabaId` em vez de `phoneNumberId`. A interface
 * `WhatsappAccount` (whatsapp-accounts.ts) é atribuível a isto.
 */
export interface WhatsappTemplateCredentials {
  wabaId: string | null;
  accessToken: string | null;
}

interface ResolvedWabaCreds {
  wabaId: string;
  accessToken: string;
}

/** Resolve WABA + token: prioriza a conta multi-tenant, cai em env (transição). */
function resolveWabaCreds(
  account?: WhatsappTemplateCredentials | null
): ResolvedWabaCreds | null {
  if (account?.wabaId && account.accessToken) {
    return { wabaId: account.wabaId, accessToken: account.accessToken };
  }
  if (WABA_ID && ACCESS_TOKEN) {
    console.warn(
      "[meta-whatsapp] sin cuenta resuelta para plantillas, usando env (fallback)"
    );
    return { wabaId: WABA_ID, accessToken: ACCESS_TOKEN };
  }
  return null;
}

export async function createTemplate(
  account: WhatsappTemplateCredentials | null,
  payload: CreateTemplatePayload
): Promise<SendResult & { templateId?: string; status?: string }> {
  const creds = resolveWabaCreds(account);
  if (!creds) {
    return {
      success: false,
      error: { message: "Sin WABA/token para crear plantilla (ni cuenta ni env)" },
    };
  }

  const url = `${GRAPH_BASE}/${creds.wabaId}/message_templates`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      return { success: false, error: json.error, rawResponse: json };
    }

    return { success: true, templateId: json.id, status: json.status, rawResponse: json };
  } catch (err) {
    return {
      success: false,
      error: { message: err instanceof Error ? err.message : "Network error" },
    };
  }
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: unknown[];
}

export async function getTemplates(
  account: WhatsappTemplateCredentials | null
): Promise<{
  success: boolean;
  templates?: MetaTemplate[];
  error?: MetaError;
}> {
  const creds = resolveWabaCreds(account);
  if (!creds) {
    return {
      success: false,
      error: { message: "Sin WABA/token para listar plantillas (ni cuenta ni env)" },
    };
  }

  const url = `${GRAPH_BASE}/${creds.wabaId}/message_templates?fields=id,name,language,status,category,components&limit=200`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    const json = await res.json();
    if (!res.ok || json.error) return { success: false, error: json.error };
    return { success: true, templates: (json.data || []) as MetaTemplate[] };
  } catch (err) {
    return {
      success: false,
      error: { message: err instanceof Error ? err.message : "Network error" },
    };
  }
}

/**
 * Valida a assinatura X-Hub-Signature-256 que a Meta envia com cada webhook.
 * O formato do header é "sha256=<hex>".
 *
 * Se APP_SECRET não está definido, retorna `false` e loga um warning. NUNCA
 * deixar passar um webhook sem assinatura válida em produção — um atacante poderia
 * injetar mensagens/leads falsos.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!APP_SECRET) {
    console.warn("[meta-whatsapp] WHATSAPP_APP_SECRET no configurado — firma no validada");
    return false;
  }
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", APP_SECRET)
    .update(rawBody)
    .digest("hex");

  const provided = signatureHeader.replace(/^sha256=/, "");

  if (expected.length !== provided.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided, "hex")
    );
  } catch {
    return false;
  }
}

export const metaConfig = {
  apiVersion: API_VERSION,
  phoneNumberId: PHONE_NUMBER_ID,
  wabaId: WABA_ID,
  hasAccessToken: Boolean(ACCESS_TOKEN),
  hasAppSecret: Boolean(APP_SECRET),
};
