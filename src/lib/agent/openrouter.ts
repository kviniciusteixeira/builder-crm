import OpenAI from "openai";
import { getConfig, marca } from "@/lib/config";

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let client: OpenAI | null = null;

/**
 * Cliente compatível com OpenAI apontando para o OpenRouter.
 * O OpenRouter normaliza tool calling e response_format ao formato OpenAI,
 * então o resto do código do agente não muda.
 */
export function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY no configurada");
  }
  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        // O OpenRouter usa estes headers para ranking no seu leaderboard (opcional)
        "HTTP-Referer": process.env.APP_BASE_URL || "http://localhost:3000",
        "X-Title": marca().nombre,
      },
    });
  }
  return client;
}

/** AGENT_MODEL (ambiente) -> config.agente.modelo -> default do núcleo. */
export function getAgentModel(): string {
  return process.env.AGENT_MODEL || getConfig().agente.modelo || DEFAULT_MODEL;
}

export function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
