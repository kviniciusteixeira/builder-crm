#!/usr/bin/env node
// ============================================================================
// Builder CRM - preparar uma base própria para Supabase Auth auto-hospedado
// ============================================================================
// O Supabase cloud traz de fábrica coisas que um Postgres normal não tem e que as
// migrações do CRM dão por certas:
//
//   - os papéis  anon, authenticated, service_role  (as políticas de RLS falam com eles),
//   - o esquema auth com seu dono supabase_auth_admin (onde o GoTrue cria auth.users),
//   - as funções auth.uid(), auth.role(), auth.email() e auth.jwt().
//
// Este script as cria se faltarem. É idempotente e NÃO toca em nada que já exista, então
// rodá-lo contra o Supabase cloud não faz mal: informa que não há nada a fazer.
//
// ORDEM IMPORTANTE. Há que rodá-lo ANTES de iniciar o GoTrue, porque o GoTrue espera
// encontrar o papel supabase_auth_admin, e o GoTrue tem que iniciar antes de aplicar
// as migrações do CRM, porque a última põe um gatilho sobre auth.users:
//
//   1. base de dados no ar
//   2. node scripts/preparar-auth-autoalojado.mjs
//   3. iniciar o GoTrue  (cria auth.users com suas próprias migrações)
//   4. npm run db:migrar
//
//   node scripts/preparar-auth-autoalojado.mjs
//   node scripts/preparar-auth-autoalojado.mjs --dry-run
//   node scripts/preparar-auth-autoalojado.mjs --auth-password 'otra'
//
// Sem --auth-password, supabase_auth_admin fica com a mesma senha que traz
// DATABASE_URL, que é o que faz o stack oficial do Supabase.
// ============================================================================

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.DATABASE_URL && existsSync(join(raiz, ".env.local"))) {
  try {
    const { config } = await import("dotenv");
    config({ path: join(raiz, ".env.local") });
  } catch {
    /* sem dotenv: o ambiente já tem que trazer DATABASE_URL */
  }
}

const args = process.argv.slice(2);
const simulacion = args.includes("--dry-run");
const valorDe = (bandera) => {
  const i = args.indexOf(bandera);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("[auth] falta DATABASE_URL (o DIRECT_URL). Revisa .env.example.");
  process.exit(1);
}

