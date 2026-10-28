import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { contacts, deals } from "@/db/schema";

/**
 * Tabela do módulo (espelho tipado de migrations/0000_visitas.sql). O Drizzle aceita
 * tabelas definidas fora de src/db/schema.ts: o módulo a consulta com `db` do
 * núcleo sem tocar o schema do núcleo.
 */
export const visitas = pgTable("visitas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => deals.id, { onDelete: "set null" }),
  /** Endereço ou nome do lugar a visitar. */
  propertyAddress: text("property_address"),
  /** coordinating | scheduled | completed | cancelled */
  status: text("status").notNull().default("coordinating"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
