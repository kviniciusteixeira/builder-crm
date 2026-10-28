import { describe, it, expect } from "vitest";
import { esquemaConfig } from "@/lib/config/schema";

/**
 * `config/cliente.ts` é o único que um membro toca para adaptar o CRM. Este esquema
 * é o contrato dessa adaptação: se deixar passar algo inválido, o erro aparece muito
 * mais tarde e em outro lugar (um pipeline com duas etapas iguais, uma cor que quebra o
 * contraste, um campo de seleção sem opções), e quem descobre é o cliente.
 */

const BASE = {
  marca: { nombre: "Clinica Norte", nombreCorto: "Norte" },
  pipeline: {
    etapas: [
      { clave: "consulta", nombre: "Consulta nueva" },
      { clave: "atendido", nombre: "Atendido" },
    ],
  },
};

describe("esquema de config/cliente.ts", () => {
  it("acepta una configuracion minima y completa los defaults", () => {
    const r = esquemaConfig.safeParse(BASE);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.marca.colorPrimario).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(r.data.idioma).toBeTruthy();
      expect(r.data.pipeline.etapas).toHaveLength(2);
    }
  });

  it("rechaza un pipeline con etapas repetidas", () => {
    const r = esquemaConfig.safeParse({
      ...BASE,
      pipeline: {
        etapas: [
          { clave: "consulta", nombre: "Consulta nueva" },
          { clave: "consulta", nombre: "Otra consulta" },
        ],
      },
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un pipeline de una sola etapa", () => {
    const r = esquemaConfig.safeParse({
      ...BASE,
      pipeline: { etapas: [{ clave: "unica", nombre: "Unica" }] },
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un color que no sea #rrggbb", () => {
    const r = esquemaConfig.safeParse({
      ...BASE,
      marca: { ...BASE.marca, colorPrimario: "verde" },
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una clave de etapa que no sea snake_case", () => {
    // As chaves viajam para a base e para o prompt do agente: um espaço ou um acento aí
    // quebra consultas e confunde o modelo.
    const r = esquemaConfig.safeParse({
      ...BASE,
      pipeline: {
        etapas: [
          { clave: "Consulta Nueva", nombre: "Consulta nueva" },
          { clave: "atendido", nombre: "Atendido" },
        ],
      },
    });
    expect(r.success).toBe(false);
  });

  it("rechaza un campo de seleccion sin opciones", () => {
    const r = esquemaConfig.safeParse({
      ...BASE,
      contacto: {
        campos: [{ clave: "obra_social", etiqueta: "Obra social", tipo: "seleccion" }],
      },
    });
    expect(r.success).toBe(false);
  });

  it("rechaza campos del contacto con la misma clave", () => {
    const r = esquemaConfig.safeParse({
      ...BASE,
      contacto: {
        campos: [
          { clave: "obra_social", etiqueta: "Obra social", tipo: "texto" },
          { clave: "obra_social", etiqueta: "Repetido", tipo: "texto" },
        ],
      },
    });
    expect(r.success).toBe(false);
  });

  it("acepta una zona horaria IANA y usa UTC si no se declara", () => {
    // UTC por default de propósito: uma instância já implantada que atualiza o núcleo
    // sem tocar sua configuração continua vendo as mesmas datas de antes.
    expect(esquemaConfig.safeParse(BASE).data?.zonaHoraria).toBe("UTC");
    const r = esquemaConfig.safeParse({ ...BASE, zonaHoraria: "America/Mexico_City" });
    expect(r.success).toBe(true);
  });

  it("rechaza una zona horaria mal escrita", () => {
    // É a classe de erro que não avisa: o Intl a rejeita ao formatar, longe daqui, e
    // o sintoma é um agente que nomeia o dia errado.
    const r = esquemaConfig.safeParse({ ...BASE, zonaHoraria: "America/Santigo" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain("America/Santigo");
    }
  });

  it("explica donde esta el problema, no solo que lo hay", () => {
    const r = esquemaConfig.safeParse({ ...BASE, marca: { nombreCorto: "Norte" } });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path.join(".")).toContain("marca");
    }
  });
});
