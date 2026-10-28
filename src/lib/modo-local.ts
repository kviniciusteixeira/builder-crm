/**
 * MODO LOCAL: o CRM rodando na máquina de alguém, sem contas de nada.
 *
 * Para testá-lo e adaptá-lo não faz falta um projeto de Supabase: `npm run local`
 * sobe um Postgres embutido (um pacote de npm, nada de Docker), aplica as mesmas
 * migrações que uma instância de verdade, carrega dados demo e entra direto como um
 * administrador de mentira. Sem tela de login, porque não há servidor de
 * autenticação que a responda.
 *
 * ISSO É EXATAMENTE O QUE O TORNA PERIGOSO. No modo local não há sessão, não há
 * papéis e não há ninguém verificando nada: qualquer um que abra a URL é administrador.
 * Se isto se ligasse numa instância implantada, o CRM de um cliente ficaria
 * aberto à internet e não falharia nada, não haveria nenhum erro nos logs e a UI se
 * veria normal. Por isso:
 *
 *   1. Faz falta MODO_LOCAL=true, que `npm run local` põe e mais ninguém.
 *   2. E além disso NODE_ENV diferente de "production". `next build` + `next start` e a
 *      imagem de Docker rodam em production, então o modo local é impossível ali
 *      mesmo que a variável esteja definida por erro ou por copiar um .env alheio.
 *
 * O segundo cadeado é o que importa: o primeiro pode vazar num `.env` que
 * alguém copie da sua máquina para o servidor; o segundo não depende da configuração.
 */

/** Id fixo do administrador de mentira do modo local. */
export const ID_MIEMBRO_LOCAL = "00000000-0000-4000-8000-000000000001";
export const EMAIL_MIEMBRO_LOCAL = "demo@local";
export const NOMBRE_MIEMBRO_LOCAL = "Cuenta demo";

/** Pasta (relativa à raiz do repo) onde vive a base embutida. */
export const CARPETA_BASE_LOCAL = ".local/db";

export function modoLocal(): boolean {
  return process.env.MODO_LOCAL === "true" && process.env.NODE_ENV !== "production";
}
