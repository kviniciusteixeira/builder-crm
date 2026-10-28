/**
 * Normalização e detecção de identificadores de telefone para WhatsApp.
 * Centraliza o manejo dos gotchas de Coexistence (BSUID + tronco) para que
 * todo número se guarde/compare igual no webhook e no envio. Ver WHATSAPP-COEXISTENCE-BRIEF.md.
 */

/**
 * Normaliza um número a dígitos E.164 sem "+". Idempotente.
 * Corrige troncos inconsistentes que a Meta envia conforme o país:
 * - Argentina: o móvel deve ser 549 + área + número. Se vem 54 + 10 dígitos
 *   (sem o 9), insere-se. WhatsApp sempre é móvel, então assumimos 549.
 * - México (Gotcha B do brief): 52 + 10 dígitos (sem 1) -> 521 + ...
 */
export function normalizePhone(value: string): string {
  let digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";

  // México: 52XXXXXXXXXX (12) -> 521XXXXXXXXXX (13)
  if (digits.startsWith("52") && !digits.startsWith("521") && digits.length === 12) {
    digits = "521" + digits.slice(2);
  }

  // Argentina: 54 + 10 dígitos (12, sem 9) -> 549 + ... (13)
  if (digits.startsWith("54") && !digits.startsWith("549") && digits.length === 12) {
    digits = "549" + digits.slice(2);
  }

  return digits;
}

/**
 * Detecta um Business-Scoped User ID (BSUID) de Coexistence: "CC.alfanumerico"
 * (ex. "MX.Ab1Cd2Ef3Gh4..."), que NÃO é um telefone. Gotcha A do brief.
 */
const BSUID_RE = /^[A-Z]{2}\.[A-Za-z0-9+/=_-]{10,}$/;
export function isBsuid(value: string | null | undefined): boolean {
  return BSUID_RE.test(value ?? "");
}

/**
 * Devolve o telefone real normalizado. Em Coexistence `wa_id` pode vir como
 * BSUID; nesse caso usa-se `from` (messages[0].from), que SEMPRE traz o número
 * real. Se `wa_id` é um telefone válido, usa-se esse. Gotcha A do brief.
 */
export function resolveRealPhone(
  waId: string | null | undefined,
  from: string | null | undefined
): string {
  const wa = waId ?? "";
  if (wa && !isBsuid(wa)) return normalizePhone(wa);
  return normalizePhone(from ?? "");
}
