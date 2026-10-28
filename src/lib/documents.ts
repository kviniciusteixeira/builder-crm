import "server-only";
import { db } from "@/db";
import { contacts, deals, documents, pipelineStages, teamMembers } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ALLOWED_MIME,
  MAX_FILE_BYTES,
  deleteObject,
  deleteObjects,
  objectSize,
  safeFilename,
  signDownload,
  signUpload,
} from "@/lib/storage";

/**
 * Documentos da ficha. Upload em dois passos:
 *
 *   1. `beginUpload`  -> linha `pending` + URL assinada. O navegador faz PUT no bucket.
 *   2. `confirmUpload` -> o servidor verifica que o objeto existe (HEAD) e marca `ready`.
 *
 * Só se listam os `ready`. Um `pending` é um upload que se cortou; não incomoda
 * ninguém e pode-se limpar quando se quiser.
 *
 * Quem pode ver um documento é quem pode ver o contato: a visibilidade a
 * decide `canAccessContact` na rota, não aqui.
 */

export interface DocumentItem {
  id: string;
  contactId: string;
  dealId: string | null;
  dealTitle: string | null;
  stageName: string | null;
  name: string;
  mime: string;
  size: number;
  uploadedBy: string | null;
  createdAt: Date;
}

export async function listDocuments(contactId: string): Promise<DocumentItem[]> {
  const rows = await db
    .select({
      id: documents.id,
      contactId: documents.contactId,
      dealId: documents.dealId,
      dealTitle: deals.title,
      stageName: pipelineStages.name,
      name: documents.name,
      mime: documents.mime,
      size: documents.size,
      uploadedBy: sql<string | null>`coalesce(${teamMembers.name}, split_part(${teamMembers.email}, '@', 1))`,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .leftJoin(deals, eq(documents.dealId, deals.id))
    .leftJoin(pipelineStages, eq(documents.stageId, pipelineStages.id))
    .leftJoin(teamMembers, eq(documents.uploadedBy, teamMembers.id))
    .where(and(eq(documents.contactId, contactId), eq(documents.status, "ready")))
    .orderBy(desc(documents.createdAt));
  return rows;
}

/** Quantos documentos prontos tem cada contato (para o contador do kanban). */
export async function countDocumentsByContact(
  contactIds: string[]
): Promise<Record<string, number>> {
  if (contactIds.length === 0) return {};
  const rows = await db
    .select({ contactId: documents.contactId, n: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(inArray(documents.contactId, contactIds), eq(documents.status, "ready")))
    .groupBy(documents.contactId);
  return Object.fromEntries(rows.map((r) => [r.contactId, r.n]));
}

export interface BeginUploadInput {
  contactId: string;
  name: string;
  mime: string;
  size: number;
  /** Operação à qual se associa; se não vem e o contato tem uma só, usa-se essa. */
  dealId?: string | null;
  memberId: string;
}

export type BeginUploadResult =
  | { ok: true; id: string; uploadUrl: string }
  | { ok: false; error: string };

export async function beginUpload(input: BeginUploadInput): Promise<BeginUploadResult> {
  if (!ALLOWED_MIME[input.mime]) {
    return { ok: false, error: "Solo se aceptan PDF e imagenes (JPG, PNG, WebP)." };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: "Archivo vacio." };
  }
  if (input.size > MAX_FILE_BYTES) {
    return { ok: false, error: `El archivo supera los ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
  }

  // Foto da operação + etapa no momento do upload.
  let dealId = input.dealId ?? null;
  let stageId: string | null = null;
  const contactDeals = await db
    .select({ id: deals.id, stageId: deals.stageId })
    .from(deals)
    .where(eq(deals.contactId, input.contactId));
  if (dealId && !contactDeals.some((d) => d.id === dealId)) dealId = null;
  if (!dealId && contactDeals.length === 1) dealId = contactDeals[0].id;
  if (dealId) stageId = contactDeals.find((d) => d.id === dealId)?.stageId ?? null;

  const id = crypto.randomUUID();
  const filename = safeFilename(input.name, input.mime);
  const storageKey = `contacts/${input.contactId}/${id}/${filename}`;

  await db.insert(documents).values({
    id,
    contactId: input.contactId,
    dealId,
    stageId,
    name: input.name.trim().slice(0, 200) || filename,
    mime: input.mime,
    size: input.size,
    storageKey,
    status: "pending",
    uploadedBy: input.memberId,
  });

  const uploadUrl = await signUpload(storageKey, input.mime);
  return { ok: true, id, uploadUrl };
}

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/** Marca `ready` se o objeto está no bucket. Senão, apaga a linha: o upload falhou. */
export async function confirmUpload(id: string): Promise<ConfirmResult> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return { ok: false, error: "Documento no encontrado" };
  if (doc.status === "ready") return { ok: true };

  const size = await objectSize(doc.storageKey);
  if (size === null) {
    await db.delete(documents).where(eq(documents.id, id));
    return { ok: false, error: "El archivo no llego al bucket. Intenta de nuevo." };
  }
  if (size > MAX_FILE_BYTES) {
    // Alguém assinou com um tamanho e subiu outro: fora.
    await deleteObject(doc.storageKey).catch(() => {});
    await db.delete(documents).where(eq(documents.id, id));
    return { ok: false, error: "El archivo supera el tamano permitido." };
  }

  await db.update(documents).set({ status: "ready", size }).where(eq(documents.id, id));
  return { ok: true };
}

export async function getDocument(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return doc ?? null;
}

export async function documentDownloadUrl(
  doc: { storageKey: string; name: string; mime: string },
  inline: boolean
): Promise<string> {
  return signDownload(doc.storageKey, { filename: doc.name, mime: doc.mime, inline });
}

export async function deleteDocument(id: string): Promise<void> {
  const doc = await getDocument(id);
  if (!doc) return;
  // Primeiro o objeto: se falha, a linha fica e pode-se tentar de novo. Ao contrário, o
  // arquivo ficaria órfão no bucket sem ninguém que o referencie.
  await deleteObject(doc.storageKey);
  await db.delete(documents).where(eq(documents.id, id));
}

/**
 * Apaga do bucket tudo o do contato. Chamar ANTES de apagar o contato: a linha
 * vai por cascade, o objeto não. Best-effort: se o bucket não responde, o contato
 * se apaga igual e ficam objetos órfãos, que é preferível a não poder apagar.
 */
export async function purgeContactDocuments(contactId: string): Promise<void> {
  const rows = await db
    .select({ key: documents.storageKey })
    .from(documents)
    .where(eq(documents.contactId, contactId));
  if (rows.length === 0) return;
  try {
    await deleteObjects(rows.map((r) => r.key));
  } catch (err) {
    console.error("[documents] purge fallo para contacto", contactId, err);
  }
}

/** Contato do documento, para a guarda de acesso nas rotas. */
export async function documentContact(doc: { contactId: string }) {
  const [c] = await db
    .select({ id: contacts.id, ownerId: contacts.ownerId })
    .from(contacts)
    .where(eq(contacts.id, doc.contactId))
    .limit(1);
  return c ?? null;
}
