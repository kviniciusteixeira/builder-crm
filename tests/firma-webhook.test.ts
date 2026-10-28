import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyZernioSignature } from "@/lib/zernio/webhooks";

/**
 * A assinatura do webhook é a única porta de `/api/webhooks/zernio`, que é pública por
 * necessidade. Se deixar de validar, qualquer um pode injetar mensagens falsas na caixa de entrada
 * de um cliente, fazer o agente respondê-las e mover o pipeline. E não se nota:
 * as mensagens entram, parecem normais.
 */

const SECRETO = "un-secreto-de-prueba";
const CUERPO = JSON.stringify({ event: "message.received", data: { id: "abc" } });

function firmar(cuerpo: string, secreto = SECRETO): string {
  return crypto.createHmac("sha256", secreto).update(cuerpo).digest("hex");
}

describe("firma del webhook de Zernio", () => {
  it("acepta un cuerpo firmado con el secreto correcto", () => {
    expect(verifyZernioSignature(CUERPO, firmar(CUERPO), SECRETO)).toBe(true);
  });

  it("rechaza si no hay secreto configurado (fail-closed)", () => {
    // O caso que importa: uma instância que esqueceu a variável NÃO deve
    // ficar aberta. Antes que entrem mensagens falsas, que não entre nenhuma.
    expect(verifyZernioSignature(CUERPO, firmar(CUERPO), "")).toBe(false);
  });

  it("rechaza si no viene la cabecera de firma", () => {
    expect(verifyZernioSignature(CUERPO, null, SECRETO)).toBe(false);
    expect(verifyZernioSignature(CUERPO, undefined, SECRETO)).toBe(false);
  });

  it("rechaza una firma hecha con otro secreto", () => {
    expect(verifyZernioSignature(CUERPO, firmar(CUERPO, "otro-secreto"), SECRETO)).toBe(false);
  });

  it("rechaza si el cuerpo cambio un solo caracter despues de firmar", () => {
    const firma = firmar(CUERPO);
    const alterado = CUERPO.replace('"abc"', '"abd"');
    expect(verifyZernioSignature(alterado, firma, SECRETO)).toBe(false);
  });

  it("rechaza una firma de largo distinto sin romperse", () => {
    // timingSafeEqual lança se os buffers medem diferente: comparar o tamanho antes não é
    // cosmético, é o que evita que uma assinatura curta dispare uma exceção no webhook.
    expect(() => verifyZernioSignature(CUERPO, "abc123", SECRETO)).not.toThrow();
    expect(verifyZernioSignature(CUERPO, "abc123", SECRETO)).toBe(false);
  });

  it("tolera el prefijo sha256= y las mayusculas", () => {
    // A Meta manda assim e o Zernio não; aceitar as duas formas evita um 401 silencioso no
    // dia em que se trocar de provedor.
    const firma = firmar(CUERPO);
    expect(verifyZernioSignature(CUERPO, `sha256=${firma}`, SECRETO)).toBe(true);
    expect(verifyZernioSignature(CUERPO, firma.toUpperCase(), SECRETO)).toBe(true);
  });
});
