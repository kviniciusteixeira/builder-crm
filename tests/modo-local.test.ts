import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { modoLocal } from "@/lib/modo-local";

/**
 * O modo local desliga a autenticação inteira: não há sessão, não há papéis e quem abre
 * a URL é administrador. Isso está bem na máquina de alguém que está testando o
 * CRM, e é uma porta aberta na instância de um cliente.
 *
 * O perigoso é que, se ligasse por engano, nada falharia: não há exceção, não
 * há log, a UI se vê igual. O único sintoma seria que qualquer um entra. Por isso o
 * segundo cadeado (NODE_ENV) tem que aguentar mesmo que a variável venha definida, que é
 * o que acontece quando alguém copia seu .env.local para o servidor.
 */

const ORIGINAL = { ...process.env };

// Os tipos do Next declaram NODE_ENV como somente leitura; no teste há que movê-lo
// mesmo assim, porque o cadeado que se está testando é justamente esse. Resolve-se
// `process.env` em cada chamada de propósito: afterEach o substitui por um objeto novo
// e uma referência guardada apontaria para o velho.
function entorno(clave: string, valor: string) {
  (process.env as Record<string, string | undefined>)[clave] = valor;
}

beforeEach(() => {
  delete process.env.MODO_LOCAL;
  // o vitest roda em "test"; o valor que importa é que não seja "production".
  entorno("NODE_ENV", "development");
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("candado del modo local", () => {
  it("apagado por defecto", () => {
    expect(modoLocal()).toBe(false);
  });

  it("se enciende solo con la variable exacta", () => {
    process.env.MODO_LOCAL = "true";
    expect(modoLocal()).toBe(true);

    for (const valor of ["1", "si", "yes", "on", "TRUE", "True", ""]) {
      process.env.MODO_LOCAL = valor;
      expect(modoLocal(), `MODO_LOCAL=${valor} no deberia encenderlo`).toBe(false);
    }
  });

  it("en produccion no se enciende ni con la variable puesta", () => {
    process.env.MODO_LOCAL = "true";
    entorno("NODE_ENV", "production");
    expect(modoLocal()).toBe(false);
  });
});
