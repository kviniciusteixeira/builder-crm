import { zernioFetch } from "./client";
import type { ZernioResult } from "./types";

/**
 * Templates de WhatsApp via Zernio (`/v1/whatsapp/templates`).
 *
 * A forma é praticamente a mesma que a da Graph API (`name`, `language`,
 * `category`, `components`, `status`), então os helpers de
 * `src/lib/whatsapp-templates.ts` e a tabela `whatsapp_templates` se reutilizam tal qual;
 * a única coisa que muda é quem é o destinatário da chamada.
 */

export interface ZernioTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | (string & {});
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY" | (string & {});
  language: string;
  components: unknown[];
}

export async function listTemplates(
  accountId: string
): Promise<ZernioResult<{ success?: boolean; templates: ZernioTemplate[] }>> {
  return zernioFetch<{ success?: boolean; templates: ZernioTemplate[] }>(
    "/whatsapp/templates",
    { query: { accountId } }
  );
}

export interface CreateTemplateInput {
  accountId: string;
  /** A Meta exige minúsculas, dígitos e underline: `^[a-z][a-z0-9_]*$`. */
  name: string;
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY";
  language: string;
  components: unknown[];
  parameterFormat?: "POSITIONAL" | "NAMED";
}

export async function createTemplate(
  input: CreateTemplateInput
): Promise<ZernioResult<{ id?: string; status?: string; name?: string }>> {
  return zernioFetch<{ id?: string; status?: string; name?: string }>(
    "/whatsapp/templates",
    { method: "POST", body: input }
  );
}

export async function deleteTemplate(
  accountId: string,
  templateName: string
): Promise<ZernioResult<{ success?: boolean }>> {
  return zernioFetch<{ success?: boolean }>(
    `/whatsapp/templates/${encodeURIComponent(templateName)}`,
    { method: "DELETE", query: { accountId } }
  );
}

/**
 * Conecta uma WABA própria sem passar pelo browser (BYO-WABA).
 *
 * O número e a conta continuam sendo do cliente: o Zernio só recebe credenciais
 * para operá-la. Precisa de um System User da Meta com permissões
 * `whatsapp_business_management` e `whatsapp_business_messaging`.
 */
export interface ConnectWhatsappInput {
  profileId?: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
}

export async function connectWhatsapp(
  input: ConnectWhatsappInput
): Promise<ZernioResult<{ accountId?: string; success?: boolean }>> {
  return zernioFetch<{ accountId?: string; success?: boolean }>(
    "/connect/whatsapp/credentials",
    { method: "POST", body: input }
  );
}
