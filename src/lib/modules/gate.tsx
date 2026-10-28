import { notFound, redirect } from "next/navigation";
import { moduloActivo } from "@/lib/config";
import { getCurrentMember } from "@/lib/team";

/**
 * Layout de servidor para as funções do núcleo que se podem desligar por config
 * (`modulos.nucleo`): se está desligada, a rota responde 404 e não aparece no menu.
 *
 *   // src/app/automatizaciones/layout.tsx
 *   export default gateLayout("automatizaciones");
 *
 * Além disso exige membresia, porque estas páginas são componentes de cliente: sem isto se
 * renderizavam para qualquer um com sessão de Auth, mesmo que não estivesse na equipe.
 * Primeiro a bandeira e depois a membresia: uma função desligada responde 404 para
 * todos, que é o que se espera de algo que não existe nesta instância.
 */
export function gateLayout(nombre: string) {
  return async function GateLayout({ children }: { children: React.ReactNode }) {
    if (!moduloActivo(nombre)) notFound();
    const member = await getCurrentMember();
    if (!member) redirect("/sin-acceso");
    return <>{children}</>;
  };
}
