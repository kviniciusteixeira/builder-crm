/**
 * Opções dos cookies de sessão, compartilhadas pelo middleware e pelo cliente de
 * servidor para que não possam se desincronizar.
 *
 * `@supabase/ssr` traz `path`, `sameSite`, `httpOnly` e `maxAge` por padrão, mas NÃO
 * `secure`. Sem esse atributo o navegador anexa `sb-*-auth-token` —o JWT de acesso e
 * o token de refresh— a qualquer requisição `http://` ao domínio do CRM: a primeira
 * visita escrita à mão, um link velho, uma rede hostil. Quem olhar essa requisição
 * leva a sessão inteira.
 *
 * Em desenvolvimento `secure` fica desligado, porque `http://localhost` não tem certificado e
 * senão o navegador descarta o cookie e não se pode iniciar sessão.
 */
export function opcionesDeCookie() {
  return {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    httpOnly: true,
    path: "/",
  };
}