let authPassword = valorDe("--auth-password");
if (!authPassword) {
  try {
    authPassword = decodeURIComponent(new URL(url).password || "");
  } catch {
    authPassword = "";
  }
}
if (!authPassword) {
  console.error("[auth] no pude deducir la contrasena; pasala con --auth-password.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });

const hechos = [];
const omitidos = [];

async function existeRol(nombre) {
  const filas = await sql`select 1 from pg_roles where rolname = ${nombre}`;
  return filas.length > 0;
}

async function existeFuncion(firma) {
  const [fila] = await sql`select to_regprocedure(${firma}) is not null as hay`;
  return Boolean(fila?.hay);
}

async function duenoDeFuncion(firma) {
  const [fila] = await sql`
    select r.rolname
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
    where p.oid = to_regprocedure(${firma})
  `;
  return fila?.rolname ?? null;
}

async function existeEsquema(nombre) {
  const filas = await sql`select 1 from information_schema.schemata where schema_name = ${nombre}`;
  return filas.length > 0;
}

try {
  await sql`select 1`;

  // 1. Papéis ----------------------------------------------------------------
  // anon, authenticated e service_role não iniciam sessão: são os papéis aos quais
  // as políticas de RLS dão permissão. supabase_auth_admin sim, porque é o
  // usuário com o qual o GoTrue entra e o dono do esquema auth.
  for (const rol of ["anon", "authenticated", "service_role"]) {
    if (await existeRol(rol)) {
      omitidos.push(`rol ${rol}`);
      continue;
    }
    if (!simulacion) await sql.unsafe(`create role ${rol} nologin noinherit`);
    hechos.push(`rol ${rol}`);
  }

  if (await existeRol("supabase_auth_admin")) {
    omitidos.push("rol supabase_auth_admin");
  } else {
    if (!simulacion) {
      const escapada = authPassword.replace(/'/g, "''");
      await sql.unsafe(`create role supabase_auth_admin login createrole password '${escapada}'`);
    }
    hechos.push("rol supabase_auth_admin");
  }

  // 2. Esquema auth ----------------------------------------------------------
  if (await existeEsquema("auth")) {
    omitidos.push("esquema auth");
  } else {
    if (!simulacion) {
      await sql.unsafe(`create schema auth authorization supabase_auth_admin`);
    }
    hechos.push("esquema auth");
  }

  if (!simulacion) {
    // Permissões mínimas. O GoTrue precisa poder criar suas tabelas; os outros papéis só
    // precisam ver o esquema para que auth.uid() se resolva nas políticas.
    await sql.unsafe(`grant usage on schema auth to anon, authenticated, service_role`);
    await sql.unsafe(`grant all on schema auth to supabase_auth_admin`);
    await sql.unsafe(`alter role supabase_auth_admin set search_path = auth`);
  }

  // 3. Funções auth.* --------------------------------------------------------
  // Leem os claims que o portador do token deixa na sessão. Sem PostgREST ninguém
  // os define, então devolvem null e as políticas negam tudo: é o correto,
  // porque a aplicação entra com o usuário dono das tabelas e não passa por RLS.
  const funciones = [
    [
      "auth.uid()",
      `create function auth.uid() returns uuid language sql stable as $fn$
         select coalesce(
           nullif(current_setting('request.jwt.claim.sub', true), ''),
           (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
         )::uuid
       $fn$`,
    ],
    [
      "auth.role()",
      `create function auth.role() returns text language sql stable as $fn$
         select coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
         )::text
       $fn$`,
    ],
    [
      "auth.email()",
      `create function auth.email() returns text language sql stable as $fn$
         select coalesce(
           nullif(current_setting('request.jwt.claim.email', true), ''),
           (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
         )::text
       $fn$`,
    ],
    [
      "auth.jwt()",
      `create function auth.jwt() returns jsonb language sql stable as $fn$
         select coalesce(
           nullif(current_setting('request.jwt.claim', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')
         )::jsonb
       $fn$`,
    ],
  ];

  // O dono TEM que ser supabase_auth_admin. O GoTrue volta a declarar auth.uid() e
  // auth.role() na primeira migração com "create or replace", e se as funções
  // são de outro dono o Postgres rejeita ("must be owner of function uid") e o GoTrue
  // entra em ciclo de reinício sem criar auth.users.
  for (const [firma, ddl] of funciones) {
    if (await existeFuncion(firma)) {
      const dueno = await duenoDeFuncion(firma);
      if (dueno === "supabase_auth_admin") {
        omitidos.push(`funcion ${firma}`);
      } else {
        if (!simulacion) await sql.unsafe(`alter function ${firma} owner to supabase_auth_admin`);
        hechos.push(`dueno de ${firma} (era ${dueno})`);
      }
      continue;
    }
    if (!simulacion) {
      await sql.unsafe(ddl);
      await sql.unsafe(`alter function ${firma} owner to supabase_auth_admin`);
      await sql.unsafe(`grant execute on function ${firma} to anon, authenticated, service_role`);
    }
    hechos.push(`funcion ${firma}`);
  }

  // 4. Relatório -------------------------------------------------------------
  const prefijo = simulacion ? "[auth] (simulacion) " : "[auth] ";
  if (hechos.length === 0) {
    console.log(`${prefijo}nada que hacer: la base ya tiene los roles, el esquema y las funciones.`);
    console.log("[auth] si esto es Supabase cloud, es lo esperado.");
  } else {
    console.log(`${prefijo}creado: ${hechos.join(", ")}`);
    if (omitidos.length) console.log(`[auth] ya existia: ${omitidos.join(", ")}`);
    if (!simulacion) {
      console.log("[auth] listo. Ahora arranca GoTrue y despues corre npm run db:migrar.");
    }
  }
} catch (err) {
  console.error(`[auth] fallo: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
