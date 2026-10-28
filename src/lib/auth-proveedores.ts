import "server-only";

/**
 * Que formas de entrar esta instância admite.
 *
 * Não se configura duas vezes: em vez de uma variável própria do CRM, pergunta-se ao
 * provedor de autenticação pelo seu endpoint público `/auth/v1/settings`, que devolve
 * os provedores externos ligados. Assim, ligar o Google é pôr as variáveis no
 * GoTrue (ou o interruptor no painel do Supabase cloud) e nada mais: o botão aparece
 * sozinho, e se não está configurado não aparece.
 *
 * Falha fechado: se a consulta não responde, devolve-se lista vazia e fica só o
 * acesso por e-mail e senha, que não depende disto.
 */

export type ProveedorExterno = "google" | "github" | "azure" | "facebook" | "apple";

const CONOCIDOS: ProveedorExterno[] = ["google", "github", "azure", "facebook", "apple"];

export async function proveedoresExternos(): Promise<ProveedorExterno[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return [];

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: anon },
      // A configuração do provedor não muda a cada minuto, e isto roda em cada
      // carga do login: cacheia-se cinco minutos.
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];
    const datos = (await res.json()) as { external?: Record<string, boolean> };
    const externos = datos.external ?? {};
    return CONOCIDOS.filter((p) => externos[p] === true);
  } catch {
    return [];
  }
}

/** Nome para mostrar no botão. */
export const NOMBRE_PROVEEDOR: Record<ProveedorExterno, string> = {
  google: "Google",
  github: "GitHub",
  azure: "Microsoft",
  facebook: "Facebook",
  apple: "Apple",
};
