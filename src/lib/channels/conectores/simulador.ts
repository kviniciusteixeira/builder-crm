import "server-only";
import type { Conector, EstadoConector } from "../conector";

/**
 * Conector do simulador: para testar o agente e fazer demos sem nenhum canal
 * conectado. A conversa simulada (`provider = "simulador"`) entra na caixa de entrada
 * como qualquer outra e o agente a atende pelo mesmo caminho; a diferença é que
 * `enviar` não sai para a rede: `deliverMessage` persiste a saída e pronto.
 *
 * Não recebe webhooks: as mensagens "entrantes" as cria /api/simulador/mensajes.
 */
export const simulador: Conector = {
  id: "simulador",
  nombre: "Simulador",
  canales: ["whatsapp", "instagram", "facebook"],

  async enviar(_ctx, msg) {
    const text = msg.text?.trim();
    if (!text && !msg.template) {
      return { success: false, error: { message: "Mensaje vacio" } };
    }
    return { success: true, externalId: `sim:out:${crypto.randomUUID()}` };
  },

  async estado(): Promise<EstadoConector> {
    return {
      id: "simulador",
      nombre: "Simulador",
      configurado: true,
      faltan: [],
      cuentas: [],
      notas: [
        "Para demos y autoverificacion: las conversaciones simuladas no salen a ningun canal real.",
        process.env.OPENROUTER_API_KEY
          ? "Agente listo para responder."
          : "Falta OPENROUTER_API_KEY: el simulador no puede hacer responder al agente.",
      ],
    };
  },
};
