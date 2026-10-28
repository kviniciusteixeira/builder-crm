import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  configPublica,
  configPublicaSerializada,
  ID_CONFIG_PUBLICA,
} from "@/lib/config-publica";

/**
 * Este bloco JSON se incrusta dentro de uma etiqueta <script> em todas as páginas. Duas
 * coisas têm que continuar certas: que não dê para fechar a etiqueta a partir do
 * conteúdo (seria injeção de código no navegador de cada pessoa da equipe) e que
 * o valor que o navegador vê seja o do ambiente, não um gravado no build.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.ejemplo.com";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "clave-anonima";
  delete process.env.AUTH_ENVIA_CORREOS;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("configuracion publica", () => {
  it("lleva la URL y la clave anonima del entorno", () => {
    expect(configPublica()).toMatchObject({
      supabaseUrl: "https://auth.ejemplo.com",
      supabaseAnonKey: "clave-anonima",
    });
  });

  it("escapa el menor-que para que no se pueda cerrar la etiqueta script", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.com/</script><script>alert(1)</script>";
    const json = configPublicaSerializada();
    expect(json).not.toContain("</script>");
    expect(json).toContain("\\u003c");
    // E o escapado continua sendo JSON válido com o valor intacto.
    expect(JSON.parse(json).supabaseUrl).toContain("</script>");
  });

  it("declara el correo solo cuando la variable lo dice", () => {
    expect(configPublica().authEnviaCorreos).toBe(false);
    process.env.AUTH_ENVIA_CORREOS = "true";
    expect(configPublica().authEnviaCorreos).toBe(true);
    process.env.AUTH_ENVIA_CORREOS = "false";
    expect(configPublica().authEnviaCorreos).toBe(false);
  });

  it("no cambia el id del bloque sin querer", () => {
    // O layout o escreve e o navegador o busca por este id: se muda de um lado e
    // não do outro, o cliente de Supabase do navegador nasce vazio e nada avisa.
    expect(ID_CONFIG_PUBLICA).toBe("builder-crm-config");
  });
});
