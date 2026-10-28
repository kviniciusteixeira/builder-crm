import crypto from "node:crypto";

// Igual que em client.ts: lê-se ao usá-lo, não ao importar o módulo.
function webhookSecret(): string {
  return process.env.ZERNIO_WEBHOOK_SECRET || "";
}

/**
 * Verifica a assinatura de um webhook do Zernio.
 *
 * Mesmo padrão que `verifyWebhookSignature` de meta-whatsapp.ts, com uma diferença:
 * o Zernio manda o header `X-Zernio-Signature` como hex cru em minúscula, SEM o
 * prefixo `sha256=` que a Meta usa.
 *
 * Fail-closed: sem segredo configurado devolve false. Um webhook público sem assinatura
 * deixa que qualquer um injete mensagens falsas na caixa de entrada.
 *
 * @param rawBody o corpo SEM parsear. Com `JSON.parse` + `stringify` a assinatura não valida.
 */
export function verifyZernioSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string = webhookSecret()
): boolean {
  if (!secret) {
    console.warn(
      "[zernio] ZERNIO_WEBHOOK_SECRET no configurado: se rechaza el webhook"
    );
    return false;
  }
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const provided = signatureHeader.trim().toLowerCase().replace(/^sha256=/, "");

  // timingSafeEqual lança se os buffers diferem em comprimento: comparar antes.
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

export function hasZernioWebhookSecret(): boolean {
  return webhookSecret().length > 0;
}

/**
 * Eventos que o CRM precisa receber.
 *
 * A alta se faz com `npm run zernio:webhook -- --url https://tu-app` (que bate em
 * `POST /v1/webhooks/settings`), não à mão no dashboard. Se mudar esta lista,
 * volta a rodar o script: a assinatura vive do lado do Zernio e não fica sabendo sozinha.
 *
 * O Zernio desliga o webhook depois de 10 falhas de entrega seguidas, então um deploy
 * quebrado que devolva 500 um tempo deixa a assinatura inativa e é preciso reativá-la.
 */
export const SUBSCRIBED_EVENTS = [
  "conversation.started",
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "message.edited",
  "message.deleted",
  "account.connected",
  "account.disconnected",
] as const;
