import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { ownerFilter, visibleOwnerId } from "@/lib/team";
import type { TeamMember } from "@/lib/team";

/**
 * O filtro por proprietário é o único que separa "o assessor vê seus contatos" de "o
 * assessor vê toda a carteira do cliente". Se um dia `ownerFilter` devolvesse `undefined`
 * para um assessor, nada falharia: as telas carregariam igual, com dados a mais. Por isso
 * o admin tem que ser o ÚNICO caso sem filtro.
 */

function miembro(role: "admin" | "asesor"): TeamMember {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "persona@ejemplo.com",
    name: "Persona",
    role,
    active: true,
  } as TeamMember;
}

describe("visibilidad por rol", () => {
  it("el administrador no lleva filtro", () => {
    expect(ownerFilter(miembro("admin"))).toBeUndefined();
    expect(visibleOwnerId(miembro("admin"))).toBeUndefined();
  });

  it("el asesor siempre lleva filtro", () => {
    const m = miembro("asesor");
    expect(ownerFilter(m)).toBeDefined();
    expect(visibleOwnerId(m)).toBe(m.id);
  });

  it("el filtro del asesor compara owner_id contra su propio id", () => {
    const m = miembro("asesor");
    const condicion = ownerFilter(m)!;
    // Traduz-se a condição para SQL sem tocar a base: assim se vê por qual coluna filtra
    // e com qual valor. O que não pode acontecer é filtrar por outra coluna ou por um id
    // que não seja o de quem pergunta.
    const { sql, params } = new PgDialect().sqlToQuery(condicion);
    expect(sql).toContain("owner_id");
    expect(params).toContain(m.id);
  });

  it("un rol desconocido no se trata como administrador", () => {
    // Se amanhã aparecer um papel novo na base, o default seguro é ver menos, não mais.
    const raro = { ...miembro("asesor"), role: "lo-que-sea" } as unknown as TeamMember;
    expect(ownerFilter(raro)).toBeDefined();
    expect(visibleOwnerId(raro)).toBe(raro.id);
  });
});
