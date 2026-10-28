import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/team";
import { moduloActivo } from "@/lib/config";
import { Simulador } from "@/components/simulador/Simulador";

export const dynamic = "force-dynamic";

export const metadata = { title: "Simulador" };

/**
 * Simulador de conversas: somente admin. Um assessor recebe 404 (não se confirma que
 * exista), e com `modulos.nucleo.simulador = false` também não existe para ninguém.
 */
export default async function SimuladorPage() {
  if (!moduloActivo("simulador")) notFound();
  const member = await getCurrentMember();
  if (!member) redirect("/sin-acceso");
  if (member.role !== "admin") notFound();

  return <Simulador />;
}
