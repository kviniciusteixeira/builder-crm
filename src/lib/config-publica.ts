import { modoLocal } from "@/lib/modo-local";

/**
 * Configuração pública de que o navegador precisa, servida em tempo de EXECUÇÃO.
 *
 * O Next grava as `NEXT_PUBLIC_*` durante o build. Isso obriga a conhecer a URL do
 * Supabase ao compilar a imagem, e num modelo de uma instância por cliente não se
 * conhece: a imagem é a mesma e cada instância aponta para o seu próprio projeto. Pior ainda,
 * a API do Coolify 4.3 não permite marcar uma variável como de build, então o valor
 * chegava vazio ao bundle e o cliente de Supabase do navegador nascia quebrado, sem nenhum
 * erro visível: o menu de usuário ficava cinza para sempre.
 *
 * Por isso o layout escreve esses valores num bloco JSON e o navegador os lê
 * dali. São públicos por design: a chave anônima já viajava no bundle. O que protege
 * os dados é RLS mais a autorização do servidor, nunca o segredo desta chave.
 */

export interface ConfigPublica {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /**
   * O servidor de autenticação desta instância envia e-mails: há convites por
   * e-mail e "esqueci minha senha". Não é um segredo nem uma credencial, é uma
   * capacidade: a UI precisa saber para não oferecer um botão que não faz nada.
   */
  authEnviaCorreos: boolean;
  /**
   * O CRM roda na máquina de alguém com a base embutida e sem sessão (ver
   * src/lib/modo-local.ts). O navegador precisa disso para avisar que isto não é uma
   * instância de verdade e para não oferecer "encerrar sessão", que não teria para onde ir.
   */
  modoLocal: boolean;
}

/** `AUTH_ENVIA_CORREOS=true`. Aceitam-se as formas de sempre para não brigar com elas. */
function leerBooleano(valor: string | undefined): boolean {
  return ["true", "1", "si", "sí", "yes", "on"].includes((valor ?? "").trim().toLowerCase());
}

export const ID_CONFIG_PUBLICA = "builder-crm-config";

export function configPublica(): ConfigPublica {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    authEnviaCorreos: leerBooleano(process.env.AUTH_ENVIA_CORREOS),
    modoLocal: modoLocal(),
  };
}

/** JSON pronto para embutir: escapa `<` para não poder fechar a tag. */
export function configPublicaSerializada(): string {
  return JSON.stringify(configPublica()).replace(/</g, "\\u003c");
}

/** Lê o bloco do documento. Só no navegador. */
export function leerConfigPublica(): ConfigPublica {
  if (typeof document !== "undefined") {
    const bloque = document.getElementById(ID_CONFIG_PUBLICA)?.textContent;
    if (bloque) {
      try {
        const datos = JSON.parse(bloque) as Partial<ConfigPublica>;
        // No modo local não há URL nem chave do Supabase, e o bloco vale igual: é
        // justamente o que diz ao navegador que está em modo local.
        if (datos.modoLocal === true || (datos.supabaseUrl && datos.supabaseAnonKey)) {
          return {
            supabaseUrl: datos.supabaseUrl ?? "",
            supabaseAnonKey: datos.supabaseAnonKey ?? "",
            authEnviaCorreos: datos.authEnviaCorreos === true,
            modoLocal: datos.modoLocal === true,
          };
        }
      } catch {
        /* segue com as variáveis do build */
      }
    }
  }
  // Vercel e desenvolvimento local: aí as NEXT_PUBLIC_* sim estão no bundle. No
  // servidor (SSR de um componente cliente) lê-se o ambiente completo.
  return configPublica();
}
