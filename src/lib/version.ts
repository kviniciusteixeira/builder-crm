/**
 * Versão e commit do que está rodando. A versão sai de package.json e se
 * congela ao construir (next.config.ts a expõe como NEXT_PUBLIC_APP_VERSION). O
 * commit só se chegou ao build como SOURCE_COMMIT (Coolify e docker compose o passam
 * como build arg); senão, o app mostra só a versão.
 *
 * Vê-se em /api/health e embaixo na barra lateral, para confirmar um deploy com
 * um curl sem abrir o app.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const BUILD_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT || null;

export function etiquetaVersion(): string {
  const commit = BUILD_COMMIT ? ` · ${BUILD_COMMIT.slice(0, 7)}` : "";
  return `v${APP_VERSION}${commit}`;
}
