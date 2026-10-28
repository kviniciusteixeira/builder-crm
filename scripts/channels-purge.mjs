// Elimina as conversas e mensagens das contas desconectadas.
//
//   npm run channels:purge                 mostra o que apagaria (não toca em nada)
//   npm run channels:purge -- --apply      apaga de verdade
//   npm run channels:purge -- --apply --account <zernioAccountId>
//   npm run channels:purge -- --apply --drop-accounts   além disso apaga a linha da conta
//   npm run channels:purge -- --dedupe [--apply]        limpa mensagens de saída duplicadas
//
// Quando uma conta se desconecta, o CRM a marca `disconnected` e deixa de mostrar seus
// fios na caixa de entrada, mas NÃO apaga nada: se a mesma conta se conectar de novo, o
// histórico reaparece sozinho. Este script é para quando você já não quiser mais.
//
// É DESTRUTIVO E NÃO DÁ PARA DESFAZER. Por isso o default é dry-run.

import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const DEDUPE = process.argv.includes("--dedupe");
const DROP_ACCOUNTS = process.argv.includes("--drop-accounts");
const accIdx = process.argv.indexOf("--account");
const SOLO_CUENTA = accIdx !== -1 ? process.argv[accIdx + 1] : null;

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  max: 1,
  onnotice: () => {},
});

/**
 * Limpa os duplicados que o bug do id de envio deixou.
 *
 * Até que se arrumou `extractMessageId`, a linha que `deliverMessage` escrevia
 * ficava sem external_id. Quando depois chegava o webhook `message.sent` com o
 * eco da mesma mensagem, o índice único não podia freá-lo (é parcial) e se inseria
 * uma segunda linha. Resultado: a mensagem aparecia duas vezes na caixa de entrada embora ao
 * cliente chegasse uma só.
 *
 * Apaga-se SEMPRE a linha sem external_id: é a órfã. A que traz o id do
 * provedor é a que serve para correlacionar entregas e leituras.
 */
async function dedupeSalientes() {
  const pares = await sql`
    select a.id as huerfano, left(a.body, 50) as body, a.created_at
    from messages a
    join messages b
      on b.conversation_id = a.conversation_id
     and b.direction = 'out' and a.direction = 'out'
     and b.body = a.body
     and b.id <> a.id
     and b.external_id is not null
     and abs(extract(epoch from (b.created_at - a.created_at))) < 120
    where a.external_id is null
    order by a.created_at desc`;

  console.log(
    APPLY
      ? "BORRANDO duplicados"
      : "SIMULACION de duplicados, no se toca nada"
  );
  console.log(`Pares duplicados encontrados: ${pares.length}`);
  for (const d of pares) {
    console.log(`  ${d.created_at.toISOString().slice(0, 16)}  ${d.body}`);
  }

  if (pares.length === 0) {
    console.log("\nNada para limpiar.");
    return;
  }

  if (!APPLY) {
    console.log("\nPara aplicarlo:  npm run channels:purge -- --dedupe --apply");
    return;
  }

  const ids = pares.map((d) => d.huerfano);
  await sql`delete from messages where id = any(${ids})`;
  console.log(`\nBorradas ${ids.length} filas duplicadas.`);
}

async function main() {
  if (DEDUPE) {
    await dedupeSalientes();
    await sql.end();
    return;
  }

  const cuentas = SOLO_CUENTA
    ? await sql`
        select id, platform, username, status, zernio_account_id
        from channel_accounts
        where zernio_account_id = ${SOLO_CUENTA} or id::text = ${SOLO_CUENTA}`
    : await sql`
        select id, platform, username, status, zernio_account_id
        from channel_accounts
        where status = 'disconnected'
        order by platform`;

  if (cuentas.length === 0) {
    console.log(
      SOLO_CUENTA
        ? `No encontre ninguna cuenta con ese id.`
        : "No hay cuentas desconectadas. Nada para limpiar."
    );
    await sql.end();
    return;
  }

  console.log(
    APPLY ? "BORRANDO (esto no se puede deshacer)\n" : "SIMULACION — no se toca nada\n"
  );

  let totalHilos = 0;
  let totalMensajes = 0;

  for (const c of cuentas) {
    const [{ hilos }] = await sql`
      select count(*)::int as hilos from conversations where account_id = ${c.id}`;
    const [{ msgs }] = await sql`
      select count(*)::int as msgs from messages
      where conversation_id in (select id from conversations where account_id = ${c.id})`;

    console.log(
      `${c.platform.padEnd(10)} ${String(c.username ?? "-").padEnd(24)} ` +
        `${String(c.status).padEnd(13)} ${String(hilos).padStart(3)} hilos, ${String(msgs).padStart(4)} mensajes`
    );

    totalHilos += hilos;
    totalMensajes += msgs;

    if (!APPLY || hilos === 0) continue;

    // Ordem: primeiro as mensagens, depois os fios. Os agendamentos e as atividades do
    // contato NÃO se tocam: são do contato, não do canal pelo qual escreveu.
    await sql`
      delete from messages
      where conversation_id in (select id from conversations where account_id = ${c.id})`;

    // Trabalhos do agente que ficaram enfileirados para esses fios.
    await sql`
      delete from agent_jobs
      where conversation_id in (select id from conversations where account_id = ${c.id})`;

    await sql`delete from conversations where account_id = ${c.id}`;

    if (DROP_ACCOUNTS) {
      await sql`delete from channel_accounts where id = ${c.id}`;
      console.log(`  cuenta eliminada`);
    }
  }

  console.log(
    `\n${APPLY ? "Borrados" : "Se borrarian"}: ${totalHilos} hilos y ${totalMensajes} mensajes ` +
      `de ${cuentas.length} cuenta(s).`
  );

  if (!APPLY && totalHilos > 0) {
    console.log("\nPara aplicarlo de verdad:  npm run channels:purge -- --apply");
    console.log("Los contactos, citas y actividades NO se tocan.");
  }

  // Contatos que ficaram sem nenhuma conversa nem operação: ficam órfãos
  // na lista e não servem para nada.
  const [{ huerfanos }] = await sql`
    select count(*)::int as huerfanos from contacts c
    where not exists (select 1 from conversations v where v.contact_id = c.id)
      and not exists (select 1 from deals d where d.contact_id = c.id)
      and not exists (select 1 from activities a where a.contact_id = c.id)`;

  if (huerfanos > 0) {
    console.log(
      `\nAviso: quedan ${huerfanos} contactos sin conversaciones, operaciones ni ` +
        `actividades.\nSe pueden borrar desde Contactos si no los queres.`
    );
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error(err.message);
  await sql.end().catch(() => {});
  process.exit(1);
});
