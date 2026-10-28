import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { modoLocal } from "@/lib/modo-local";
import { opcionesDeCookie } from "@/lib/supabase/cookies";

// `/correo` serve os templates dos e-mails de acesso: baixa-os o servidor de
// autenticação, que não tem sessão no CRM. São templates vazios, sem dados.
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/sin-acceso", "/correo"];
// `/api/automations/process` é o sweeper (chama-o o cron com segredo); o resto
// de /api/automations exige sessão.
// Rotas com autenticação própria (segredo do worker ou admin com sessão, resolvido na
// rota): o middleware não as manda para /login.
const PUBLIC_API_PREFIXES = [
  "/api/health",
  "/api/webhooks",
  "/api/agent",
  "/api/automations/process",
  "/api/simulador",
  "/api/seed",
];

export async function updateSession(request: NextRequest) {
  // Modo local: não há servidor de autenticação a quem perguntar. Sem esta saída,
  // `createServerClient` recebe undefined e TODA requisição morre antes de renderizar;
  // isso é o que fazia o CRM não abrir sem um projeto de Supabase.
  if (modoLocal()) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: opcionesDeCookie(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!user && !isPublicPath && !isPublicApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
