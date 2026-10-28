import { Package } from "lucide-react";
import type { ManifiestoModulo } from "@/lib/modules/types";

/**
 * MODELO DE MÓDULO — copiar a pasta para modules/<nombre> e completar.
 *
 * Este arquivo o navegador importa (sidebar, formulários): só dados e componentes
 * de UI. Nada de base de dados, nada de segredos, nada de `server-only`.
 */
const manifiesto: ManifiestoModulo = {
  // Igual ao nome da pasta, em snake_case.
  nombre: "mi_modulo",
  titulo: "Mi modulo",
  descripcion: "Que hace este modulo, en una frase.",
  version: "1.0.0",

  // Entradas do menu lateral. `ruta` é relativa a /m/<nombre>; vazia = principal.
  nav: [{ etiqueta: "Mi modulo", icono: Package, seccion: "Operaciones" }],

  // Campos do contato que o módulo aporta (mesma forma que config/cliente.ts).
  // Usar o nome do módulo como prefixo da chave para não colidir.
  campos: [
    // { clave: "mi_modulo_dato", etiqueta: "Dato", tipo: "texto", enTabla: false },
  ],
};

export default manifiesto;
