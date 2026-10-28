/**
 * Canal e provedor são dois eixos distintos, e confundi-los é o que tornaria impossível o
 * cutover de WhatsApp com rollback:
 *
 *   channel  -> QUE rede é (vê o usuário: badge, filtro, prompt do agente, templates)
 *   provider -> POR ONDE viaja (vê o sistema: que adapter envia, que webhook alimenta)
 *
 * Durante a migração vai existir `channel='whatsapp'` com `provider='meta'` e com
 * `provider='zernio'` ao mesmo tempo, convivendo na mesma caixa de entrada.
 */

export const CHANNELS = ["whatsapp", "instagram", "facebook"] as const;
export type Channel = (typeof CHANNELS)[number];

export const PROVIDERS = ["zernio", "meta", "simulador"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Messenger",
};

export function isChannel(value: unknown): value is Channel {
  return (
    typeof value === "string" && (CHANNELS as readonly string[]).includes(value)
  );
}

export function isProvider(value: unknown): value is Provider {
  return (
    typeof value === "string" &&
    (PROVIDERS as readonly string[]).includes(value)
  );
}

/** O que cada canal permite fazer. Consomem a UI e o adapter de saída. */
export interface ChannelCapabilities {
  /** Templates aprovados pela Meta. Só o WhatsApp os tem. */
  templates: boolean;
  /** Horas de janela de texto livre desde a última mensagem entrante. */
  freeFormWindowHours: number;
  /**
   * Fora da janela, IG e Messenger permitem continuar respondendo com a etiqueta
   * HUMAN_AGENT (válida 7 dias). O WhatsApp não: aí o único caminho é um template.
   */
  humanAgentTag: boolean;
  attachments: boolean;
}

const CAPABILITIES: Record<Channel, ChannelCapabilities> = {
  whatsapp: {
    templates: true,
    freeFormWindowHours: 24,
    humanAgentTag: false,
    attachments: true,
  },
  instagram: {
    templates: false,
    freeFormWindowHours: 24,
    humanAgentTag: true,
    attachments: true,
  },
  facebook: {
    templates: false,
    freeFormWindowHours: 24,
    humanAgentTag: true,
    attachments: true,
  },
};

export function capabilitiesFor(channel: Channel): ChannelCapabilities {
  return CAPABILITIES[channel];
}

/** true se já passaram mais horas que a janela de texto livre do canal. */
export function isOutsideFreeFormWindow(
  channel: Channel,
  lastInboundAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastInboundAt) return true;
  const last = new Date(lastInboundAt).getTime();
  if (Number.isNaN(last)) return true;
  const windowMs = capabilitiesFor(channel).freeFormWindowHours * 60 * 60 * 1000;
  return now.getTime() - last > windowMs;
}
