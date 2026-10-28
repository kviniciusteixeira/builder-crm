import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const contacts = pgTable("contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  source: text("source").notNull().default("otro"),
  score: integer("score").notNull().default(0),
  notes: text("notes"),
  tags: text("tags")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /**
   * Campos definidos pelo cliente em config/cliente.ts (`contacto.campos`):
   * { clave: valor }. Validados contra a config em src/lib/config/campos.ts.
   */
  customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
  /** Resumo do lead escrito pelo agente (tool resumen_lead), com sua data. */
  aiSummary: text("ai_summary"),
  aiSummaryAt: timestamp("ai_summary_at", { withTimezone: true }),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  needsHuman: boolean("needs_human").notNull().default(false),
  needsHumanReason: text("needs_human_reason"),
  needsHumanAt: timestamp("needs_human_at", { withTimezone: true }),
  /**
   * Proprietário: o assessor responsável. É a chave de visibilidade (um assessor vê só o
   * que é dele) e o que dispara a automação `contact.assigned`. Atribui-se a partir da
   * ficha ou pelo agente (tool `asignar_asesor`); sempre via `assignContact`.
   */
  ownerId: uuid("owner_id").references(() => teamMembers.id, {
    onDelete: "set null",
  }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agentJobs = pgTable("agent_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "cascade",
  }),
  status: text("status").notNull().default("pending"),
  processAfter: timestamp("process_after", { withTimezone: true }).notNull(),
  triggerMessageId: text("trigger_message_id"),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pipelines = pgTable("pipelines", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    /**
     * Chave estável da etapa em config/cliente.ts (`pipeline.etapas[].clave`). Ela
     * é usada por `sincronizarPipeline` para reconhecer a etapa mesmo se o nome mudar, e o
     * agente para movê-la por chave. NULL = etapa criada à mão a partir da UI.
     */
    key: text("key"),
    name: text("name").notNull(),
    order: integer("order").notNull(),
    color: text("color").notNull().default("#64748b"),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false),
  },
  (t) => [unique("pipeline_stages_pipeline_key").on(t.pipelineId, t.key)]
);

