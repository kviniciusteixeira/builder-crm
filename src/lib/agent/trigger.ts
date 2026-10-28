import { queueConfig } from "./queue";

/**
 * Dispara o worker do agente para uma lista de jobs.
 *
 * Estava inline dentro do webhook de WhatsApp; o de Zernio também precisa,
 * então vive aqui. Chama-se SEMPRE de dentro de um `after()`: a ideia é devolver
 * 200 ao provedor primeiro e só depois esperar o debounce.
 *
 * Cada job faz o próprio debounce: se chegam mais mensagens do mesmo fio nos
 * próximos segundos, este worker corre mas `claimAgentJob` detecta
 * `debounce_still_active` e sai; o próximo setTimeout o processa.
 */
export async function triggerAgentWorker(
  jobIds: string[],
  baseUrl: string,
  tag = "agent-trigger"
): Promise<void> {
  const unique = Array.from(new Set(jobIds)).filter(Boolean);
  if (unique.length === 0) return;

  // Sem URL pública não se chama ninguém: `getWorkerBaseUrl` devolve vazio em produção
  // quando falta APP_BASE_URL, justamente para não mandar o segredo a um host que veio
  // num cabeçalho. Os jobs ficam na fila e a varredura os levanta.
  if (!baseUrl) {
    console.error(`[${tag}] sin APP_BASE_URL no se dispara el worker; quedan ${unique.length} en cola`);
    return;
  }

  const secret = process.env.AGENT_WORKER_SECRET;

  await Promise.all(
    unique.map(async (jobId) => {
      await new Promise((r) => setTimeout(r, queueConfig.debounceMs + 250));
      try {
        const res = await fetch(`${baseUrl}/api/agent/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(secret ? { "x-agent-secret": secret } : {}),
          },
          body: JSON.stringify({ jobId }),
        });
        if (!res.ok) {
          console.warn(
            `[${tag}] agent worker no-200`,
            res.status,
            await res.text().catch(() => "")
          );
        }
      } catch (err) {
        console.error(`[${tag}] error disparando worker`, err);
      }
    })
  );
}

/**
 * URL pública do app para que o webhook possa chamar a si mesmo.
 *
 * A esta URL se manda AGENT_WORKER_SECRET num cabeçalho, então NÃO pode sair da
 * requisição entrante: quem controle o `Host` de uma requisição que chegue até aqui
 * leva o segredo ao próprio servidor. Hoje o caminho está atrás da assinatura HMAC do
 * webhook, mas isso é uma defesa de outro, não desta função.
 *
 * Em produção exige-se APP_BASE_URL (ou NEXT_PUBLIC_APP_URL). Se falta, devolve-se
 * cadeia vazia e quem chama não dispara nada: o agente fica sem processar e fica dito
 * no log, que é preferível a vazar o segredo. Fora de produção cai-se em
 * localhost, que é onde roda `npm run dev`.
 */
export function getWorkerBaseUrl(_headers?: Headers): string {
  const fromEnv = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[seguridad] falta APP_BASE_URL: no se llama al worker del agente. " +
        "Derivar la URL del host de la peticion filtraria AGENT_WORKER_SECRET."
    );
    return "";
  }

  return "http://localhost:3000";
}
