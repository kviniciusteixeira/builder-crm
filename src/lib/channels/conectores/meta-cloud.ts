import "server-only";
import type { Conector, EstadoConector } from "../conector";

/**
 * Conector Meta Cloud API (WhatsApp direto, sem Zernio). PARCIAL de propósito.
 *
 * O que há:
 *  - `enviar`: texto e templates pela Graph API (src/lib/meta-whatsapp.ts), com as
 *    credenciais de `whatsapp_accounts` ou do ambiente (WHATSAPP_*).
 *  - `estado`: o que falta para operar.
 *
 * O que NÃO há ainda (e é o que implementa o futuro conector "Cloud API / Tech
 * Provider", ver ../README.md):
 *  - `webhook`: a ingestão segue na rota legacy /api/webhooks/whatsapp, que só
 *    processa mensagens com WHATSAPP_PROVIDER=meta. Ao implementá-la aqui, essa rota
 *    passa a ser `manejarWebhook(metaCloud, req)` e apaga-se a lógica própria.
 *  - Conexão a partir da UI (Embedded Signup). Hoje: scripts/connect-whatsapp-account.ts.
 *
 * Ativa-se como transporte de WhatsApp com WHATSAPP_PROVIDER=meta (válvula de escape).
 */
export const metaCloud: Conector = {
  id: "meta",
  nombre: "Meta Cloud API (WhatsApp directo)",
  canales: ["whatsapp"],

  async enviar(ctx, msg) {
    const to = ctx.conversation.participantId;
    if (!to) {
      return { success: false, error: { message: "La conversacion no tiene telefono de destino" } };
    }

    const [{ sendTextMessage, sendTemplateMessage }, { getAccountByTenant }] = await Promise.all([
      import("@/lib/meta-whatsapp"),
      import("@/lib/whatsapp-accounts"),
    ]);

    const account = await getAccountByTenant(ctx.conversation.tenantId);

    const result = msg.template
      ? await sendTemplateMessage(
          account,
          to,
          msg.template.name,
          msg.template.language ?? "es",
          msg.template.components ?? []
        )
      : await sendTextMessage(account, to, msg.text ?? "");

    if (!result.success) {
      return {
        success: false,
        error: { message: result.error?.message, code: result.error?.code },
        hint: hintForMetaError(result.error?.code),
      };
    }

    return { success: true, externalId: result.messageId ?? null };
  },

  // webhook: pendente (ver cabeçalho). A rota legacy /api/webhooks/whatsapp segue ativa.

  async estado(): Promise<EstadoConector> {
    const activo = (process.env.WHATSAPP_PROVIDER || "zernio").toLowerCase() === "meta";
    const faltan: string[] = [];
    let cuentas: EstadoConector["cuentas"] = [];

    try {
      const { getPrimaryAccount } = await import("@/lib/whatsapp-accounts");
      const cuenta = await getPrimaryAccount();
      if (cuenta) {
        cuentas = [
          {
            id: cuenta.id,
            canal: "whatsapp",
            nombre: cuenta.displayPhone ?? cuenta.phoneNumberId,
            estado: cuenta.accessToken ? "active" : "sin token",
          },
        ];
      }
    } catch {
      /* sem base ou sem tabela: avalia-se só pelo ambiente */
    }

    if (cuentas.length === 0) {
      if (!process.env.WHATSAPP_ACCESS_TOKEN) faltan.push("WHATSAPP_ACCESS_TOKEN");
      if (!process.env.WHATSAPP_PHONE_NUMBER_ID) faltan.push("WHATSAPP_PHONE_NUMBER_ID");
    }
    if (!process.env.WHATSAPP_APP_SECRET) faltan.push("WHATSAPP_APP_SECRET");
    if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) faltan.push("WHATSAPP_WEBHOOK_VERIFY_TOKEN");

    const notas = [
      activo
        ? "Activo como transporte de WhatsApp (WHATSAPP_PROVIDER=meta). La ingesta entra por /api/webhooks/whatsapp."
        : "Inactivo: WhatsApp va por Zernio. Para usarlo, WHATSAPP_PROVIDER=meta.",
      "Conector parcial: envio y estado. El conector Cloud API / Tech Provider completo esta documentado en src/lib/channels/conectores/README.md.",
    ];

    return {
      id: "meta",
      nombre: "Meta Cloud API (WhatsApp directo)",
      configurado: faltan.length === 0,
      faltan,
      cuentas,
      notas,
    };
  },
};

/** Códigos de Graph mais comuns, em linguagem humana. */
function hintForMetaError(code: number | undefined): string | undefined {
  switch (code) {
    case 131030:
      return "El numero no esta en la lista de destinatarios permitidos de la app de Meta.";
    case 131047:
      return "Pasaron mas de 24h desde el ultimo mensaje del cliente: hay que usar una plantilla aprobada.";
    case 132000:
      return "La plantilla no coincide con la cantidad de variables esperadas.";
    case 190:
      return "El token de acceso de Meta expiro.";
    default:
      return undefined;
  }
}
