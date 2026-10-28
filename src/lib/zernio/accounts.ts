import { zernioFetch, getProfileId } from "./client";
import type {
  ZernioAccount,
  ZernioListResponse,
  ZernioPlatform,
  ZernioProfile,
  ZernioResult,
} from "./types";

/** Contas sociais conectadas e fluxos de conexão (OAuth e headless). */

export async function listAccounts(): Promise<
  ZernioResult<ZernioListResponse<ZernioAccount>>
> {
  return zernioFetch<ZernioListResponse<ZernioAccount>>("/accounts");
}

export async function getAccount(
  accountId: string
): Promise<ZernioResult<ZernioAccount>> {
  return zernioFetch<ZernioAccount>(
    `/accounts/${encodeURIComponent(accountId)}`
  );
}

export async function listProfiles(): Promise<
  ZernioResult<ZernioListResponse<ZernioProfile>>
> {
  return zernioFetch<ZernioListResponse<ZernioProfile>>("/profiles");
}

export interface ConnectUrlOptions {
  profileId?: string;
  /**
   * Só WhatsApp. Define que tela mostra o Embedded Signup da Meta:
   *  - `api`: seletor de WABA / número. É o correto para um número que JÁ está na
   *    Cloud API.
   *  - `business_app`: coexistência, um número compartilhado com o app WhatsApp Business.
   * Omiti-lo NÃO é neutro: a Meta cai em coexistência por padrão.
   */
  onboarding?: "api" | "business_app";
  /**
   * Só Instagram.
   *  - `instagram_login` (default): autoriza a conta profissional do Instagram
   *    diretamente, SEM necessidade de uma Página do Facebook.
   *  - `facebook_login`: passa por uma Página que tenha Instagram vinculado, e adiciona um
   *    passo de seleção de Página.
   */
  loginMethod?: "instagram_login" | "facebook_login";
}

/**
 * Passo 1 do fluxo OAuth: pedir a URL de autorização.
 *
 * O servidor a pede e devolve só o `authUrl` ao browser. A API key do Zernio
 * nunca sai do server.
 */
export async function buildConnectUrl(
  platform: ZernioPlatform,
  redirectUrl: string,
  options: ConnectUrlOptions = {}
): Promise<ZernioResult<{ authUrl: string; state?: string }>> {
  return zernioFetch<{ authUrl: string; state?: string }>(
    `/connect/${encodeURIComponent(platform)}`,
    {
      query: {
        profileId: options.profileId ?? getProfileId() ?? undefined,
        redirect_url: redirectUrl,
        // Coexistência por padrão, igual ao Zernio. É o caso normal de um negócio
        // pequeno: o número já vive no app WhatsApp Business de um celular e tem
        // que continuar funcionando ali. `api` deixa o número SÓ na Cloud API e o tira
        // do telefone, então só serve se o número já estava na Cloud API.
        ...(platform === "whatsapp"
          ? { onboarding: options.onboarding ?? "business_app" }
          : {}),
        ...(platform === "instagram"
          ? { loginMethod: options.loginMethod ?? "instagram_login" }
          : {}),
      },
    }
  );
}

export interface ConnectWhatsappCredentials {
  /** System User token permanente da Meta. */
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  profileId?: string;
}

/**
 * Conexão headless de uma WABA própria (BYO-WABA), sem passar pelo browser.
 *
 * É o que permite migrar o WhatsApp para o Zernio sem comprar número nem mover a WABA: o
 * número e a conta continuam sendo do cliente, o Zernio só recebe credenciais para
 * operá-la. Requer um System User com `whatsapp_business_management` e
 * `whatsapp_business_messaging`.
 */
export async function connectWhatsappHeadless(
  creds: ConnectWhatsappCredentials
): Promise<ZernioResult<{ accountId?: string }>> {
  return zernioFetch<{ accountId?: string }>("/connect/whatsapp/credentials", {
    method: "POST",
    body: {
      profileId: creds.profileId ?? getProfileId() ?? undefined,
      accessToken: creds.accessToken,
      wabaId: creds.wabaId,
      phoneNumberId: creds.phoneNumberId,
    },
  });
}

/** O Zernio devolve o id de conta como `id` ou `_id` conforme o endpoint. */
export function accountIdOf(account: ZernioAccount): string {
  return account.id ?? (account as unknown as { _id?: string })._id ?? "";
}

export function profileIdOf(profile: ZernioProfile): string {
  return profile._id ?? profile.id ?? "";
}
