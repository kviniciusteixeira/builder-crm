import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Volta do login com um provedor externo (Google e similares).
 *
 * O navegador manda o usuário ao provedor com `signInWithOAuth`; o provedor o
 * devolve aqui com um código, e este handler o troca pela sessão e deixa os cookies.
 *
 * Entrar NÃO dá acesso por si só: quem não tiver linha em `team_members` termina em
 * `/sin-acceso`, assim como com e-mail e senha. Um administrador faz o cadastro
 * em Ajustes -> Equipo com o mesmo e-mail.
 */

/**
 * Atrás de um proxy, o `origin` da requisição é o endereço interno do contêiner
 * (`https://0.0.0.0:3000`), então redirecionar para isso manda o usuário para o nada. O
 * endereço público sai da configuração, que é a fonte que não se pode falsificar
 * de fora, e só se falta é que se olham os cabeçalhos do proxy.
 */
function baseDelSitio(request: NextRequest, origin: string): string {
  const configurada = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (configurada) return configurada.replace(/\/$/, "");

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return origin;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const base = baseDelSitio(request, origin);
  const code = searchParams.get("code");
  const descripcion = searchParams.get("error_description");
  const destino = searchParams.get("next") ?? "/";

  if (descripcion) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(descripcion)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent("Volviste sin codigo de autorizacion.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error.message)}`);
  }

  // Rota relativa sempre: evita que um `next` manipulado mande a outro site.
  const seguro = destino.startsWith("/") && !destino.startsWith("//") ? destino : "/";
  return NextResponse.redirect(`${base}${seguro}`);
}
