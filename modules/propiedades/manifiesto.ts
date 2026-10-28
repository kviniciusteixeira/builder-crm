import { Building2 } from "lucide-react";
import type { ManifiestoModulo } from "@/lib/modules/types";

/**
 * Módulo propiedades: catálogo de propriedades com busca por critérios (semântica
 * se houver OPENAI_API_KEY, por filtros se não) e por endereço ou link de portal, para
 * que o agente responda com dados reais. Sincroniza a partir do Tokko Broker (opcional).
 */
const manifiesto: ManifiestoModulo = {
  nombre: "propiedades",
  titulo: "Propiedades",
  descripcion: "Catalogo de propiedades y busqueda para el agente (Tokko opcional).",
  version: "1.0.0",
  nav: [{ etiqueta: "Propiedades", icono: Building2, seccion: "Operaciones" }],
};

export default manifiesto;
