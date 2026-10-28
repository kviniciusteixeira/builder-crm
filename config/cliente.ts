import { definirConfig } from "@/lib/config/schema";
import modulos from "./modulos.json";

/**
 * CONFIGURAÇÃO DO CLIENTE — zona do cliente, não do núcleo.
 *
 * Tudo o que distingue esta instância vive aqui: marca, pipeline, campos do
 * contato, agente e módulos ativos. Mudar este arquivo (e os assets de
 * public/marca/) é a única forma prevista de personalizar o CRM; o núcleo (src/)
 * não se toca. O esquema completo está em src/lib/config/schema.ts.
 *
 * Para um modelo de nicho: importar o modelo e estendê-lo, por exemplo
 *   import { plantillaInmobiliaria } from "./plantillas/inmobiliaria";
 *   export default definirConfig({ ...plantillaInmobiliaria, marca: { ... } });
 */
export default definirConfig({
  marca: {
    nombre: "Builder CRM",
    nombreCorto: "Builder",
    descripcion: "El CRM multicanal con agente de IA de la comunidad IA Builder Lab.",
    logo: "/marca/logo.png",
    icono: "/marca/icono.png",
    // Medidos no logo de IA Builder Lab: o ciano do anel sobre o carvão do fundo.
    colorPrimario: "#3CF5F5",
    colorSidebar: "#171E21",
  },

  idioma: "es",
  moneda: "USD",
  // A do negócio do cliente, não a sua: decide o dia que o agente nomeia a
  // quem escreve de noite. America/Mexico_City, America/Bogota, Europe/Madrid...
  zonaHoraria: "America/Santiago",

  roles: {
    etiquetaAsesor: "Asesor",
  },

  pipeline: {
    nombre: "Ventas",
    etapas: [
      { clave: "nuevo", nombre: "Nuevo lead", color: "#64748b" },
      { clave: "contactado", nombre: "Contactado", color: "#2563eb" },
      { clave: "calificado", nombre: "Calificado", color: "#8b5cf6" },
      { clave: "propuesta", nombre: "Propuesta", color: "#f59e0b" },
      { clave: "negociacion", nombre: "Negociacion", color: "#ea580c" },
      { clave: "ganado", nombre: "Cerrado ganado", color: "#16a34a", ganada: true },
      { clave: "perdido", nombre: "Cerrado perdido", color: "#dc2626", perdida: true },
    ],
  },

  contacto: {
    // Campos próprios do negócio. Exemplo:
    // { clave: "presupuesto", etiqueta: "Presupuesto", tipo: "numero", enTabla: true,
    //   agente: { descripcion: "presupuesto maximo del cliente" } },
    campos: [],
  },

  agente: {
    nombre: "Asistente",
  },

  modulos: {
    nucleo: {
      automatizaciones: true,
      actividades: true,
      plantillas: true,
      push: true,
      reportes: true,
      simulador: true,
    },
    // Pastas de modules/ ativas nesta instância: editam-se em config/modulos.json
    // (também os leem o runner de migrações e o gerador do registro).
    activos: modulos.activos,
  },
});
