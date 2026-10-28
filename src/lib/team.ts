import "server-only";
import { db } from "@/db";
import { contacts, teamMembers } from "@/db/schema";
import { asc, eq, type SQL } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { ID_MIEMBRO_LOCAL, modoLocal } from "@/lib/modo-local";

/**
 * Equipe e visibilidade.
 *
 * O Supabase Auth diz QUEM entrou; `team_members` diz O QUE É (admin ou assessor) e se
 * continua ativo. Toda rota que devolva contatos, conversas, operações ou
 * atividades passa por `getCurrentMember()` e aplica `ownerFilter()`:
 *
 *   admin   -> vê tudo, atribui, administra a equipe
 *   asesor  -> vê só os contatos que tem atribuídos (e o que pende deles)
 *
 * O filtro se aplica no servidor, não na UI: um assessor que monte a URL à mão
 * também não vê o alheio.
 */

export type TeamRole = "admin" | "asesor";

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: TeamRole;
  active: boolean;
}

function toMember(row: typeof teamMembers.$inferSelect): TeamMember {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role === "admin" ? "admin" : "asesor",
    active: row.active,
  };
}

/**
 * Membro da equipe da sessão atual, ou null se não há sessão, se o usuário
 * não está em `team_members` ou se foi desativado.
 *
 * Um usuário de Auth que não esteja na equipe não é um erro de programação: é
 * alguém que ficou de fora (desativado, ou entrou por um signup aberto). Trata-se
 * como não autorizado.
 */
export async function getCurrentMember(): Promise<TeamMember | null> {
  // Modo local: não há sessão para ler. O administrador de mentira o cria
  // `npm run local` pelo mesmo caminho que o primeiro admin de uma instância real (o
  // gatilho sobre auth.users), então se lê da base como qualquer outro.
  if (modoLocal()) {
    const [row] = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.id, ID_MIEMBRO_LOCAL))
      .limit(1);
    return row ? toMember(row) : null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.id, user.id))
    .limit(1);

  if (!row || !row.active) return null;
  return toMember(row);
}

export async function listMembers(opts?: {
  onlyActive?: boolean;
}): Promise<TeamMember[]> {
  const rows = await db.select().from(teamMembers).orderBy(asc(teamMembers.createdAt));
  return rows
    .filter((r) => !opts?.onlyActive || r.active)
    .map(toMember);
}

export async function getMember(id: string): Promise<TeamMember | null> {
  const [row] = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.id, id))
    .limit(1);
  return row ? toMember(row) : null;
}

/**
 * Condição SQL de visibilidade sobre `contacts`. `undefined` = sem filtro (admin).
 * Para tabelas que pendem do contato (conversas, operações, atividades) se
 * faz join a `contacts` e se aplica a mesma condição.
 */
export function ownerFilter(member: TeamMember): SQL | undefined {
  if (member.role === "admin") return undefined;
  return eq(contacts.ownerId, member.id);
}

/**
 * Para `listConversations({ ownerId })` e similares: `undefined` = sem filtro.
 */
export function visibleOwnerId(member: TeamMember): string | undefined {
  return member.role === "admin" ? undefined : member.id;
}

/** true se o membro pode ver/mexer neste contato. */
export function canAccessContact(
  member: TeamMember,
  contact: { ownerId: string | null }
): boolean {
  return member.role === "admin" || contact.ownerId === member.id;
}

/**
 * Como `canAccessContact`, mas a partir do id: consulta `owner_id`. Para rotas por
 * id (operação, atividade, fio) que só têm o contact_id à mão. Um contato
 * inexistente devolve false, e a rota responde 404 sem confirmar que exista.
 */
export async function canAccessContactId(
  member: TeamMember,
  contactId: string
): Promise<boolean> {
  if (member.role === "admin") return true;
  const [row] = await db
    .select({ ownerId: contacts.ownerId })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  return Boolean(row) && row.ownerId === member.id;
}

/** true se já há pelo menos um membro: decide se o cadastro público continua aberto. */
export async function hayMiembros(): Promise<boolean> {
  const [row] = await db.select({ id: teamMembers.id }).from(teamMembers).limit(1);
  return Boolean(row);
}

/**
 * Busca um assessor ativo por nome ou e-mail, tolerante a maiúsculas, acentos e
 * nomes parciais ("juan" casa com "Juan Perez"). Usa o agente: o prompt diz
 * "atribua a Juan" e aqui se resolve quem é Juan.
 *
 * Devolve `ambiguous` quando mais de um casa, para que o agente pergunte em vez
 * de adivinhar.
 */
export async function findMemberByName(
  query: string
): Promise<
  | { status: "found"; member: TeamMember }
  | { status: "ambiguous"; candidates: TeamMember[] }
  | { status: "not_found"; available: TeamMember[] }
> {
  const members = await listMembers({ onlyActive: true });
  const q = normalize(query);
  if (!q) return { status: "not_found", available: members };

  const exact = members.filter(
    (m) => normalize(m.name ?? "") === q || normalize(m.email) === q
  );
  if (exact.length === 1) return { status: "found", member: exact[0] };

  const partial = members.filter((m) => {
    const name = normalize(m.name ?? "");
    const emailUser = normalize(m.email.split("@")[0]);
    return (
      name.includes(q) ||
      (q.includes(name) && name.length > 2) ||
      emailUser === q ||
      name.split(" ").some((part) => part === q)
    );
  });

  if (partial.length === 1) return { status: "found", member: partial[0] };
  if (partial.length > 1) return { status: "ambiguous", candidates: partial };
  return { status: "not_found", available: members };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function displayName(member: Pick<TeamMember, "name" | "email">): string {
  return member.name?.trim() || member.email.split("@")[0];
}
