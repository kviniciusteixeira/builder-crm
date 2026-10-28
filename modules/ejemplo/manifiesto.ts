import { ListChecks } from "lucide-react";
import type { ManifiestoModulo } from "@/lib/modules/types";

/**
 * Manifesto do módulo de exemplo. Seguro para o navegador: o sidebar o importa.
 * Nada de base de dados, nada de segredos.
 */
const manifiesto: ManifiestoModulo = {
  nombre: "ejemplo",
  titulo: "Tareas (ejemplo)",
  descripcion: "Lista de tareas personales. Existe para mostrar como se arma un modulo.",
  version: "1.0.0",
  nav: [{ etiqueta: "Tareas", icono: ListChecks, seccion: "Productividad" }],
  campos: [
    {
      clave: "ejemplo_prioridad",
      etiqueta: "Prioridad",
      tipo: "seleccion",
      opciones: ["Alta", "Media", "Baja"],
      ayuda: "Campo aportado por el modulo de ejemplo.",
    },
  ],
};

export default manifiesto;
