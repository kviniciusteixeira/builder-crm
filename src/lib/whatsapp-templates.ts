/**
 * Helpers puros para templates de WhatsApp (sem deps de server: importam-se tanto
 * em route handlers como em componentes client).
 *
 * Dois formatos de `components` que NÃO se deve confundir:
 * - CRIAR (Graph `POST /{WABA}/message_templates`): `{ type: "BODY", text, example }`
 * - ENVIAR (Graph `POST /{phone}/messages`): `{ type: "body", parameters: [...] }`
 */

/** Índices de variáveis {{1}}, {{2}}... em ordem ascendente, deduplicados. */
export function extractVariables(text: string): number[] {
  const found = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.add(parseInt(m[1], 10));
  }
  return [...found].sort((a, b) => a - b);
}

/** true se as variáveis são 1..n sem buracos (o que a Meta exige). */
export function variablesAreSequential(vars: number[]): boolean {
  return vars.every((v, i) => v === i + 1);
}

/** Componente BODY para CRIAR o template (inclui `example` se há variáveis). */
export function buildBodyComponent(
  bodyText: string,
  examples: string[]
): Record<string, unknown> {
  const vars = extractVariables(bodyText);
  const comp: Record<string, unknown> = { type: "BODY", text: bodyText };
  if (vars.length > 0) {
    comp.example = { body_text: [vars.map((v) => examples[v - 1] ?? "")] };
  }
  return comp;
}

/** Componentes para ENVIAR o template, preenchendo as variáveis do BODY. */
export function buildSendComponents(
  bodyText: string,
  values: string[]
): unknown[] {
  const vars = extractVariables(bodyText);
  if (vars.length === 0) return [];
  return [
    {
      type: "body",
      parameters: vars.map((v) => ({ type: "text", text: values[v - 1] ?? "" })),
    },
  ];
}

/**
 * Achata os `components` de envio num array plano de valores.
 *
 * O Zernio, para ABRIR uma conversa (`POST /v1/inbox/conversations`), não toma a
 * estrutura de components da Meta e sim `templateParams`: um único array com os valores
 * na ordem em que aparecem as variáveis (header de texto, body, e depois um valor
 * por cada botão de URL dinâmica). Dentro de um fio já aberto sim aceita components.
 */
export function flattenTemplateParams(components: unknown): string[] {
  if (!Array.isArray(components)) return [];

  const order = ["header", "body", "button"];
  const sorted = [...(components as Array<Record<string, unknown>>)].sort((a, b) => {
    const ia = order.indexOf(String(a?.type ?? "").toLowerCase());
    const ib = order.indexOf(String(b?.type ?? "").toLowerCase());
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });

  const values: string[] = [];
  for (const comp of sorted) {
    const params = comp?.parameters;
    if (!Array.isArray(params)) continue;
    for (const p of params as Array<Record<string, unknown>>) {
      if (typeof p?.text === "string") values.push(p.text);
    }
  }
  return values;
}

/** Substitui {{n}} pelo seu valor; deixa o placeholder se faltar (para pré-visualizar). */
export function renderTemplateBody(bodyText: string, values: string[]): string {
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, n: string) => {
    const idx = parseInt(n, 10) - 1;
    const v = values[idx];
    return v && v.length ? v : `{{${n}}}`;
  });
}

interface BodyLikeComponent {
  type?: string;
  text?: string;
}

/** Extrai o texto do componente BODY de um template (formato Meta). */
export function getBodyText(components: unknown): string {
  if (!Array.isArray(components)) return "";
  const body = (components as BodyLikeComponent[]).find(
    (c) => typeof c?.type === "string" && c.type.toUpperCase() === "BODY"
  );
  return body?.text ?? "";
}
