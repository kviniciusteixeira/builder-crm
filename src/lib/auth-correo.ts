import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { configPublica } from "@/lib/config-publica";

/**
 * E-mails de acesso: convites para a equipe e "esqueci minha senha".
 *
 * Quem os envia é o servidor de autenticação (GoTrue / Supabase), não o CRM: lá estão as
 * credenciais de SMTP, os limites de envio e a geração dos links. O CRM só
 * decide três coisas, que são as que vivem neste arquivo: se a capacidade está
 * ligada, para onde a pessoa volta quando clica, e como se pede cada e-mail.
 *
 * POR QUE FAZ FALTA UM INTERRUPTOR EXPLÍCITO: quando o GoTrue não tem SMTP configurado
 * não falha, usa um cliente de e-mail "noop" que engole a mensagem e responde 200. Sem
 * esta variável o CRM diria "convite enviado" sobre um e-mail que nunca saiu, e o
 * administrador ficaria esperando. É o caso contrário ao dos provedores
 * externos (`auth-proveedores.ts`), que se detectam perguntando a `/auth/v1/settings`:
 * o SMTP não aparece ali, então não há nada a perguntar.
 *
 * Como se configura (auto-hospedado ou Supabase cloud): docs/CORREIO.md
 */

/** Página onde a pessoa define a senha ao voltar do e-mail. */
export const RUTA_DEFINIR_CLAVE = "/auth/definir-clave";

/**
 * true se esta instância declara que o servidor de autenticação envia e-mails.
 * O valor sai da configuração pública, que é a que o navegador também vê: assim
 * o botão que a UI oferece e o que a API aceita não podem se contradizer.
 */
export function correoDeAccesoActivo(): boolean {
  return configPublica().authEnviaCorreos;
}

/** URL pública da instância, sem barra final. Null se não estiver configurada. */
export function urlPublica(): string | null {
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  return base ? base.replace(/\/$/, "") : null;
}

const SIN_BASE =
  "Falta APP_BASE_URL: sin la URL publica de la instancia el enlace del correo no sabe a donde volver.";

/**
 * Cliente anônimo de uso único, com fluxo implícito e sem guardar nada.
 *
 * O fluxo PKCE guarda um verificador no navegador que pediu o e-mail, e o link
 * só serve nesse mesmo navegador. Esses e-mails os pede o servidor (ou um
 * administrador de outro computador), então o PKCE os tornaria inúteis: com o
 * fluxo implícito o link funciona em qualquer dispositivo, que é justamente o que se
 * espera de "te mandei o acesso por e-mail".
 */
function clienteSinEstado() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return createSupabaseClient(url, anon, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Convida alguém que ainda não tem usuário. Cria o usuário sem senha e envia
 * o e-mail com o link; a senha a pessoa escolhe ao entrar.
 *
 * Se o e-mail já tem usuário, o GoTrue responde `email_exists`: isso quem resolve é quem
 * chama (reutiliza-se o usuário e manda-se um link de acesso).
 */
export async function invitarPorCorreo(
  email: string,
  nombre: string
): Promise<{ userId: string } | { error: string }> {
  const base = urlPublica();
  if (!base) return { error: SIN_BASE };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: nombre || null },
    redirectTo: `${base}${RUTA_DEFINIR_CLAVE}`,
  });
  if (error || !data?.user) {
    return { error: error?.message ?? "No se pudo enviar la invitacion" };
  }
  return { userId: data.user.id };
}

/**
 * Envia um link para definir a senha a alguém que já tem usuário: usa o
 * administrador ("reenviar acesso") e a página de "esqueci minha senha".
 *
 * É o endpoint público de recuperação do provedor, com os próprios limites de
 * frequência por pessoa e por hora. Para não confirmar quem tem conta e quem não,
 * o provedor responde o mesmo nos dois casos.
 */
export async function enviarEnlaceDeAcceso(email: string): Promise<{ error?: string }> {
  const base = urlPublica();
  if (!base) return { error: SIN_BASE };

  try {
    const { error } = await clienteSinEstado().auth.resetPasswordForEmail(email, {
      redirectTo: `${base}${RUTA_DEFINIR_CLAVE}`,
    });
    return error ? { error: error.message } : {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo enviar el correo" };
  }
}
