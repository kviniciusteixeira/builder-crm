import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/team";

/**
 * Porta de acesso para uma página.
 *
 * As páginas que são componentes de servidor resolvem o membro elas mesmas e
 * redirecionam. As que são de cliente não podem: renderizam-se igual e o cadeado fica
 * só nas rotas de API, então alguém com sessão de Auth mas sem linha em
 * `team_members` via o esqueleto da aplicação em vez de `/sin-acceso`. Não se
 * escapava nenhum dado, porque toda rota de dados exige membresia, mas a porta tem
 * que ser a mesma em todas.
 *
 * Uso, num `layout.tsx` ao lado da página:
 *
 *   export default layoutSoloMiembros();
 *
 * Com `soloAdmin` além disso exige papel de administrador.
 */
export function layoutSoloMiembros(opciones: { soloAdmin?: boolean } = {}) {
  return async function Layout({ children }: { children: ReactNode }) {
    const member = await getCurrentMember();
    if (!member) redirect("/sin-acceso");
    if (opciones.soloAdmin && member.role !== "admin") redirect("/");
    return <>{children}</>;
  };
}
