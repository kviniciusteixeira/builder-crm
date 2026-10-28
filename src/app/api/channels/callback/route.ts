import { NextRequest, NextResponse } from "next/server";
import { upsertZernioAccount } from "@/lib/channels/accounts";
import { getAccount } from "@/lib/zernio/accounts";
import { isChannel } from "@/lib/channels/types";
import { resolveDefaultTenantId } from "@/lib/tenants";
import { requireMember } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Volta do OAuth do Zernio: `?connected=<platform>&profileId=&accountId=&username=`.
 *
 * Abre dentro de um popup, então em vez de redirecionar devolve uma página mínima que
 * avisa o CRM por `postMessage` e se fecha sozinha. Se não há `opener` (popup
 * bloqueado, ou alguém colou a URL à mão) cai no redirect de sempre.
 *
 * O webhook `account.connected` guarda o mesmo de forma idempotente: isto é UX para
 * que a conta apareça na hora, não a fonte da verdade.
 *
 * O que chega na URL NÃO se acredita: pergunta-se ao Zernio por esse `accountId` com a
 * chave desta instância antes de guardá-lo. Sem essa verificação, um link preparado
 * e aberto por qualquer pessoa da equipe conectava ao CRM uma conta alheia, porque o
 * identificador vinha da query e ninguém verificava que essa conexão a tivesse iniciado
 * este CRM. A chave da API só vê as contas próprias, então uma alheia não existe.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;
  const params = request.nextUrl.searchParams;
  const platform = params.get("connected");
  const accountId = params.get("accountId");
  const username = params.get("username");

  let ok = false;

  if (isChannel(platform) && accountId) {
    const cuenta = await getAccount(accountId);
    if (!cuenta.success) {
      console.warn(
        `[channels] la vuelta del OAuth trae un accountId que Zernio no reconoce (${accountId}): se ignora`
      );
    } else if (cuenta.data.platform !== platform) {
      console.warn(
        `[channels] el accountId ${accountId} es de ${cuenta.data.platform}, no de ${platform}: se ignora`
      );
    } else {
      const tenantId = await resolveDefaultTenantId();
      if (tenantId) {
        await upsertZernioAccount({
          tenantId,
          platform,
          // O que se guarda sai da resposta do Zernio, não da query.
          zernioAccountId: cuenta.data.id,
          zernioProfileId: cuenta.data.profileId ?? params.get("profileId"),
          username: cuenta.data.username ?? username,
          displayName: cuenta.data.displayName ?? cuenta.data.name ?? username,
        });
        ok = true;
      }
    }
  }

  // Origem REAL de onde esta página é servida, não a da env: o opener é
  // same-origin com ela por definição, e se NEXT_PUBLIC_APP_URL não coincide exatamente
  // (outra porta em dev, por exemplo) o postMessage é descartado sem avisar.
  const origin = request.nextUrl.origin;

  return new NextResponse(
    popupHtml({
      origin: origin.replace(/\/$/, ""),
      payload: {
        ok,
        platform: platform ?? null,
        accountId,
        username,
        error: ok ? null : params.get("error") ?? "No se pudo conectar la cuenta",
      },
    }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

interface PopupHtmlArgs {
  origin: string;
  payload: Record<string, unknown>;
}

function popupHtml({ origin, payload }: PopupHtmlArgs): string {
  // Escapar `<` evita que um username com markup possa fechar o <script>.
  const data = JSON.stringify({ source: "zernio-connect", ...payload }).replace(
    /</g,
    "\\u003c"
  );
  const target = JSON.stringify(origin);
  const fallback = JSON.stringify(
    `${origin}/settings?canal=${payload.platform ?? "desconocido"}&estado=${payload.ok ? "ok" : "error"}`
  );

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Conectando…</title></head>
<body style="font:14px/1.5 system-ui,sans-serif;padding:32px;color:#334155">
<p>${payload.ok ? "Cuenta conectada. Podés cerrar esta ventana." : "No se pudo conectar la cuenta."}</p>
<script>
(function () {
  var data = ${data};
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage(data, ${target}); } catch (e) {}
    window.close();
  } else {
    location.replace(${fallback});
  }
})();
</script>
</body>
</html>`;
}
