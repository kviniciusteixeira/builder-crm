import "server-only";
import type { Conector, ConversationRow, EstadoConector } from "../conector";
import { zernio } from "./zernio";
import { metaCloud } from "./meta-cloud";
import { simulador } from "./simulador";

/**
 * Registro de conectores. A chave é `conversations.provider`.
 * Para adicionar um: criar o arquivo ao lado, importá-lo e somá-lo aqui (ver README.md).
 */
const CONECTORES: Record<string, Conector> = {
  [zernio.id]: zernio,
  [metaCloud.id]: metaCloud,
  [simulador.id]: simulador,
};

export function listarConectores(): Conector[] {
  return Object.values(CONECTORES);
}

export function obtenerConector(id: string): Conector | null {
  return CONECTORES[id] ?? null;
}

export function conectorParaConversacion(conversation: ConversationRow): Conector | null {
  return obtenerConector(conversation.provider);
}

/** Estado de todos os conectores, para Ajustes -> Canales e para probar-instancia. */
export async function estadoConectores(): Promise<EstadoConector[]> {
  return Promise.all(listarConectores().map((c) => c.estado()));
}
