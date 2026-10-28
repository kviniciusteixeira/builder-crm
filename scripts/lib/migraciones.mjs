// Quais arquivos de migração há que aplicar e em que ordem.
//
// Usam os dois executores: `scripts/migrar.mjs` (Postgres de verdade, pela rede) e
// `scripts/local.mjs` (Postgres embutido, modo local). A lista tem que ser a mesma
// nos dois: senão, uma instância local e uma implantada teriam esquemas distintos e
// o modo local deixaria de servir para testar qualquer coisa.
//
//   1. supabase/migrations/*.sql           (núcleo)
//   2. modules/<modulo>/migrations/*.sql   (só módulos ativos)

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function listarSql(dir, prefijo) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ nombre: `${prefijo}${f}`, ruta: join(dir, f) }));
}

/** Módulos ativos segundo config/modulos.json (a mesma lista que lê config/cliente.ts). */
export function modulosActivos(raiz) {
  const archivo = join(raiz, "config", "modulos.json");
  if (!existsSync(archivo)) return [];
  try {
    const json = JSON.parse(readFileSync(archivo, "utf8"));
    const lista = Array.isArray(json?.activos) ? json.activos : [];
    return lista.filter((m) => typeof m === "string" && /^[a-z][a-z0-9_]*$/.test(m));
  } catch {
    return [];
  }
}

/** `[{ nombre, ruta }]` em ordem de aplicação. */
export function listarMigraciones(raiz) {
  return [
    ...listarSql(join(raiz, "supabase", "migrations"), ""),
    ...modulosActivos(raiz).flatMap((m) =>
      listarSql(join(raiz, "modules", m, "migrations"), `modules/${m}/`)
    ),
  ];
}
