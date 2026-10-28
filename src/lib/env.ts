import { z } from "zod";
import { modoLocal } from "@/lib/modo-local";

/**
 * Variáveis de ambiente, validadas uma única vez e sob demanda (não ao importar: o build
 * do Next não as tem e não deve falhar por isso).
 *
 *   const env = getEnv();          // lança se faltar algo obrigatório
 *   const faltan = envFaltantes(); // lista de nomes, para /api/health e a inicialização
 *
 * Cada variável está explicada em .env.example. As opcionais ligam uma
 * capacidade (agente, Zernio, bucket, push); sem elas o CRM inicia igual e a UI
 * avisa que essa parte está desligada.
 */

const vacioComoAusente = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const opcional = z.preprocess(vacioComoAusente, z.string().optional());
const booleano = z.preprocess(
  (v) => (typeof v === "string" ? ["true", "1", "si", "sí", "yes", "on"].includes(v.toLowerCase()) : v),
  z.boolean().optional()
);

export const esquemaEnv = z.object({
  // --- Obrigatórias: sem isto não há app ---
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria (Supabase -> Connect)"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY es obligatoria"),

  // --- App ---
  APP_BASE_URL: opcional,
  NEXT_PUBLIC_APP_URL: opcional,
  SUPABASE_SERVICE_ROLE_KEY: opcional,
  DIRECT_URL: opcional,
  ALLOW_PUBLIC_SIGNUP: booleano,
  // O servidor de autenticação tem SMTP: habilita convites por e-mail e
  // "esqueci minha senha". Ver src/lib/auth-correo.ts e docs/CORREIO.md.
  AUTH_ENVIA_CORREOS: booleano,
  // Obrigatória desde 2.0.0. Protege as rotas internas (`/api/agent/process`, as duas
  // varreduras e a carga de dados demo), que são públicas no middleware porque as
  // chama um cron ou o próprio servidor, sem sessão. Até 1.6.1 era opcional e a
  // verificação era PULADA se faltasse: uma instância sem ela ficava com essas rotas
  // abertas à internet e sem nenhum sintoma. Agora falha fechada, então sem a
  // variável o agente não roda; é preferível que /api/health reclame a que fique
  // aberta em silêncio. Gerar com: openssl rand -hex 32
  AGENT_WORKER_SECRET: z.string().min(16, "AGENT_WORKER_SECRET es obligatoria (openssl rand -hex 32)"),
  LEADS_WEBHOOK_SECRET: opcional,
  SWEEP_INTERVAL_MIN: z.preprocess(vacioComoAusente, z.coerce.number().int().min(1).optional()),

  // --- Agente IA (OpenRouter) ---
  OPENROUTER_API_KEY: opcional,
  AGENT_MODEL: opcional,

  // --- Zernio (WhatsApp + Instagram + Messenger) ---
  ZERNIO_API_KEY: opcional,
  ZERNIO_PROFILE_ID: opcional,
  ZERNIO_WEBHOOK_SECRET: opcional,
  ZERNIO_API_BASE: opcional,
  WHATSAPP_PROVIDER: z.preprocess(vacioComoAusente, z.enum(["zernio", "meta"]).optional()),

  // --- Meta Cloud API direto (válvula de escape) ---
  WHATSAPP_ACCESS_TOKEN: opcional,
  WHATSAPP_PHONE_NUMBER_ID: opcional,
  WHATSAPP_BUSINESS_ACCOUNT_ID: opcional,
  WHATSAPP_APP_SECRET: opcional,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: opcional,
  WHATSAPP_API_VERSION: opcional,

  // --- Push (Web Push / VAPID) ---
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: opcional,
  VAPID_PRIVATE_KEY: opcional,
  VAPID_SUBJECT: opcional,

  // --- Documentos (bucket S3-compatible) ---
  S3_ENDPOINT: opcional,
  S3_BUCKET: opcional,
  S3_ACCESS_KEY_ID: opcional,
  S3_SECRET_ACCESS_KEY: opcional,
  S3_REGION: opcional,
});

export type Env = z.infer<typeof esquemaEnv>;

let cache: Env | null = null;

/** Devolve o ambiente validado. Lança um único erro com tudo o que falta. */
export function getEnv(): Env {
  if (cache) return cache;
  const resultado = esquemaEnv.safeParse(process.env);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variables de entorno invalidas o faltantes:\n${detalle}\nRevisa .env.example.`);
  }
  cache = resultado.data;
  return cache;
}

/** Nomes das variáveis obrigatórias que faltam ou são inválidas (sem valores). */
/**
 * No modo local estas três não entram, e não é um descuido: a base é embutida e não há
 * servidor de autenticação. Se continuassem obrigatórias, /api/health responderia
 * 503 para sempre e o CRM não abriria, que é justamente o que o modo local vem
 * resolver.
 */
const NO_HACEN_FALTA_EN_LOCAL = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  // No modo local não há cron nem internet: as rotas internas não estão expostas.
  "AGENT_WORKER_SECRET",
];

export function envFaltantes(): string[] {
  const resultado = esquemaEnv.safeParse(process.env);
  if (resultado.success) return [];
  const nombres = [...new Set(resultado.error.issues.map((i) => String(i.path[0])))];
  return modoLocal() ? nombres.filter((n) => !NO_HACEN_FALTA_EN_LOCAL.includes(n)) : nombres;
}

/** Capacidades ligadas conforme o ambiente. A UI usa isso para avisar o que falta. */
export function capacidades() {
  const e = process.env;
  return {
    agente: Boolean(e.OPENROUTER_API_KEY),
    zernio: Boolean(e.ZERNIO_API_KEY),
    metaDirecto: Boolean(e.WHATSAPP_ACCESS_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID),
    push: Boolean(e.NEXT_PUBLIC_VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY),
    documentos: Boolean(e.S3_ENDPOINT && e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY),
  };
}
