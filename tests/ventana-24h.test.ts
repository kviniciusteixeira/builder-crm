import { describe, it, expect } from "vitest";
import { capabilitiesFor, isOutsideFreeFormWindow } from "@/lib/channels/types";

/**
 * A janela de texto livre quem decide é o servidor, não o canal. Se este cálculo se
 * engana para dentro (crê que está aberta quando se fechou), a Meta descarta a
 * mensagem e o CRM a mostra como enviada: o lead fica esperando uma resposta que
 * nunca chegou e ninguém fica sabendo até que o cliente reclame.
 */

const AHORA = new Date("2026-10-06T12:00:00.000Z");
const horasAntes = (h: number) => new Date(AHORA.getTime() - h * 60 * 60 * 1000);

describe("ventana de texto libre por canal", () => {
  it("whatsapp e instagram declaran 24 horas", () => {
    expect(capabilitiesFor("whatsapp").freeFormWindowHours).toBe(24);
    expect(capabilitiesFor("instagram").freeFormWindowHours).toBe(24);
  });

  it("dentro de la ventana permite texto libre", () => {
    expect(isOutsideFreeFormWindow("whatsapp", horasAntes(23), AHORA)).toBe(false);
    expect(isOutsideFreeFormWindow("whatsapp", horasAntes(0.5), AHORA)).toBe(false);
  });

  it("pasada la ventana la cierra", () => {
    expect(isOutsideFreeFormWindow("whatsapp", horasAntes(25), AHORA)).toBe(true);
  });

  it("en el limite exacto todavia esta abierta", () => {
    // Justo às 24 h não se fecha: fechar um segundo antes manda um template sem
    // necessidade, e isso custa dinheiro ao cliente em cada conversa.
    expect(isOutsideFreeFormWindow("whatsapp", horasAntes(24), AHORA)).toBe(false);
  });

  it("sin mensaje entrante previo la considera cerrada", () => {
    // Fail-closed: uma conversa que o negócio inicia nunca tem janela aberta.
    expect(isOutsideFreeFormWindow("whatsapp", null, AHORA)).toBe(true);
    expect(isOutsideFreeFormWindow("whatsapp", undefined, AHORA)).toBe(true);
  });

  it("con una fecha invalida la considera cerrada en vez de romperse", () => {
    expect(isOutsideFreeFormWindow("whatsapp", "no-es-una-fecha", AHORA)).toBe(true);
  });

  it("acepta la fecha como texto, que es como vuelve de la base", () => {
    expect(isOutsideFreeFormWindow("whatsapp", horasAntes(2).toISOString(), AHORA)).toBe(false);
    expect(isOutsideFreeFormWindow("whatsapp", horasAntes(48).toISOString(), AHORA)).toBe(true);
  });
});