export const deals = pgTable("deals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  value: integer("value").notNull().default(0),
  stageId: text("stage_id")
    .notNull()
    .references(() => pipelineStages.id),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  expectedClose: timestamp("expected_close", { withTimezone: true }),
  probability: integer("probability").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const activities = pgTable("activities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(),
  description: text("description").notNull(),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => deals.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const crmSettings = pgTable("crm_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Mensagens de TODOS os canais (antes `whatsapp_messages`). `external_id` é o id do
// provedor e a chave de idempotência do webhook via o índice único (provider, external_id).
// `meta_message_id`, `from_phone` e `to_phone` são legado do fluxo Meta direto.
export const messages = pgTable("messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contactId: text("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "cascade",
  }),
  channel: text("channel").notNull().default("whatsapp"),
  provider: text("provider").notNull().default("meta"),
  direction: text("direction").notNull(),
  /** De saída: agent | human | template | webhook. De entrada: null. Os relatórios usam isso. */
  origin: text("origin"),
  type: text("type").notNull().default("text"),
  body: text("body"),
  externalId: text("external_id"),
  metaMessageId: text("meta_message_id"),
  templateName: text("template_name"),
  status: text("status").notNull().default("received"),
  errorMessage: text("error_message"),
  rawPayload: jsonb("raw_payload"),
  fromPhone: text("from_phone"),
  toPhone: text("to_phone"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  language: text("language").notNull().default("es"),
  category: text("category").notNull(),
  components: jsonb("components").notNull(),
  status: text("status").notNull().default("PENDING"),
  metaTemplateId: text("meta_template_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Multi-tenancy (Fase 1 WhatsApp Coexistence). RLS e tenant_members -> Fase 2.
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Uma linha por número de WhatsApp conectado. `phone_number_id` é a chave de
// routing de entrada; `access_token` é texto puro na Fase 1 (só server-side).
export const whatsappAccounts = pgTable("whatsapp_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  phoneNumberId: text("phone_number_id").notNull().unique(),
  wabaId: text("waba_id"),
  displayPhone: text("display_phone"),
  accessToken: text("access_token"),
  status: text("status").notNull().default("active"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================
// Multicanal via Zernio (Instagram DM + Facebook Messenger + WhatsApp)
// ============================================================

// Uma linha por conta social conectada. `zernioAccountId` é a chave de routing
// de entrada, o equivalente de `whatsappAccounts.phoneNumberId` no fluxo Meta direto.
export const channelAccounts = pgTable("channel_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("zernio"),
  platform: text("platform").notNull(),
  zernioAccountId: text("zernio_account_id").unique(),
  zernioProfileId: text("zernio_profile_id"),
  username: text("username"),
  displayName: text("display_name"),
  /** phone_number_id | page_id | ig_business_id, conforme a plataforma. */
  externalRef: text("external_ref"),
  status: text("status").notNull().default("active"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// O fio real. Um contato pode ter vários: WhatsApp e Instagram não se misturam.
export const conversations = pgTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    accountId: uuid("account_id").references(() => channelAccounts.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull(),
    provider: text("provider").notNull().default("zernio"),
    /** conversationId do Zernio, ou `legacy:<contactId>` para os fios anteriores. */
    externalId: text("external_id").notNull(),
    /** Telefone E.164 | IGSID | PSID. */
    participantId: text("participant_id"),
    participantName: text("participant_name"),
    participantHandle: text("participant_handle"),
    participantPicture: text("participant_picture"),
    status: text("status").notNull().default("active"),
    unreadCount: integer("unread_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessageBody: text("last_message_body"),
    lastDirection: text("last_direction"),
    /**
     * Janela de 24h materializada do lado do servidor. A política da Meta não se
     * pode delegar ao cliente, que é onde hoje se calcula (ChatPanel.tsx).
     */
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    needsHuman: boolean("needs_human").notNull().default(false),
    needsHumanReason: text("needs_human_reason"),
    needsHumanAt: timestamp("needs_human_at", { withTimezone: true }),
    /** Campos ctwa_* e meta_ad_* do Zernio: de qual anúncio veio o lead. */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("conversations_provider_external_key").on(t.provider, t.externalId),
  ]
);

// Identidade por canal. Substitui `contacts.phone` como chave de deduplicação:
// Instagram usa IGSID e Messenger PSID, não há telefone.
export const contactIdentities = pgTable(
  "contact_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    externalId: text("external_id").notNull(),
    handle: text("handle"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("contact_identities_channel_external_key").on(
      t.channel,
      t.externalId
    ),
  ]
);

// Um agente distinto por canal. NULL = usar o fallback (crm_settings e depois o
// default hardcoded em src/lib/agent/prompt.ts).
export const agentConfigs = pgTable(
  "agent_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    systemPrompt: text("system_prompt"),
    enabledTools: text("enabled_tools").array(),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("agent_configs_tenant_channel_key").on(t.tenantId, t.channel)]
);

/**
 * O Zernio entrega at-least-once e tenta de novo 7 vezes: o event id é a deduplicação.
 *
 * Guarda o payload e não só o id porque a nova tentativa se auto-deduplica: se o
 * `after()` do handler morre depois de ter reivindicado o evento, a nova tentativa o vê
 * como duplicado e o evento se perderia. Com o payload guardado, o sweeper reprocessa.
 */
export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  provider: text("provider").notNull().default("zernio"),
  event: text("event"),
  /** received | processed | ignored | failed */
  status: text("status").notNull().default("received"),
  attempts: integer("attempts").notNull().default(0),
  payload: jsonb("payload"),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

// ============================================================
// Equipe, automações e push
// ============================================================

/**
 * Espelho de `auth.users` com o que o Supabase Auth não sabe: o papel e se continua ativo.
 * `id` É o id do usuário de Auth. Os usuários que existiam antes da migração
 * ficaram como admin; os novos são criados em Ajustes -> Equipo como assessor.
 */
export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  /** admin | asesor */
  role: text("role").notNull().default("asesor"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Uma linha por dispositivo: o mesmo assessor no celular e no notebook tem duas. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [unique("push_subscriptions_member_endpoint_key").on(t.memberId, t.endpoint)]
);

/**
 * Uma regra: gatilho + filtros + cadeia de ações. É DADO: monta-se a partir de
 * /automatizaciones. O catálogo de gatilhos e ações (o que existe e o que cada
 * um faz) vive no código, em `src/lib/automations/triggers.ts` e `actions.ts`.
 */
export const automations = pgTable("automations", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  trigger: text("trigger").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  /** `[{ field, op, value }]` sobre o payload do gatilho. Vazio = sempre. */
  filters: jsonb("filters").notNull().default(sql`'[]'::jsonb`),
  /** `[{ type, params }]` em ordem de execução. */
  actions: jsonb("actions").notNull().default(sql`'[]'::jsonb`),
  /** `seed` (veio numa migração, não se apaga) | `user` (criada a partir da UI). */
  source: text("source").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Fila e histórico numa só tabela. Um evento gera uma linha `pending` por regra
 * ativa; o worker a passa para `done`/`skipped`/`failed`. O que resta é o histórico
 * que se vê em Ajustes -> Automatizaciones.
 */
export const automationRuns = pgTable("automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  automationKey: text("automation_key")
    .notNull()
    .references(() => automations.key, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(),
  contactId: text("contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  /** pending | processing | done | skipped | failed */
  status: text("status").notNull().default("pending"),
  processAfter: timestamp("process_after", { withTimezone: true })
    .notNull()
    .defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  payload: jsonb("payload"),
  result: jsonb("result"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

/**
 * Notificações internas (o sininho). O push é best-effort; isto é o registro
 * que sempre fica: vê-se no CRM mesmo que o push não chegue, e marca-se como lida.
 */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => teamMembers.id, { onDelete: "cascade" }),
  /** automation | system */
  kind: text("kind").notNull().default("automation"),
  title: text("title").notNull(),
  body: text("body"),
  url: text("url"),
  contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Documentos da ficha (PDFs, cédulas, contratos). O arquivo vive num bucket
 * S3-compatible (`src/lib/storage.ts`); aqui só a ficha dele. `status='pending'` enquanto
 * o navegador envia; 'ready' quando o servidor confirmou que o objeto existe.
 */
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => deals.id, { onDelete: "set null" }),
  stageId: text("stage_id").references(() => pipelineStages.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  /** pending | ready */
  status: text("status").notNull().default("pending"),
  uploadedBy: uuid("uploaded_by").references(() => teamMembers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
