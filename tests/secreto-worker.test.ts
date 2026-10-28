import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { autorizadoPorSecreto } from "@/lib/secreto-worker";

/**
 * `/api/agent/process`, as duas varreduras e a carga de dados demo são públicas no
 * middleware: chama-as um cron ou o próprio servidor, sem sessão. Este segredo é o
 * ÚNICO que as separa da internet.
 *
 * Até 1.6.1 a checagem era `if (secret) { ...comprobar... }`, então uma
 * instância sem a variável as deixava abertas e não havia nenhum sintoma: o CRM
 * funcionava igual. É isso que o primeiro caso prova, e é o que não pode voltar a
 * quebrar.
 */

const ORIGINAL = { ...process.env };

function peticion(cabeceras: Record<string, string>): NextRequest {
  return {
    headers: { get: (n: string) => cabeceras[n.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

beforeEach(() => {
  delete process.env.AGENT_WORKER_SECRET;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("secreto de las rutas internas", () => {
  it("sin la variable configurada NO autoriza a nadie", () => {
    expect(autorizadoPorSecreto(peticion({}))).toBe(false);
    expect(autorizadoPorSecreto(peticion({ "x-agent-secret": "lo-que-sea" }))).toBe(false);
    expect(autorizadoPorSecreto(peticion({ authorization: "Bearer lo-que-sea" }))).toBe(false);
  });

  it("acepta el secreto correcto por las dos vias", () => {
    process.env.AGENT_WORKER_SECRET = "a".repeat(64);
    expect(autorizadoPorSecreto(peticion({ "x-agent-secret": "a".repeat(64) }))).toBe(true);
    expect(autorizadoPorSecreto(peticion({ authorization: `Bearer ${"a".repeat(64)}` }))).toBe(true);
  });

  it("rechaza un secreto distinto, aunque mida lo mismo", () => {
    process.env.AGENT_WORKER_SECRET = "a".repeat(64);
    expect(autorizadoPorSecreto(peticion({ "x-agent-secret": "b".repeat(64) }))).toBe(false);
  });

  it("no revienta con secretos de otra longitud", () => {
    // timingSafeEqual lança se os buffers não medem igual: há que cortar antes.
    process.env.AGENT_WORKER_SECRET = "a".repeat(64);
    expect(autorizadoPorSecreto(peticion({ "x-agent-secret": "a" }))).toBe(false);
    expect(autorizadoPorSecreto(peticion({ "x-agent-secret": "a".repeat(200) }))).toBe(false);
  });

  it("una cabecera vacia no vale como secreto", () => {
    process.env.AGENT_WORKER_SECRET = "a".repeat(64);
    expect(autorizadoPorSecreto(peticion({ "x-agent-secret": "" }))).toBe(false);
    expect(autorizadoPorSecreto(peticion({ authorization: "Bearer " }))).toBe(false);
  });
});
