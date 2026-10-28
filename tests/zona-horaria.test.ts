import { describe, it, expect, vi, afterEach } from "vitest";
import { getConfig } from "@/lib/config";
import { renderSystemPrompt } from "@/lib/agent/prompt";
import { formatRelativeDate } from "@/lib/constants";

/**
 * O contêiner roda em UTC (uma imagem compartilhada por muitas instâncias não pode trazer
 * o fuso gravado), então a data que o agente recebe no prompt tem que
 * resolver-se no fuso do negócio. Senão, de noite diz "amanhã" ao cliente: a partir
 * das 21:00 no Chile o processo já está no dia seguinte. Não há exceção nem log; o
 * sintoma é um agente que errou o dia. Ver specs/nucleo/11-fuso-horario.md.
 */

const dia = (zona: string, instante: Date) =>
  new Intl.DateTimeFormat("es", { timeZone: zona, day: "numeric", month: "long" }).format(instante);

afterEach(() => {
  vi.useRealTimers();
});

describe("zona horaria de la instancia", () => {
  it("el prompt nombra el dia de la zona del negocio, no la del proceso", () => {
    // 02:00 UTC: em qualquer fuso da América ainda é o dia anterior.
    const instante = new Date("2026-10-08T02:00:00.000Z");
    const local = dia(getConfig().zonaHoraria, instante);

    const prompt = renderSystemPrompt("La fecha de hoy es {{fecha}}.", { now: instante });

    expect(prompt).toContain(local);
    if (local !== dia("UTC", instante)) {
      expect(prompt).not.toContain(dia("UTC", instante));
    }
  });

  it("'Hoy' y 'Ayer' cambian a la medianoche local, no a las 24 horas", () => {
    // Antes se subtraíam milissegundos e se dividia por 86.400.000: às 00:30, algo das
    // 23:00 saía como "Hoy". A expectativa se calcula comparando o dia local, então
    // o caso continua correto com qualquer fuso configurado.
    const ahora = new Date("2026-10-08T12:00:00.000Z");
    const hace20h = new Date("2026-10-07T16:00:00.000Z");
    const diaLocal = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: getConfig().zonaHoraria, dateStyle: "short" })
        .format(d);

    vi.useFakeTimers();
    vi.setSystemTime(ahora);
    expect(formatRelativeDate(hace20h)).toBe(
      diaLocal(hace20h) === diaLocal(ahora) ? "Hoy" : "Ayer"
    );
  });

  it("la zona configurada es valida en este entorno", () => {
    // O esquema já valida isso; isto cobre o caso de uma instância que declara um fuso
    // que o próprio Node não conhece (imagem velha, ICU recortado).
    expect(() =>
      new Intl.DateTimeFormat("es", { timeZone: getConfig().zonaHoraria })
    ).not.toThrow();
  });
});
