"use server";

import { correoDeAccesoActivo, enviarEnlaceDeAcceso } from "@/lib/auth-correo";

/**
 * Pede o e-mail com o link para voltar a entrar.
 *
 * Responde o mesmo exista ou não a conta: se dissesse "esse e-mail não está registrado",
 * qualquer um poderia descobrir quem trabalha na empresa testando endereços. O limite
 * de frequência quem põe é o servidor de autenticação, que é quem envia o e-mail.
 */
export async function pedirEnlaceDeAcceso(
  formData: FormData
): Promise<{ ok?: true; error?: string }> {
  if (!correoDeAccesoActivo()) {
    return { error: "Esta instancia no manda correos: pedile el acceso a un administrador." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Escribi un email valido." };
  }

  const { error } = await enviarEnlaceDeAcceso(email);
  if (error) {
    // Os limites de frequência sim se contam: sem isto, a pessoa volta a apertar o
    // botão pensando que não aconteceu nada.
    const m = error.toLowerCase();
    if (m.includes("rate") || m.includes("security purposes") || m.includes("seconds")) {
      return { error: "Ya se mando uno hace poco. Espera un minuto y volve a intentar." };
    }
    return { error };
  }
  return { ok: true };
}
