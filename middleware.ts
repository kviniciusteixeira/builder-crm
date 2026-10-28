import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // manifest.json e sw.js têm que ser públicos: se o middleware os manda para
    // /login, o navegador recebe HTML onde espera JSON/JS e a PWA nunca se instala.
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
