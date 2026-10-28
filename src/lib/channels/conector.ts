import type { conversations } from "@/db/schema";
import type { ChannelAccount } from "./accounts";
import type { Channel, Provider } from "./types";

/**
 * Interface comum dos conectores de canal.
 *
 * Um conector é POR ONDE viaja uma mensagem (Zernio, Meta Cloud API, o simulador...).
 * O canal (WhatsApp, Instagram, Messenger) é QUE rede vê o usuário; um conector pode
 * servir vários. A caixa de entrada e o agente só conhecem esta interface:
 *
 *   enviar   -> chama-o `deliverMessage`, o único caminho de saída.
 *   webhook  -> usa-o `src/lib/channels/webhook.ts` para verificar, deduplicar e
 *               processar o que entra (a rota /api/webhooks/<id> tem 5 linhas).
 *   estado   -> mostra-o Ajustes -> Canales.
 *
 * Para adicionar um conector (por exemplo a API oficial de WhatsApp como Tech Provider):
 * ver src/lib/channels/conectores/README.md.
 */

export type ConversationRow = typeof conversations.$inferSelect;

export interface OutboundTemplate {
  name: string;
  language?: string;
  components?: unknown[];
  previewText?: string;
}

export interface OutboundMessage {
  text?: string;
  template?: OutboundTemplate;
}

export interface SendOutcome {
  success: boolean;
  externalId?: string | null;
  error?: { message?: string; code?: string | number };
  /** Mensagem legível para mostrar na UI quando o envio falha. */
  hint?: string;
}

export interface DeliveryContext {
  conversation: ConversationRow;
  account: ChannelAccount | null;
  channel: Channel;
}

/** Resultado de processar um evento entrante. `retry` = chegou fora de ordem, tentar de novo. */
export interface ResultadoWebhook {
  status: "processed" | "ignored" | "retry";
  reason?: string;
  /** Jobs do agente enfileirados pela ingestão: o webhook os dispara ao worker. */
  jobIds: string[];
}

export interface WebhookConector {
  /** Assinatura do provedor sobre o corpo cru. Fail-closed se falta o segredo. */
  verificar(rawBody: string, headers: Headers): boolean;
  /**
   * Id único do evento para deduplicar entre novas tentativas (header ou campo do payload).
   * null = o núcleo usa o hash do corpo.
   */
  idEvento(rawBody: string, headers: Headers, payload: unknown): string | null;
  /**
   * Normaliza o payload e persiste com as funções de `ingest.ts`. Corre dentro de
   * `after()`: o pesado (ingestão, agente) deve importar-se dinamicamente aqui dentro
   * para não engordar o cold start da rota.
   */
  procesar(payload: unknown): Promise<ResultadoWebhook>;
}

export interface CuentaConectada {
  id: string;
  canal: Channel;
  nombre: string;
  estado: string;
}

export interface EstadoConector {
  id: Provider;
  nombre: string;
  /** true se tem o mínimo para operar (credenciais por ambiente). */
  configurado: boolean;
  /** Variáveis de ambiente que faltam. */
  faltan: string[];
  cuentas: CuentaConectada[];
  /** Avisos para o administrador (modo, limitações, passos pendentes). */
  notas: string[];
}

export interface Conector {
  /** Coincide com `conversations.provider` e `messages.provider`. */
  id: Provider;
  nombre: string;
  canales: readonly Channel[];
  enviar(ctx: DeliveryContext, msg: OutboundMessage): Promise<SendOutcome>;
  /** Sem `webhook`, o conector só envia (ou a sua ingestão vive numa rota legacy). */
  webhook?: WebhookConector;
  estado(): Promise<EstadoConector>;
}
