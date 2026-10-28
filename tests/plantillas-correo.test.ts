import { describe, it, expect, vi } from "vitest";

/**
 * Os templates quem baixa é o servidor de autenticação, e ele os preenche: se se perde
 * um marcador, o e-mail sai sem o link e a pessoa não consegue entrar. E como o
 * nome da marca cada membro escreve no seu `config/cliente.ts`, tem que sair
 * escapado ou um `&` deixa o e-mail quebrado na metade dos clientes de e-mail.
 */

vi.mock("@/lib/config", async () => {
  const real = await vi.importActual<typeof import("@/lib/config")>("@/lib/config");
  return {
    ...real,
    marca: () => ({
      nombre: 'Clinica <Norte> & Asociados',
      nombreCorto: "Norte",
      descripcion: "Turnos por WhatsApp",
      logo: "/marca/logo.png",
      icono: "/marca/icono.png",
      colorPrimario: "#0E7C7B",
      colorSidebar: "#102A33",
    }),
  };
});

const { plantillaCorreo, esPlantilla, PLANTILLAS } = await import("@/lib/plantillas-correo");

describe("plantillas de los correos de acceso", () => {
  it("solo conoce las dos plantillas que existen", () => {
    expect([...PLANTILLAS]).toEqual(["invitacion", "recuperacion"]);
    expect(esPlantilla("invitacion")).toBe(true);
    expect(esPlantilla("recuperacion")).toBe(true);
    expect(esPlantilla("../../etc/passwd")).toBe(false);
    expect(esPlantilla("cualquier-cosa")).toBe(false);
  });

  it("conserva los marcadores que rellena el servidor de autenticacion", () => {
    for (const tipo of PLANTILLAS) {
      const html = plantillaCorreo(tipo, "https://crm.ejemplo.com");
      expect(html).toContain("{{ .ConfirmationURL }}");
      expect(html).toContain("{{ .Email }}");
    }
  });

  it("escapa el nombre de la marca", () => {
    const html = plantillaCorreo("invitacion", "https://crm.ejemplo.com");
    expect(html).toContain("Clinica &lt;Norte&gt; &amp; Asociados");
    expect(html).not.toContain("<Norte>");
  });

  it("usa el color de la marca y un logo absoluto", () => {
    // Num e-mail não há rotas relativas: sem a URL pública na frente, o logo não carrega.
    const html = plantillaCorreo("invitacion", "https://crm.ejemplo.com");
    expect(html).toContain("#0E7C7B");
    expect(html).toContain("https://crm.ejemplo.com/marca/logo.png");
  });

  it("se arma igual sin URL publica, pero sin logo roto", () => {
    const html = plantillaCorreo("recuperacion", null);
    expect(html).toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("<img");
  });
});
