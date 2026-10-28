#!/usr/bin/env node
// Cria (ou promove) um administrador sem passar pela tela de registro.
//
//   node scripts/crear-admin.mjs --email admin@cliente.com --password 'Secreta123' [--nombre "Ana"]
//
// A skill `deploy-coolify` o usa para deixar uma conta de demo pronta numa instância
// recém-implantada. Precisa de SUPABASE_SERVICE_ROLE_KEY (só server-side, nunca no
// navegador) e DATABASE_URL.
//
// - Se o email não existe no Auth, cria-o confirmado (sem e-mail de verificação).
// - Se já existe, reutiliza o usuário.
// - Em team_members fica como admin e ativo (upsert).

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.DATABASE_URL && existsSync(join(raiz, ".env.local"))) {
  try {
    const { config } = await import("dotenv");
    config({ path: join(raiz, ".env.local") });
  } catch {
    /* sem dotenv */
  }
}

const args = process.argv.slice(2);
const valor = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = valor("--email")?.trim().toLowerCase();
const password = valor("--password");
const nombre = valor("--nombre") ?? null;

if (!email || !password) {
  console.error("Uso: node scripts/crear-admin.mjs --email <email> --password <contrasena> [--nombre <nombre>]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("La contrasena debe tener al menos 8 caracteres.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url || !serviceRole || !dbUrl) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DATABASE_URL (ver .env.example).");
  process.exit(1);
}

const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

let userId;
const creado = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: nombre },
});
if (creado.data.user) {
  userId = creado.data.user.id;
  console.log(`[admin] usuario de Auth creado: ${email}`);
} else {
  // Já existe: buscamos por email (paginando: a API não filtra por email).
  let pagina = 1;
  while (!userId) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) {
      console.error("[admin] no se pudo listar usuarios:", error.message);
      process.exit(1);
    }
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) userId = u.id;
    else if (data.users.length < 200) break;
    else pagina++;
  }
  if (!userId) {
    console.error("[admin] Auth rechazo el alta y el email no existe:", creado.error?.message);
    process.exit(1);
  }
  const upd = await admin.auth.admin.updateUserById(userId, { password });
  if (upd.error) console.warn("[admin] no se pudo actualizar la contrasena:", upd.error.message);
  console.log(`[admin] usuario de Auth existente reutilizado: ${email}`);
}

const sql = postgres(dbUrl, { prepare: false, max: 1 });
try {
  await sql`
    insert into team_members (id, email, name, role, active)
    values (${userId}, ${email}, ${nombre}, 'admin', true)
    on conflict (id) do update
      set role = 'admin', active = true, name = coalesce(excluded.name, team_members.name), updated_at = now()`;
  console.log(`[admin] ${email} es administrador activo`);
} finally {
  await sql.end({ timeout: 5 });
}
