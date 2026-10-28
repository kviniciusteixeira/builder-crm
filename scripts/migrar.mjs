#!/usr/bin/env node
// Aplica as migrações SQL pendentes sobre a base (Supabase Postgres).
//
//   node scripts/migrar.mjs            aplica o pendente
//   node scripts/migrar.mjs --status   lista aplicadas e pendentes, não toca em nada
//   node scripts/migrar.mjs --dry-run  mostra o que aplicaria
//
// Fontes, nesta ordem:
//   1. supabase/migrations/*.sql           (núcleo)
//   2. modules/<modulo>/migrations/*.sql   (só módulos ativos; ver src/lib/modules)
//
// Cada arquivo se aplica inteiro dentro de uma transação e se registra em
// public._migraciones por nome: ou entra tudo, ou não entra nada, e uma segunda execução
// não o aplica de novo. No final habilita RLS em qualquer tabela de `public` que não
// o tenha (rede de segurança para tabelas de módulos).
//
// Roda ao iniciar o contêiner (docker/entrypoint.sh): se a base ainda não
// responde, tenta de novo 15 vezes a cada 2 s antes de desistir.
//
// Conexão: DIRECT_URL se existir (conexão direta, porta 5432), senão DATABASE_URL.
// O pooler em modo transação também serve: não se usam prepared statements.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { listarMigraciones } from "./lib/migraciones.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

// Em desenvolvimento as variáveis estão em .env.local; no contêiner vêm do ambiente.
// dotenv é devDependency: carrega-se só se estiver disponível.
if (!process.env.DATABASE_URL && existsSync(join(raiz, ".env.local"))) {
  try {
    const { config } = await import("dotenv");
    config({ path: join(raiz, ".env.local") });
  } catch {
    /* sem dotenv: o ambiente já tem que trazer DATABASE_URL */
  }
}

const args = new Set(process.argv.slice(2));
const soloEstado = args.has("--status");
const simulacion = args.has("--dry-run");

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("[migrar] falta DATABASE_URL (o DIRECT_URL). Revisa .env.example.");
  process.exit(1);
}

const archivos = listarMigraciones(raiz);

async function conectar() {
  const intentos = 15;
  for (let i = 1; i <= intentos; i++) {
    const sql = postgres(url, {
      prepare: false,
      max: 1,
      connect_timeout: 10,
      // As migrações usam RAISE NOTICE para contar o que fizeram. Sem isto, o
      // driver imprime o objeto inteiro do aviso e parece que algo quebrou.
      onnotice: (aviso) => console.log(`[migrar] aviso: ${aviso.message}`),
    });
    try {
      await sql`select 1`;
      return sql;
    } catch (err) {
      await sql.end({ timeout: 1 }).catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      if (i === intentos) {
        console.error(`[migrar] la base no responde tras ${intentos} intentos: ${msg}`);
        process.exit(1);
      }
      console.log(`[migrar] base no disponible (${msg}); reintento ${i}/${intentos} en 2 s`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("inalcanzable");
}

const sql = await conectar();

try {
  await sql`create table if not exists public._migraciones (
    nombre text primary key,
    aplicada_en timestamptz not null default now()
  )`;
  await sql`alter table public._migraciones enable row level security`;

  const aplicadas = new Set(
    (await sql`select nombre from public._migraciones`).map((r) => r.nombre)
  );
  const pendientes = archivos.filter((a) => !aplicadas.has(a.nombre));

  if (soloEstado || simulacion) {
    for (const a of archivos) {
      console.log(`${aplicadas.has(a.nombre) ? "aplicada " : "PENDIENTE"}  ${a.nombre}`);
    }
    console.log(`[migrar] ${aplicadas.size} aplicadas, ${pendientes.length} pendientes`);
  } else {
    for (const a of pendientes) {
      const contenido = readFileSync(a.ruta, "utf8");
      const inicio = Date.now();
      await sql.begin(async (tx) => {
        await tx.unsafe(contenido);
        await tx`insert into public._migraciones (nombre) values (${a.nombre})`;
      });
      console.log(`[migrar] aplicada ${a.nombre} (${Date.now() - inicio} ms)`);
    }
    if (pendientes.length === 0) console.log("[migrar] nada pendiente");

    // Rede de segurança: nenhuma tabela de public sem RLS (cobre tabelas de módulos).
    const sinRls = await sql`
      select c.relname as tabla
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    for (const { tabla } of sinRls) {
      await sql.unsafe(`alter table public."${tabla}" enable row level security`);
      console.log(`[migrar] RLS habilitado en ${tabla} (faltaba)`);
    }
    console.log(`[migrar] listo: ${aplicadas.size + pendientes.length} migraciones en total`);
  }
} catch (err) {
  const mensaje = err instanceof Error ? err.message : String(err);
  console.error("[migrar] fallo:", mensaje);
  // Os dois tropeços de quem hospeda o próprio Postgres. No Supabase cloud não acontecem
  // porque o esquema auth e auth.users já vêm prontos.
  if (/schema "auth" does not exist/i.test(mensaje)) {
    console.error("[migrar] La base no tiene el esquema auth.");
    console.error("[migrar] Si es Supabase cloud, la URL no apunta a ese proyecto.");
    console.error("[migrar] Si es tu propio Postgres: npm run auth:preparar (docs/SUPABASE-NO-VPS.md).");
  } else if (/relation "auth\.users" does not exist/i.test(mensaje)) {
    console.error("[migrar] El esquema auth existe pero todavia no hay auth.users.");
    console.error("[migrar] Eso lo crea GoTrue la primera vez que arranca: levanta el");
    console.error("[migrar] contenedor de autenticacion y volve a correr esto");
    console.error("[migrar] (docs/SUPABASE-NO-VPS.md: el paso 3 va antes del 4).");
  }
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
