import "server-only";
import { MODULOS_SERVIDOR } from "./registro.generated";
import type { ModuloServidor, MetodoHttp, HandlerModulo, PaginaModulo } from "./types";

/**
 * Lado servidor do sistema de módulos. O registro (`registro.generated.ts`) o
 * escreve scripts/generar-registro-modulos.mjs a partir de config/modulos.json, com
 * imports estáticos: só os módulos ativos entram no bundle.
 */

export function modulosActivos(): ModuloServidor[] {
  return Object.values(MODULOS_SERVIDOR);
}

export function obtenerModulo(nombre: string): ModuloServidor | null {
  return MODULOS_SERVIDOR[nombre] ?? null;
}

/** Todas as tools dos módulos ativos (o agente as soma às do núcleo). */
export function toolsDeModulos() {
  return modulosActivos().flatMap((m) => m.tools ?? []);
}

/**
 * Resolve um padrão ("", "nueva", "[id]", "[id]/editar") contra os segmentos da
 * URL. Prefere o padrão com mais segmentos literais (os `[x]` capturam).
 */
export function resolverPatron<T>(
  patrones: Record<string, T>,
  segmentos: string[]
): { valor: T; params: Record<string, string> } | null {
  const candidatos = Object.keys(patrones)
    .map((clave) => ({ clave, partes: clave === "" ? [] : clave.split("/") }))
    .filter((c) => c.partes.length === segmentos.length)
    .sort((a, b) => literales(b.partes) - literales(a.partes));

  for (const c of candidatos) {
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < c.partes.length; i++) {
      const p = c.partes[i];
      const s = segmentos[i];
      if (p.startsWith("[") && p.endsWith("]")) {
        params[p.slice(1, -1)] = decodeURIComponent(s);
      } else if (p !== s) {
        ok = false;
        break;
      }
    }
    if (ok) return { valor: patrones[c.clave], params };
  }
  return null;
}

function literales(partes: string[]): number {
  return partes.filter((p) => !(p.startsWith("[") && p.endsWith("]"))).length;
}

export function resolverPagina(modulo: ModuloServidor, segmentos: string[]) {
  return resolverPatron<PaginaModulo>(modulo.paginas ?? {}, segmentos);
}

export function resolverApi(modulo: ModuloServidor, metodo: MetodoHttp, segmentos: string[]) {
  const match = resolverPatron(modulo.api ?? {}, segmentos);
  if (!match) return null;
  const handler: HandlerModulo | undefined = match.valor[metodo];
  if (!handler) return { handler: null, params: match.params, metodosPermitidos: Object.keys(match.valor) };
  return { handler, params: match.params, metodosPermitidos: Object.keys(match.valor) };
}
