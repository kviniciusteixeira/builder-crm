import type { NextRequest } from "next/server";
import { zernio } from "@/lib/channels/conectores/zernio";
import { manejarWebhook, barrerWebhook } from "@/lib/channels/webhook";

/**
 * Webhook do Zernio (WhatsApp, Instagram DM e Messenger). Toda a mecânica (assinatura,
 * idempotência, after(), varredura) é genérica e vive em src/lib/channels/webhook.ts;
 * o que é próprio do Zernio está no conector.
 *
 * Esta URL é a registrada no Zernio (`npm run zernio:webhook -- --url ...`): não
 * mudá-la. Pública pelo prefixo /api/webhooks (supabase/middleware.ts).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (request: NextRequest) => manejarWebhook(zernio, request);
export const GET = (request: NextRequest) => barrerWebhook(zernio, request);
