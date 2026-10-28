import "server-only";
import { db } from "@/db";
import { propiedades } from "../tabla";
import { scrapeUrl } from "./firecrawl";
import { getOpenRouterClient, getAgentModel, hasOpenRouterKey } from "@/lib/agent/openrouter";

/**
 * Busca de UMA propriedade pontual por endereço, nome ou URL de portal.
 * Fonte: tabela `propiedades` (catálogo sincronizado a partir do Tokko ou outra origem).
 *
 * - Se a query é texto (endereço/nome): fuzzy match contra address / título / bairro.
 * - Se a query é URL: faz scrape com Firecrawl, extrai o endereço e busca esse
 *   endereço no Supabase (NÃO casa por URL exata — a mesma propriedade pode ter
 *   vários links de portais diferentes).
 */

export interface PropertyMatch {
  direccion: string;
  barrio: string;
  ubicacion: string;
  tipo: string;
  operacion: string;
  ambientes: string;
  banos: string;
  m2: string;
  valor: string;
  expensas: string;
  amenities: string;
  aptoCredito: string;
  link: string;
  descripcion: string;
  referenceCode: string;
}

export interface SearchResult {
  ok: boolean;
  match?: PropertyMatch;
  matchScore?: number;
  matchedBy?: "url" | "address" | "barrio" | "fuzzy";
  error?: string;
  // Se foi por URL mas não encontramos match exato, devolvemos o extraído do scrape
  scraped?: { direccion?: string; barrio?: string };
  // Para o agente saber se é empreendimento (regra do prompt)
  esDesarrollo?: boolean;
}

// Linha leve de `properties` (sem embedding nem raw) para o matching em memória.
interface PropRow {
  referenceCode: string | null;
  title: string | null;
  propertyType: string | null;
  operation: string | null;
  price: string | null;
  currency: string | null;
  rooms: number | null;
  bathrooms: number | null;
  surfaceTotal: string | null;
  neighborhood: string | null;
  fullLocation: string | null;
  address: string | null;
  creditEligible: boolean | null;
  expenses: string | null;
  amenities: string[];
  publicUrl: string | null;
  description: string | null;
}

// Cache em memória do catálogo (evita bater na DB a cada mensagem de uma rajada).
let cache: { rows: PropRow[]; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function loadProperties(): Promise<PropRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await db
    .select({
      referenceCode: propiedades.referenceCode,
      title: propiedades.title,
      propertyType: propiedades.propertyType,
      operation: propiedades.operation,
      price: propiedades.price,
      currency: propiedades.currency,
      rooms: propiedades.rooms,
      bathrooms: propiedades.bathrooms,
      surfaceTotal: propiedades.surfaceTotal,
      neighborhood: propiedades.neighborhood,
      fullLocation: propiedades.fullLocation,
      address: propiedades.address,
      creditEligible: propiedades.creditEligible,
      expenses: propiedades.expenses,
      amenities: propiedades.amenities,
      publicUrl: propiedades.publicUrl,
      description: propiedades.description,
    })
    .from(propiedades);
  cache = { rows, at: Date.now() };
  return rows;
}

function fmtValor(r: PropRow): string {
  if (!r.price) return "";
  const n = parseFloat(r.price);
  const num = Number.isFinite(n) ? n.toLocaleString("es") : r.price;
  return `${r.currency ?? ""} ${num}`.trim();
}

function rowToMatch(r: PropRow): PropertyMatch {
  return {
    direccion: r.address ?? "",
    barrio: r.neighborhood ?? "",
    ubicacion: r.fullLocation ?? "",
    tipo: r.propertyType ?? "",
    operacion: r.operation ?? "",
    ambientes: r.rooms != null ? String(r.rooms) : "",
    banos: r.bathrooms != null ? String(r.bathrooms) : "",
    m2: r.surfaceTotal ?? "",
    valor: fmtValor(r),
    expensas: r.expenses ?? "",
    amenities: (r.amenities ?? []).join(", "),
    aptoCredito:
      r.creditEligible === true ? "Si" : r.creditEligible === false ? "No" : "",
    link: r.publicUrl ?? "",
    descripcion: r.description ?? "",
    referenceCode: r.referenceCode ?? "",
  };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 2);
}

function fuzzyScore(query: string, target: string): number {
  if (!query || !target) return 0;
  const q = normalize(query);
  const t = normalize(target);
  if (!q || !t) return 0;
  if (t.includes(q) || q.includes(t)) return 1;

  const qTokens = new Set(tokens(query));
  const tTokens = tokens(target);
  if (qTokens.size === 0 || tTokens.length === 0) return 0;

  let hits = 0;
  for (const tok of tTokens) {
    if (qTokens.has(tok)) hits++;
  }
  return hits / Math.max(qTokens.size, tTokens.length);
}

function isUrl(query: string): boolean {
  return /^https?:\/\//i.test(query.trim());
}

/**
 * Regex de fallback para extrair endereço do markdown obtido por scrape de um portal.
 * Captura o primeiro padrão "<rua> <núm>, <bairro>".
 */
