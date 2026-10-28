import { CalendarDays, MapPin } from "lucide-react";
import type { ManifiestoModulo } from "@/lib/modules/types";

/**
 * Módulo visitas: coordenação de visitas a propriedades (ou a qualquer lugar) com
 * agenda mensal. O modelo imobiliário o usa; serve para qualquer negócio que
 * agende encontros presenciais.
 */
const manifiesto: ManifiestoModulo = {
  nombre: "visitas",
  titulo: "Visitas",
  descripcion: "Visitas coordinadas y en proceso, con calendario mensual y tool para que el agente las agende.",
  version: "1.0.0",
  nav: [
    { etiqueta: "Visitas", icono: MapPin, seccion: "Operaciones" },
    { ruta: "calendario", etiqueta: "Calendario", icono: CalendarDays, seccion: "Productividad" },
  ],
};

export default manifiesto;
