#!/usr/bin/env node
// ============================================================================
// Builder CRM - rodar no seu PC sem criar uma conta em lugar nenhum
// ============================================================================
//
//   npm run local                 inicia (na primeira vez prepara tudo)
//   npm run local -- --reset      apaga a base local e começa do zero
//   npm run local -- --sin-datos  sem dados de demonstração
//   npm run local -- --puerto 3001
//
// O que faz, em ordem:
//
//   1. Abre um Postgres EMBUTIDO guardado em .local/db. É Postgres de verdade
//      compilado para WebAssembly, instalado como um pacote de npm: não há Docker, não
//      há serviço para instalar e não há conta para criar.
//   2. Acrescenta o que o Supabase traz de fábrica e um Postgres pelado não: os papéis
//      anon / authenticated / service_role, o esquema auth, auth.uid() e uma tabela
//      auth.users (que numa instância de verdade o GoTrue cria).
//   3. Aplica AS MESMAS migrações que uma instância implantada, com seu RLS.
//   4. Cadastra o administrador da demo inserindo-o em auth.users, para que o
//      mesmo gatilho do primeiro admin que roda em produção o crie.
//   5. Inicia `next dev` com MODO_LOCAL=true e carrega os dados demo.
//
// O que NÃO é: não há servidor de autenticação, então não há login nem equipe nem
// convites por e-mail. Quem abre a URL entra como administrador. Para testar isso
// faz falta uma instância de verdade (ver README).
// ============================================================================

import { existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { listarMigraciones, modulosActivos } from "./lib/migraciones.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const requerir = createRequire(import.meta.url);

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const sinDatos = args.includes("--sin-datos");
const iPuerto = args.indexOf("--puerto");
const puerto = iPuerto >= 0 ? Number(args[iPuerto + 1]) : 3000;

const CARPETA = join(raiz, ".local", "db");
const ID_ADMIN = "00000000-0000-4000-8000-000000000001";
const EMAIL_ADMIN = "demo@local";

function paso(texto) {
  console.log(`[local] ${texto}`);
}

// .env.local é opcional no modo local (é disso que se trata), mas se existir há que lê-lo
// antes de opinar sobre quais capacidades estão ligadas.
if (existsSync(join(raiz, ".env.local"))) {
  try {
    const { config } = await import("dotenv");
    config({ path: join(raiz, ".env.local"), quiet: true });
  } catch {
    /* sem dotenv: não tem problema, o modo local não precisa de variáveis */
  }
}

// --- 1. o pacote do Postgres embutido --------------------------------------
let PGlite, pgcrypto;
try {
  ({ PGlite } = requerir("@electric-sql/pglite"));
  ({ pgcrypto } = requerir("@electric-sql/pglite/contrib/pgcrypto"));
} catch {
  console.error("[local] falta @electric-sql/pglite. Corre `npm install` y volve a intentar.");
  process.exit(1);
}

if (reset && existsSync(CARPETA)) {
  rmSync(CARPETA, { recursive: true, force: true });
  paso("base local borrada (--reset)");
}
mkdirSync(CARPETA, { recursive: true });

const esNueva = !existsSync(join(CARPETA, "PG_VERSION"));
const db = new PGlite({ dataDir: CARPETA, extensions: { pgcrypto } });
await db.waitReady;
paso(`base embebida en .local/db${esNueva ? " (nueva)" : ""}`);

// --- 2. o que o Supabase traz de fábrica ------------------------------------
// Idempotente: rodar de novo não toca em nada. auth.users é um arremedo mínimo com as
// três colunas que as migrações do CRM leem; numa instância real o GoTrue a cria
// com muitas mais.
const SHIM_AUTH = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role noinherit bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $f$;
create or replace function auth.email() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.email', true), '') $f$;
`;

let sembrar = false;
try {
  await db.exec(SHIM_AUTH);
  if (esNueva) paso("esquema auth preparado (roles, auth.users, auth.uid)");

  // --- 3. as mesmas migrações que uma instância de verdade ----------------
  await db.exec(`
    create table if not exists public._migraciones (
      nombre text primary key,
      aplicada_en timestamptz not null default now()
    );
    alter table public._migraciones enable row level security;
  `);

  const aplicadas = new Set(
    (await db.query("select nombre from public._migraciones")).rows.map((r) => r.nombre)
  );
  const pendientes = listarMigraciones(raiz).filter((a) => !aplicadas.has(a.nombre));

  for (const a of pendientes) {
    const contenido = readFileSync(a.ruta, "utf8");
    const inicio = Date.now();
    try {
      await db.transaction(async (tx) => {
        await tx.exec(contenido);
        await tx.query("insert into public._migraciones (nombre) values ($1)", [a.nombre]);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // pgvector não existe no Postgres embutido. É o único do repositório que o pede
      // (módulo propiedades, para a busca por significado). Avisa-se e segue-se:
      // o resto do módulo funciona.
      if (/extension "vector" is not available|type "vector" does not exist/i.test(msg)) {
        paso(`AVISO ${a.nombre} no se aplico: el Postgres embebido no trae pgvector.`);
        paso("AVISO   la busqueda semantica de propiedades no anda en local; el resto si.");
        continue;
      }
      throw new Error(`${a.nombre}: ${msg}`);
    }
    paso(`aplicada ${a.nombre} (${Date.now() - inicio} ms)`);
  }
  if (pendientes.length === 0) paso("migraciones al dia");

  // Rede de segurança, igual a scripts/migrar.mjs: nenhuma tabela de public sem RLS.
  const sinRls = await db.query(`
    select c.relname as tabla from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  for (const { tabla } of sinRls.rows) {
    await db.exec(`alter table public."${tabla}" enable row level security`);
    paso(`RLS habilitado en ${tabla} (faltaba)`);
  }

  // --- 4. o administrador da demo ------------------------------------------
  // Insere-se em auth.users e o gatilho do primeiro admin o cadastra, que é o
  // mesmo caminho que roda numa instância implantada.
  const yaEsta = await db.query("select 1 from public.team_members where id = $1", [ID_ADMIN]);
  if (yaEsta.rows.length === 0) {
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, $2, '{"full_name":"Cuenta demo"}'::jsonb)
       on conflict (id) do nothing`,
      [ID_ADMIN, EMAIL_ADMIN]
    );
    const creado = await db.query("select 1 from public.team_members where id = $1", [ID_ADMIN]);
    if (creado.rows.length === 0) {
      // Já havia equipe: o gatilho não cadastra o segundo. Acontece se alguém rodou
      // migrações e criou um admin antes. Insere-se à mão para que o modo local
      // tenha com quem entrar.
      await db.query(
        `insert into public.team_members (id, email, name, role, active)
         values ($1, $2, 'Cuenta demo', 'admin', true) on conflict (id) do nothing`,
        [ID_ADMIN, EMAIL_ADMIN]
      );
    }
    paso(`administrador de la demo listo (${EMAIL_ADMIN})`);
  }

  const contactos = await db.query("select count(*)::int n from public.contacts");
  sembrar = !sinDatos && contactos.rows[0].n === 0;
} catch (err) {
  console.error("[local] fallo preparando la base:", err instanceof Error ? err.message : err);
  console.error("[local] si quedo a medias: npm run local -- --reset");
  await db.close().catch(() => {});
  process.exit(1);
}

// A base embutida é um arquivo com um só dono: há que soltá-la ANTES que o
// servidor de desenvolvimento a abra.
await db.close();

const activos = modulosActivos(raiz);
paso(`modulos activos: ${activos.length ? activos.join(", ") : "(ninguno)"}`);

// --- 5. o servidor ----------------------------------------------------------
const servidor = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", "-p", String(puerto)],
  {
    cwd: raiz,
    stdio: "inherit",
    env: { ...process.env, MODO_LOCAL: "true" },
    shell: process.platform === "win32",
  }
);

servidor.on("exit", (codigo) => process.exit(codigo ?? 0));
for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => servidor.kill(senal));
}

const base = `http://localhost:${puerto}`;

async function esperarServidor() {
  const limite = Date.now() + 180_000;
  while (Date.now() < limite) {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      /* ainda compilando */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

if (await esperarServidor()) {
  if (sembrar) {
    paso("cargando datos de demostracion...");
    try {
      const res = await fetch(`${base}/api/seed/demo`, {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        paso(`datos demo: ${json.contactos} contactos, ${json.conversaciones} conversaciones`);
      } else {
        paso(`los datos demo no cargaron (${res.status}). Podes cargarlos desde el inicio.`);
      }
    } catch {
      paso("los datos demo no cargaron. Podes cargarlos con el boton del inicio.");
    }
  }
  console.log("");
  paso(`listo: ${base}`);
  paso("entras directo, sin login: en modo local no hay sesion.");
  if (!process.env.OPENROUTER_API_KEY) {
    paso("el agente de IA esta apagado (falta OPENROUTER_API_KEY en .env.local).");
  }
  console.log("");
}
