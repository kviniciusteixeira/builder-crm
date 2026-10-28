import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { opcionesDeCookie } from "@/lib/supabase/cookies";

/**
 * O cookie de sessão leva o JWT de acesso e o token de refresh. Sem `secure`, o
 * navegador o anexa também a uma requisição `http://` ao domínio do CRM, e quem
 * olhar essa requisição leva a sessão inteira.
 *
 * Testa-se à parte porque o sintoma de perdê-lo é nenhum: a aplicação funciona
 * idêntica com o cookie inseguro.
 */

const ORIGINAL = { ...process.env };

function entorno(clave: string, valor: string) {
  (process.env as Record<string, string | undefined>)[clave] = valor;
}

afterEach(() => {
  process.env = { ...ORIGINAL };
});

beforeEach(() => {
  entorno("NODE_ENV", "production");
});

describe("cookies de sesion", () => {
  it("en produccion van con secure, httpOnly y sameSite", () => {
    expect(opcionesDeCookie()).toEqual({
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });

  it("en desarrollo secure queda apagado", () => {
    // http://localhost não tem certificado: com secure o navegador descarta o cookie
    // e não dá para iniciar sessão em local.
    entorno("NODE_ENV", "development");
    expect(opcionesDeCookie().secure).toBe(false);
    expect(opcionesDeCookie().httpOnly).toBe(true);
  });
});