function extractAddressViaRegex(
  markdown: string
): { direccion?: string; barrio?: string } | null {
  const patterns = [
    /####\s*([^,\n]+?)\s*,\s*([^,\n]+?)\s*,/,
    /Direccion[:\s]*([^,\n]+?)\s*,\s*([^,\n]+)/i,
    /^([A-Z][\wÁÉÍÓÚáéíóúñÑ.\s]+?\s(?:al\s)?\d{2,5})[\s,\-]+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚáéíóúñÑ\s]+)/m,
  ];

  for (const re of patterns) {
    const m = markdown.match(re);
    if (m && m[1] && m[2]) {
      const direccion = m[1].trim();
      const barrio = m[2].trim();
      if (direccion.length > 4 && direccion.length < 120) {
        return { direccion, barrio };
      }
    }
  }
  return null;
}

/**
 * Extrai endereço + bairro do markdown. 1) regex (rápido, de graça); 2) fallback para
 * um modelo mini via OpenRouter com response_format JSON se a regex falhou.
 */
async function extractAddressFromScrape(
  markdown: string
): Promise<{ direccion?: string; barrio?: string } | null> {
  const fromRegex = extractAddressViaRegex(markdown);
  if (fromRegex?.direccion) return fromRegex;

  if (!hasOpenRouterKey()) return null;
  const client = getOpenRouterClient();
  const trimmed = markdown.slice(0, 4000);
  const model = getAgentModel();

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Sos un extractor de direcciones de propiedades inmobiliarias. " +
            "Devolves SIEMPRE JSON valido. Si no podes extraer, devolves nulls.",
        },
        {
          role: "user",
          content: `Extrae la direccion de la propiedad inmobiliaria de este texto scrapeado de un portal (ZonaProp/ArgenProp/etc). Devolve SOLO JSON con este formato exacto: {"direccion": "Calle 1234", "barrio": "Belgrano"}. Si no podes extraer la direccion, devolve {"direccion": null, "barrio": null}.

TEXTO:
${trimmed}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 200,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(text) as {
      direccion?: string | null;
      barrio?: string | null;
    };
    return {
      direccion: parsed.direccion ?? undefined,
      barrio: parsed.barrio ?? undefined,
    };
  } catch {
    return null;
  }
}

interface BestMatch {
  row: PropRow;
  score: number;
  via: "address" | "barrio" | "fuzzy";
}

/**
 * Score = o melhor entre endereço (preferido), título do anúncio e bairro/localização.
 */
function findBestMatch(rows: PropRow[], query: string): BestMatch {
  let best: BestMatch = { row: rows[0], score: 0, via: "fuzzy" };
  for (const row of rows) {
    const sAddr = fuzzyScore(query, row.address ?? "");
    const sTitle = fuzzyScore(query, row.title ?? "") * 0.9;
    const sBarrio = fuzzyScore(query, row.neighborhood ?? "") * 0.6;
    const sLoc = fuzzyScore(query, row.fullLocation ?? "") * 0.5;

    const max = Math.max(sAddr, sTitle, sBarrio, sLoc);
    if (max > best.score) {
      best = {
        row,
        score: Math.min(max, 1),
        via: max === sBarrio ? "barrio" : "address",
      };
    }
  }
  return best;
}

/**
 * Busca uma propriedade no catálogo do Supabase.
 * 1. Se query é URL: scrape com Firecrawl, extrair endereço, fuzzy match no Supabase.
 * 2. Se query é texto: fuzzy match direto contra endereço / título / bairro.
 */
export async function searchProperty(query: string): Promise<SearchResult> {
  let rows: PropRow[];
  try {
    rows = await loadProperties();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error leyendo el catalogo",
    };
  }

  if (rows.length === 0) {
    return { ok: false, error: "no hay propiedades cargadas en el catalogo" };
  }

  // URL → scrape, extrair endereço, casar esse endereço no Supabase.
  if (isUrl(query)) {
    const scraped = await scrapeUrl(query);
    if (!scraped.ok || !scraped.markdown) {
      return {
        ok: false,
        error: `No pude scrapear la URL: ${scraped.error ?? "sin contenido"}`,
      };
    }

    const extracted = await extractAddressFromScrape(scraped.markdown);
    if (!extracted?.direccion) {
      return {
        ok: false,
        error: "No pude extraer la direccion del link scrapeado",
        scraped: extracted ?? undefined,
      };
    }

    const best = findBestMatch(rows, extracted.direccion);
    if (best.score >= 0.4) {
      return {
        ok: true,
        match: rowToMatch(best.row),
        matchedBy: best.via,
        matchScore: best.score,
        scraped: extracted,
      };
    }

    return {
      ok: false,
      error: `Encontre la propiedad en el portal (${extracted.direccion}${
        extracted.barrio ? ", " + extracted.barrio : ""
      }) pero no esta en nuestro catalogo`,
      scraped: extracted,
    };
  }

  // Texto → checar se é empreendimento (regra do prompt) e depois fuzzy match.
  if (/desarrollo|emprendimiento|pozo|construccion|preventa/i.test(query)) {
    return { ok: false, esDesarrollo: true, error: "consulta sobre desarrollo" };
  }

  const best = findBestMatch(rows, query);
  if (best.score >= 0.5) {
    return {
      ok: true,
      match: rowToMatch(best.row),
      matchedBy: best.via,
      matchScore: best.score,
    };
  }

  return { ok: false, error: "no encontre la propiedad en el catalogo" };
}
