import { NextRequest, NextResponse } from "next/server";
import { buildConnectUrl } from "@/lib/zernio/accounts";
import { isChannel } from "@/lib/channels/types";
import { requireMember } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Passo 1 do OAuth: o SERVIDOR pede ao Zernio a URL de autorização e devolve só
 * essa URL. A API key nunca chega ao browser, que a abre em um popup.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;
  const params = request.nextUrl.searchParams;
  const platform = params.get("platform");

  if (!isChannel(platform)) {
    return NextResponse.json(
      { error: "platform invalido (whatsapp | instagram | facebook)" },
      { status: 400 }
    );
  }

  const origin =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    request.nextUrl.origin;
  const redirectUrl = `${origin.replace(/\/$/, "")}/api/channels/callback`;

  const onboarding = params.get("onboarding");
  const loginMethod = params.get("loginMethod");

  const result = await buildConnectUrl(platform, redirectUrl, {
    // `business_app` (coexistência) é o default: o número continua vivo no celular.
    // `api` mostra o seletor de WABA da Meta e serve para um número que JÁ está na
    // Cloud API em outro lugar. Um número que está no app WhatsApp Business aparece
    // como "no cumple los requisitos" no fluxo `api`: esse é o sintoma de ter
    // escolhido o modo errado, não um problema do número.
    onboarding: onboarding === "api" ? "api" : "business_app",
    loginMethod: loginMethod === "facebook_login" ? "facebook_login" : undefined,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 502 }
    );
  }

  return NextResponse.json({ authUrl: result.data.authUrl });
}
