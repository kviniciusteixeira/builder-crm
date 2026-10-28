// Conecta sua WABA existente ao Zernio sem passar pelo browser (BYO-WABA) e a guarda
// em `channel_accounts`.
//
//   node scripts/zernio-connect-whatsapp.mjs [--pin 123456]
//
// Este é o caminho correto quando o número JÁ está numa WABA. O Embedded Signup
// do browser não serve nesse caso: a Meta o lista como "não cumpre os requisitos"
// porque não pode re-onboardar um número que já pertence a uma WABA. A coexistência
// também não se aplica — essa é para números que vivem SÓ no app WhatsApp Business.
//
// O número e a WABA continuam sendo seus: o Zernio só recebe credenciais para
// operá-la. Reusa as que você já tem em .env.local do fluxo de Meta direto:
//   WHATSAPP_ACCESS_TOKEN        (System User token permanente)
//   WHATSAPP_BUSINESS_ACCOUNT_ID (WABA ID)
//   WHATSAPP_PHONE_NUMBER_ID
//
// O token precisa das permissões whatsapp_business_management e
// whatsapp_business_messaging. Se você usa um token temporário do console da Meta vai
// funcionar hoje e falhar em 24 horas: gere um de System User.

import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const API_BASE = process.env.ZERNIO_API_BASE || "https://zernio.com/api/v1";
const API_KEY = process.env.ZERNIO_API_KEY || "";
const PROFILE_ID = process.env.ZERNIO_PROFILE_ID || "";

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";

// PIN de verificação em dois passos do número. Se o número o tem ativado — e
// qualquer número de negócio real o tem — sem isto a Meta rejeita o registro na
// Cloud API com o erro 133005 e o número fica conectado mas sem poder enviar.
// Passa-se por env ou por `--pin 123456`.
const pinArgIndex = process.argv.indexOf("--pin");
const PIN =
  (pinArgIndex !== -1 ? process.argv[pinArgIndex + 1] : "") ||
  process.env.WHATSAPP_TWO_STEP_PIN ||
  "";

if (PIN && !/^\d{6}$/.test(PIN)) {
  console.error("El PIN tiene que ser de 6 digitos.");
  process.exit(1);
}

const missing = Object.entries({
  ZERNIO_API_KEY: API_KEY,
  WHATSAPP_ACCESS_TOKEN: ACCESS_TOKEN,
  WHATSAPP_BUSINESS_ACCOUNT_ID: WABA_ID,
  WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.error(`Faltan variables en .env.local:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

async function main() {
  console.log(`Conectando WABA ${WABA_ID} (phone ${PHONE_NUMBER_ID}) a Zernio...\n`);

  const res = await fetch(`${API_BASE}/connect/whatsapp/credentials`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      ...(PROFILE_ID ? { profileId: PROFILE_ID } : {}),
      accessToken: ACCESS_TOKEN,
      wabaId: WABA_ID,
      phoneNumberId: PHONE_NUMBER_ID,
      ...(PIN ? { pin: PIN } : {}),
    }),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* resposta não-JSON */
  }

  if (!res.ok) {
    console.error(`Zernio devolvio HTTP ${res.status}:`);
    console.error(text.slice(0, 800));
    if (res.status === 401 || res.status === 403) {
      console.error("\nRevisa ZERNIO_API_KEY.");
    }
    if (/token/i.test(text)) {
      console.error(
        "\nSi el error habla del token de Meta: tiene que ser un System User token permanente\n" +
          "con whatsapp_business_management y whatsapp_business_messaging."
      );
    }
    process.exitCode = 1;
    return;
  }

  const accountId = json?.accountId ?? json?.account?.id ?? json?.id ?? null;
  console.log("Conectada.", accountId ? `accountId = ${accountId}` : "");

  if (!accountId) {
    console.log(
      "\nZernio no devolvio accountId. Corre `npm run zernio:setup --sync` para traerla."
    );
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("\nDATABASE_URL no seteada: no se guardo en channel_accounts.");
    return;
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    const [tenant] = await sql`select id from tenants where slug = 'default' limit 1`;
    if (!tenant) {
      console.error("No existe el tenant 'default'. Aplica antes las migraciones.");
      process.exitCode = 1;
      return;
    }

    await sql`
      insert into channel_accounts
        (tenant_id, provider, platform, zernio_account_id, zernio_profile_id,
         external_ref, display_name, status, connected_at)
      values
        (${tenant.id}, 'zernio', 'whatsapp', ${accountId}, ${PROFILE_ID || null},
         ${PHONE_NUMBER_ID}, 'WhatsApp', 'active', now())
      on conflict (zernio_account_id) do update set
        platform     = 'whatsapp',
        external_ref = excluded.external_ref,
        status       = 'active',
        updated_at   = now()
    `;

    // As conversas de WhatsApp que ficaram do fluxo de Meta direto apontam para
    // um adapter que já não queremos usar. Reapontam-se para a conta do Zernio para que o
    // próxima saída saia pelo provedor correto.
    const repointed = await sql`
      update conversations
      set account_id = (select id from channel_accounts where zernio_account_id = ${accountId})
      where channel = 'whatsapp' and provider = 'meta'
      returning id
    `;

    console.log(`Guardada en channel_accounts.`);
    if (repointed.length > 0) {
      console.log(
        `${repointed.length} conversacion(es) de WhatsApp legacy quedaron apuntando a la cuenta de Zernio.`
      );
      console.log(
        "Siguen con provider='meta' a proposito: cuando el cliente vuelva a escribir,\n" +
          "Zernio crea el hilo nuevo con su propio id. Si preferis empezar limpio:\n" +
          "  delete from messages; delete from conversations;"
      );
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
