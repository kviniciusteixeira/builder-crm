/**
 * Provedor de WhatsApp. Por padrão **zernio**: WhatsApp, Instagram e Messenger vão
 * todos pelo Zernio com uma só API e um só webhook.
 *
 * `WHATSAPP_PROVIDER=meta` existe como válvula de escape: volta à integração
 * direta com a Meta Cloud API (`/api/webhooks/whatsapp` + `meta-whatsapp.ts`), que se
 * conserva funcionando. É uma mudança de variável de ambiente, sem migração de dados.
 */
export type WhatsappProvider = "zernio" | "meta";

export function whatsappProvider(): WhatsappProvider {
  return (process.env.WHATSAPP_PROVIDER || "zernio").toLowerCase() === "meta"
    ? "meta"
    : "zernio";
}

/** true se o webhook da Meta ainda tem que processar mensagens de WhatsApp. */
export function metaWebhookActive(): boolean {
  return whatsappProvider() === "meta";
}
