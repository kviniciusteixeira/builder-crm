import type { NextRequest } from "next/server";
import type { ReactNode, ComponentType } from "react";
import type OpenAI from "openai";
import type { TeamMember } from "@/lib/team";
import type { esquemaCampo } from "@/lib/config/schema";
import type { z } from "zod";
import type { ToolContext, ToolResult } from "@/lib/agent/tools";

/**
 * Contrato público de um módulo (`modules/<nombre>/`). É a interface entre a zona
 * do cliente e o núcleo: mudá-la é uma mudança maior de versão.
 *
 * Dois arquivos por módulo:
 *  - `manifiesto.ts`  -> ManifiestoModulo. Seguro para o navegador (importa-o o
 *                        sidebar): nada de base de dados nem segredos.
 *  - `servidor.ts`    -> ModuloServidor. Páginas, API, tools do agente e seed.
 */

export type SeccionNav = "Operaciones" | "Productividad" | "Inteligencia";

export interface ItemNavModulo {
  /** Rota relativa a /m/<modulo>. "" é a página principal do módulo. */
  ruta?: string;
  etiqueta: string;
  /** Um ícone de lucide-react (o módulo o importa). */
  icono: ComponentType<{ className?: string }>;
  seccion?: SeccionNav;
}

export interface ManifiestoModulo {
  /** Igual ao nome da pasta (snake_case). */
  nombre: string;
  titulo: string;
  descripcion?: string;
  version: string;
  /** Entradas do menu lateral. Sem `nav`, o módulo não aparece no menu. */
  nav?: ItemNavModulo[];
  /** Campos de contato que aporta (somam-se a config/cliente.ts). Mesma forma que ali. */
  campos?: z.input<typeof esquemaCampo>[];
}

export interface PropsPaginaModulo {
  /** Segmentos capturados do padrão, ex. { id: "abc" } para "[id]". */
  params: Record<string, string>;
  searchParams: Record<string, string | string[] | undefined>;
  /** Membro da sessão: já passado por requireMember. */
  member: TeamMember;
}

export type PaginaModulo = ComponentType<PropsPaginaModulo> | ((props: PropsPaginaModulo) => ReactNode | Promise<ReactNode>);

export type MetodoHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ContextoApiModulo {
  params: Record<string, string>;
  member: TeamMember;
}

export type HandlerModulo = (request: NextRequest, ctx: ContextoApiModulo) => Promise<Response> | Response;

export interface ToolModulo {
  /** Definição para o modelo (OpenAI tool calling). O nome deve ser único. */
  definicion: OpenAI.Chat.Completions.ChatCompletionFunctionTool;
  /** Texto para Ajustes -> Agente IA. */
  descripcionUI: string;
  ejecutar: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ModuloServidor {
  manifiesto: ManifiestoModulo;
  /**
   * Páginas por padrão de rota relativa: "" (principal), "nueva", "[id]", "[id]/editar".
   * Um segmento entre colchetes captura e chega em `params`.
   */
  paginas?: Record<string, PaginaModulo>;
  /** Handlers por padrão e método. Já protegidos por requireMember. */
  api?: Record<string, Partial<Record<MetodoHttp, HandlerModulo>>>;
  /** Tools que o agente pode usar enquanto o módulo está ativo. */
  tools?: ToolModulo[];
  /** Dados de demonstração do módulo (`npm run seed`). Deve ser idempotente. */
  seed?: () => Promise<void>;
}
