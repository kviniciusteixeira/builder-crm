import { NextResponse } from "next/server";
import { esPlantilla, plantillaCorreo } from "@/lib/plantillas-correo";
import { urlPublica } from "@/lib/auth-correo";

/**
 * Templates dos e-mails de acesso, em HTML e com a marca da instância.
 *
 *   GET /correo/invitacion.html
 *   GET /correo/recuperacion.html
 *
 * É pública (está na lista do middleware) porque o servidor de
 * autenticação a baixa, e ele não tem sessão no CRM. Não expõe nada: é o template vazio,
 * sem dados de ninguém; o link e o destinatário o GoTrue coloca ao enviar.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ plantilla: string }> }
) {
  const { plantilla } = await params;
  const nombre = plantilla.replace(/\.html$/, "");
  if (!esPlantilla(nombre)) {
    return NextResponse.json({ error: "Plantilla desconocida" }, { status: 404 });
  }
  return new NextResponse(plantillaCorreo(nombre, urlPublica()), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // O GoTrue a relê de vez em quando: que não fique com uma versão velha da marca.
      "Cache-Control": "public, max-age=60",
    },
  });
}
