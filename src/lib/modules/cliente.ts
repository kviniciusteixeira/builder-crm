import { z } from "zod";
import { MANIFIESTOS } from "./registro-cliente.generated";
import { esquemaCampo, type CampoConfig } from "@/lib/config/schema";
import type { ManifiestoModulo, ItemNavModulo } from "./types";

/**
 * Lado navegador do sistema de módulos: só manifestos (nav, campos). Usam o
 * sidebar e a configuração. Nada daqui toca a base de dados.
 */

export function manifiestosActivos(): ManifiestoModulo[] {
  return MANIFIESTOS;
}

export interface EntradaNavModulo extends ItemNavModulo {
  href: string;
  modulo: string;
}

export function navModulos(): EntradaNavModulo[] {
  return MANIFIESTOS.flatMap((m) =>
    (m.nav ?? []).map((item) => ({
      ...item,
      modulo: m.nombre,
      href: item.ruta ? `/m/${m.nombre}/${item.ruta.replace(/^\/+/, "")}` : `/m/${m.nombre}`,
    }))
  );
}

let camposCache: CampoConfig[] | null = null;
let erroresCache: string[] | null = null;

function parsearCampos() {
  if (camposCache && erroresCache) return;
  const campos: CampoConfig[] = [];
  const errores: string[] = [];
  for (const m of MANIFIESTOS) {
    const r = z.array(esquemaCampo).safeParse(m.campos ?? []);
    if (r.success) campos.push(...r.data);
    else errores.push(...r.error.issues.map((i) => `modulo ${m.nombre}, campos.${i.path.join(".")}: ${i.message}`));
  }
  camposCache = campos;
  erroresCache = errores;
}

/** Campos de contato aportados pelos módulos ativos (já validados). */
export function camposDeModulos(): CampoConfig[] {
  parsearCampos();
  return camposCache ?? [];
}

/** Problemas nos manifestos dos módulos ativos (vazio se tudo está bem). */
export function erroresDeModulos(): string[] {
  parsearCampos();
  return erroresCache ?? [];
}
