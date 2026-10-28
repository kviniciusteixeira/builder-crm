import "server-only";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ModuloServidor, HandlerModulo } from "@/lib/modules/types";
import manifiesto from "./manifiesto";

/**
 * MODELO DE MÓDULO — lado servidor.
 *
 * - `paginas`: componentes por padrão de rota relativa a /m/<nombre>:
 *     ""            -> /m/<nombre>
 *     "nueva"       -> /m/<nombre>/nueva
 *     "[id]"        -> /m/<nombre>/abc   (params.id = "abc")
 *     "[id]/editar" -> /m/<nombre>/abc/editar
 *   Recebem { params, searchParams, member }. Podem ser async (server) e renderizar
 *   componentes cliente ("use client") de ./componentes.
 * - `api`: handlers por padrão e método, já protegidos por requireMember.
 *   Recebem (request, { params, member }) e devolvem Response.
 * - `tools`: o que o agente pode fazer com este módulo (nome único).
 * - `seed`: dados de demonstração, idempotente.
 *
 * As tabelas do módulo vivem em migrations/ (não em src/db/schema.ts) e consultam-se
 * com `sql` tipado. Prefixo = nome do módulo. RLS obrigatório.
 */

const listar: HandlerModulo = async (_req, { member }) => {
  const filas = await db.execute(sql`select 1 as ok where ${member.id}::text is not null`);
  return NextResponse.json(filas);
};

const modulo: ModuloServidor = {
  manifiesto,

  paginas: {
    "": async ({ member }) => (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Mi modulo</h1>
        <p className="text-sm text-muted-foreground">Hola, {member.name ?? member.email}.</p>
      </div>
    ),
  },

  api: {
    "": { GET: listar },
  },

  tools: [],

  async seed() {
    // inserir dados de demonstração se não existirem
  },
};

export default modulo;
