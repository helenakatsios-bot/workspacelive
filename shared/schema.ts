import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, boolean, timestamp, decimal, jsonb, index, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============ TENANTS (Multi-tenancy) ============
export const PURAX_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export const tenants = pgTable("tenants", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: boolean("active").notNull().default(true),
  plan: text("plan").notNull().default("standard"), // standard, professional, enterprise
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

// ============ USERS ============
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("office"), // admin, office, warehouse, readonly
  active: boolean("active").notNull().default(true),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLogin: timestamp("last_login"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, lastLogin: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============ COMPANIES (CUSTOMERS) ============
export const companies = pgTable("companies", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  legalName: text("legal_name").notNull(),
  tradingName: text("trading_name"),
  abn: text("abn"),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  paymentTerms: text("payment_terms").default("Net 30"),
  creditStatus: text("credit_status").notNull().default("active"), // active, on_hold
  phone: text("phone"),
  emailAddresses: text("email_addresses").array(),
  tags: text("tags").array(),
  internalNotes: text("internal_notes"),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default("0"),
  clientGrade: text("client_grade"), // A (>500k), B (100k-500k), C (<100k)
  lastOrderDate: timestamp("last_order_date"),
  priceListId: varchar("price_list_id", { length: 36 }),
  portalCategories: text("portal_categories").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("companies_legal_name_idx").on(table.legalName),
  index("companies_credit_status_idx").on(table.creditStatus),
]);

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

// ============ CONTACTS ============
export const contacts = pgTable("contacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id", { length: 36 }).notNull().references(() => companies.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  position: text("position"),
  preferredContactMethod: text("preferred_contact_method").default("email"), // email, phone, sms
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("contacts_company_idx").on(table.companyId),
  index("contacts_email_idx").on(table.email),
]);

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// ============ DEALS ============
export const deals = pgTable("deals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id", { length: 36 }).notNull().references(() => companies.id),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id),
  dealName: text("deal_name").notNull(),
  pipelineStage: text("pipeline_stage").notNull().default("lead"), // lead, qualified, quote_sent, negotiation, won, lost
  estimatedValue: decimal("estimated_value", { precision: 12, scale: 2 }),
  probability: integer("probability").default(0),
  expectedCloseDate: timestamp("expected_close_date"),
  ownerUserId: varchar("owner_user_id", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("deals_company_idx").on(table.companyId),
  index("deals_stage_idx").on(table.pipelineStage),
]);

export const insertDealSchema = createInsertSchema(deals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof deals.$inferSelect;

// ============ PRODUCTS ============
export const products = pgTable("products", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  costPrice: decimal("cost_price", { precision: 12, scale: 2 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("products_sku_idx").on(table.sku),
  index("products_category_idx").on(table.category),
  index("products_tenant_idx").on(table.tenantId),
]);

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// ============ QUOTES ============
export const quotes = pgTable("quotes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  quoteNumber: text("quote_number").notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull().references(() => companies.id),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id),
  status: text("status").notNull().default("draft"), // draft, sent, accepted, declined
  issueDate: timestamp("issue_date").notNull().defaultNow(),
  expiryDate: timestamp("expiry_date"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  tax: decimal("tax", { precision: 12, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("quotes_company_idx").on(table.companyId),
  index("quotes_status_idx").on(table.status),
]);

export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true, createdAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

// ============ QUOTE LINES ============
export const quoteLines = pgTable("quote_lines", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id", { length: 36 }).notNull().references(() => quotes.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).references(() => products.id),
  descriptionOverride: text("description_override"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  lineTotal: decimal("line_total", { precision: 12, scale: 2 }).notNull(),
});

export const insertQuoteLineSchema = createInsertSchema(quoteLines).omit({ id: true });
export type InsertQuoteLine = z.infer<typeof insertQuoteLineSchema>;
export type QuoteLine = typeof quoteLines.$inferSelect;

// ============ ORDERS (CORE TABLE) ============
export const orders = pgTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  orderNumber: text("order_number").notNull(),
  companyId: varchar("company_id", { length: 36 }).notNull().references(() => companies.id),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id),
  quoteId: varchar("quote_id", { length: 36 }).references(() => quotes.id),
  status: text("status").notNull().default("new"), // new, confirmed, in_production, ready, dispatched, completed, cancelled, on_hold
  orderDate: timestamp("order_date").notNull().defaultNow(), // THIS DRIVES DATE FILTERS
  requestedShipDate: timestamp("requested_ship_date"),
  shippingMethod: text("shipping_method"),
  trackingNumber: text("tracking_number"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  tax: decimal("tax", { precision: 12, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull().default("0"),
  internalNotes: text("internal_notes"),
  customerNotes: text("customer_notes"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address"),
  deliveryMethod: text("delivery_method"),
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status").default("unpaid"), // unpaid, paid
  sourceEmailId: varchar("source_email_id", { length: 36 }).references(() => emails.id),
  puraxSyncStatus: text("purax_sync_status").default("not_sent"), // not_sent, sent, failed
  puraxSyncedAt: timestamp("purax_synced_at"),
  puraxOrderId: text("purax_order_id"),
  shopifyOrderId: text("shopify_order_id"),
  shopifyOrderNumber: text("shopify_order_number"),
  shopifyFulfillmentId: text("shopify_fulfillment_id"),
  xeroInvoiceId: text("xero_invoice_id"),
  xeroInvoiceStatus: text("xero_invoice_status"), // DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
  xeroOnlineUrl: text("xero_online_url"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("orders_company_idx").on(table.companyId),
  index("orders_status_idx").on(table.status),
  index("orders_order_date_idx").on(table.orderDate),
  index("orders_order_number_idx").on(table.orderNumber),
]);

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// ============ ORDER LINES ============
export const orderLines = pgTable("order_lines", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).references(() => products.id),
  descriptionOverride: text("description_override"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  lineTotal: decimal("line_total", { precision: 12, scale: 2 }).notNull(),
});

export const insertOrderLineSchema = createInsertSchema(orderLines).omit({ id: true });
export type InsertOrderLine = z.infer<typeof insertOrderLineSchema>;
export type OrderLine = typeof orderLines.$inferSelect;

// ============ INVOICES ============
export const invoices = pgTable("invoices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  invoiceNumber: text("invoice_number").notNull(),
  orderId: varchar("order_id", { length: 36 }).references(() => orders.id),
  companyId: varchar("company_id", { length: 36 }).notNull().references(() => companies.id),
  status: text("status").notNull().default("draft"), // draft, sent, paid, overdue, void
  issueDate: timestamp("issue_date").notNull().defaultNow(),
  dueDate: timestamp("due_date"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  tax: decimal("tax", { precision: 12, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull().default("0"),
  balanceDue: decimal("balance_due", { precision: 12, scale: 2 }).notNull().default("0"),
  xeroInvoiceId: text("xero_invoice_id"),
  xeroOnlineUrl: text("xero_online_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("invoices_company_idx").on(table.companyId),
  index("invoices_status_idx").on(table.status),
  index("invoices_order_idx").on(table.orderId),
]);

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// ============ ATTACHMENTS ============
export const attachments = pgTable("attachments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // company, contact, deal, quote, order, invoice
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedBy: varchar("uploaded_by", { length: 36 }).references(() => users.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  description: text("description"),
}, (table) => [
  index("attachments_entity_idx").on(table.entityType, table.entityId),
]);

export const insertAttachmentSchema = createInsertSchema(attachments).omit({ id: true, uploadedAt: true });
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachments.$inferSelect;

// ============ ACTIVITY TIMELINE ============
export const activities = pgTable("activities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // company, contact, deal, quote, order, invoice
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  activityType: text("activity_type").notNull(), // note, email, call, status_change, file_upload, system
  content: text("content").notNull(),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("activities_entity_idx").on(table.entityType, table.entityId),
  index("activities_created_at_idx").on(table.createdAt),
]);

export const insertActivitySchema = createInsertSchema(activities).omit({ id: true, createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

// ============ AUDIT LOG ============
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  action: text("action").notNull(), // create, update, delete, restore, login
  entityType: text("entity_type"),
  entityId: varchar("entity_id", { length: 36 }),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => [
  index("audit_logs_user_idx").on(table.userId),
  index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  index("audit_logs_timestamp_idx").on(table.timestamp),
]);

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============ SESSIONS (for authentication) ============
export const sessions = pgTable("sessions", {
  sid: varchar("sid", { length: 255 }).primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
}, (table) => [
  index("sessions_expire_idx").on(table.expire),
]);

// ============ XERO TOKENS ============
export const xeroTokens = pgTable("xero_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull(),
  tenantName: text("tenant_name"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  crmTenantId: varchar("crm_tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertXeroTokenSchema = createInsertSchema(xeroTokens).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertXeroToken = z.infer<typeof insertXeroTokenSchema>;
export type XeroToken = typeof xeroTokens.$inferSelect;

// ============ XERO SYNC MAPPING ============
export const xeroSyncMapping = pgTable("xero_sync_mapping", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // company, contact, invoice
  localId: varchar("local_id", { length: 36 }).notNull(),
  xeroId: text("xero_id").notNull(),
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
}, (table) => [
  index("xero_sync_entity_idx").on(table.entityType, table.localId),
  index("xero_sync_xero_idx").on(table.xeroId),
]);

export const insertXeroSyncMappingSchema = createInsertSchema(xeroSyncMapping).omit({ id: true, lastSyncedAt: true });
export type InsertXeroSyncMapping = z.infer<typeof insertXeroSyncMappingSchema>;
export type XeroSyncMapping = typeof xeroSyncMapping.$inferSelect;

// ============ OUTLOOK TOKENS ============
export const outlookTokens = pgTable("outlook_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  emailAddress: text("email_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("outlook_tokens_user_idx").on(table.userId),
]);

export const insertOutlookTokenSchema = createInsertSchema(outlookTokens).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOutlookToken = z.infer<typeof insertOutlookTokenSchema>;
export type OutlookToken = typeof outlookTokens.$inferSelect;

// ============ EMAILS (cached from Outlook) ============
export const emails = pgTable("emails", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  outlookMessageId: text("outlook_message_id").notNull().unique(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  fromAddress: text("from_address").notNull(),
  fromName: text("from_name"),
  toAddresses: text("to_addresses").array(),
  ccAddresses: text("cc_addresses").array(),
  subject: text("subject"),
  bodyPreview: text("body_preview"),
  bodyHtml: text("body_html"),
  isRead: boolean("is_read").notNull().default(false),
  isDraft: boolean("is_draft").notNull().default(false),
  isConverted: boolean("is_converted").notNull().default(false),
  isReviewed: boolean("is_reviewed").notNull().default(false),
  sentAt: timestamp("sent_at"),
  receivedAt: timestamp("received_at"),
  folder: text("folder").default("inbox"), // inbox, sent, drafts
  companyId: varchar("company_id", { length: 36 }).references(() => companies.id),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("emails_user_idx").on(table.userId),
  index("emails_outlook_id_idx").on(table.outlookMessageId),
  index("emails_company_idx").on(table.companyId),
  index("emails_contact_idx").on(table.contactId),
  index("emails_received_idx").on(table.receivedAt),
]);

export const insertEmailSchema = createInsertSchema(emails).omit({ id: true, createdAt: true });
export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type Email = typeof emails.$inferSelect;

// ============ CUSTOMER ORDER REQUESTS (PUBLIC FORM SUBMISSIONS) ============
export const customerOrderRequests = pgTable("customer_order_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  shippingAddress: text("shipping_address"),
  customerNotes: text("customer_notes"),
  items: jsonb("items").notNull(), // Array of { productId, productName, sku, quantity }
  status: text("status").notNull().default("pending"), // pending, reviewed, converted, rejected
  convertedOrderId: varchar("converted_order_id", { length: 36 }).references(() => orders.id),
  reviewedBy: varchar("reviewed_by", { length: 36 }).references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  shopifyOrderId: text("shopify_order_id"),
  shopifyOrderNumber: text("shopify_order_number"),
  paymentStatus: text("payment_status"),
  subtotal: text("subtotal"),
  totalAmount: text("total_amount"),
}, (table) => [
  index("customer_order_requests_status_idx").on(table.status),
  index("customer_order_requests_created_idx").on(table.createdAt),
]);

export const insertCustomerOrderRequestSchema = createInsertSchema(customerOrderRequests).omit({ id: true, createdAt: true, reviewedAt: true });
export type InsertCustomerOrderRequest = z.infer<typeof insertCustomerOrderRequestSchema>;
export type CustomerOrderRequest = typeof customerOrderRequests.$inferSelect;

// ============ CRM SETTINGS ============
export const crmSettings = pgTable("crm_settings", {
  key: text("key").notNull(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.key, table.tenantId] }),
]);

export type CrmSetting = typeof crmSettings.$inferSelect;

// ============ AI AGENT CONVERSATIONS ============
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

// ============ FORMS ============
export const forms = pgTable("forms", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  fields: jsonb("fields").notNull().default([]),
  submitButtonText: text("submit_button_text").default("Submit"),
  successMessage: text("success_message").default("Thank you for your submission!"),
  notifyEmails: text("notify_emails").array(),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFormSchema = createInsertSchema(forms).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertForm = z.infer<typeof insertFormSchema>;
export type Form = typeof forms.$inferSelect;

export const formSubmissions = pgTable("form_submissions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  formId: varchar("form_id", { length: 36 }).notNull().references(() => forms.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull().default({}),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id),
  companyId: varchar("company_id", { length: 36 }).references(() => companies.id),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const insertFormSubmissionSchema = createInsertSchema(formSubmissions).omit({ id: true, submittedAt: true });
export type InsertFormSubmission = z.infer<typeof insertFormSubmissionSchema>;
export type FormSubmission = typeof formSubmissions.$inferSelect;

// ============ PORTAL USERS (Customer-facing login) ============
export const portalUsers = pgTable("portal_users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  companyId: varchar("company_id", { length: 36 }).notNull().references(() => companies.id),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLogin: timestamp("last_login"),
  notes: text("notes"),
  recurringItems: jsonb("recurring_items").$type<{
    productId: string;
    productName: string;
    category: string;
    filling?: string;
    weight?: string;
    unitPrice: string;
    quantity: number;
  }[]>(),
}, (table) => [
  index("portal_users_company_idx").on(table.companyId),
  index("portal_users_email_idx").on(table.email),
]);

export const insertPortalUserSchema = createInsertSchema(portalUsers).omit({ id: true, createdAt: true, lastLogin: true });
export type InsertPortalUser = z.infer<typeof insertPortalUserSchema>;
export type PortalUser = typeof portalUsers.$inferSelect;

// ============ HELPER TYPES ============
export type UserRole = "admin" | "office" | "warehouse" | "readonly";
export type CreditStatus = "active" | "on_hold";
export type DealStage = "lead" | "qualified" | "quote_sent" | "negotiation" | "won" | "lost";
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";
export type OrderStatus = "new" | "confirmed" | "in_production" | "ready" | "dispatched" | "completed" | "cancelled" | "on_hold";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type ActivityType = "note" | "email" | "call" | "status_change" | "file_upload" | "system";

// ============ COMPANY PRICES ============
export const companyPrices = pgTable("company_prices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id", { length: 36 }).notNull().references(() => companies.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("company_prices_company_idx").on(table.companyId),
  index("company_prices_product_idx").on(table.productId),
]);

export const insertCompanyPriceSchema = createInsertSchema(companyPrices).omit({ id: true, updatedAt: true });
export type InsertCompanyPrice = z.infer<typeof insertCompanyPriceSchema>;
export type CompanyPrice = typeof companyPrices.$inferSelect;

// ============ COMPANY VARIANT PRICES ============
export const companyVariantPrices = pgTable("company_variant_prices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id", { length: 36 }).notNull().references(() => companies.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  filling: text("filling").notNull(),
  weight: text("weight"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("company_variant_prices_company_idx").on(table.companyId),
  index("company_variant_prices_product_idx").on(table.productId),
  index("company_variant_prices_lookup_idx").on(table.companyId, table.productId, table.filling, table.weight),
]);

export const insertCompanyVariantPriceSchema = createInsertSchema(companyVariantPrices).omit({ id: true, updatedAt: true });
export type InsertCompanyVariantPrice = z.infer<typeof insertCompanyVariantPriceSchema>;
export type CompanyVariantPrice = typeof companyVariantPrices.$inferSelect;

// ============ DEFAULT VARIANT PRICES (product-level, not company-specific) ============
export const defaultVariantPrices = pgTable("default_variant_prices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  filling: text("filling").notNull(),
  weight: text("weight"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("default_variant_prices_product_idx").on(table.productId),
  index("default_variant_prices_lookup_idx").on(table.productId, table.filling, table.weight),
]);

export const insertDefaultVariantPriceSchema = createInsertSchema(defaultVariantPrices).omit({ id: true, updatedAt: true });
export type InsertDefaultVariantPrice = z.infer<typeof insertDefaultVariantPriceSchema>;
export type DefaultVariantPrice = typeof defaultVariantPrices.$inferSelect;

// ============ PRICE LISTS ============
export const priceLists = pgTable("price_lists", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().default(PURAX_TENANT_ID),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPriceListSchema = createInsertSchema(priceLists).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPriceList = z.infer<typeof insertPriceListSchema>;
export type PriceList = typeof priceLists.$inferSelect;

export const priceListPrices = pgTable("price_list_prices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  priceListId: varchar("price_list_id", { length: 36 }).notNull().references(() => priceLists.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  sku: text("sku"),
  filling: text("filling"),
  weight: text("weight"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("price_list_prices_list_idx").on(table.priceListId),
  index("price_list_prices_product_idx").on(table.priceListId, table.productId),
  index("price_list_prices_variant_idx").on(table.priceListId, table.productId, table.filling, table.weight),
]);

export const insertPriceListPriceSchema = createInsertSchema(priceListPrices).omit({ id: true, updatedAt: true });
export type InsertPriceListPrice = z.infer<typeof insertPriceListPriceSchema>;
export type PriceListPrice = typeof priceListPrices.$inferSelect;

// Additional price lists per company (supplements the main price_list_id)
export const companyAdditionalPriceLists = pgTable("company_additional_price_lists", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id", { length: 36 }).notNull().references(() => companies.id, { onDelete: "cascade" }),
  priceListId: varchar("price_list_id", { length: 36 }).notNull().references(() => priceLists.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============ CRM TASKS ============
export const crmTasks = pgTable("crm_tasks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  dueDate: timestamp("due_date"),
  assignedTo: varchar("assigned_to", { length: 36 }).references(() => users.id),
  companyId: varchar("company_id", { length: 36 }).references(() => companies.id),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id),
  dealId: varchar("deal_id", { length: 36 }).references(() => deals.id),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCrmTaskSchema = createInsertSchema(crmTasks).omit({ id: true, createdAt: true });
export type InsertCrmTask = z.infer<typeof insertCrmTaskSchema>;
export type CrmTask = typeof crmTasks.$inferSelect;

// ============ CRM TICKETS ============
export const crmTickets = pgTable("crm_tickets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: text("ticket_number").notNull(),
  subject: text("subject").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("medium"),
  category: text("category").default("general"),
  companyId: varchar("company_id", { length: 36 }).references(() => companies.id),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id),
  assignedTo: varchar("assigned_to", { length: 36 }).references(() => users.id),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCrmTicketSchema = createInsertSchema(crmTickets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrmTicket = z.infer<typeof insertCrmTicketSchema>;
export type CrmTicket = typeof crmTickets.$inferSelect;

// ============ CRM CALLS ============
export const crmCalls = pgTable("crm_calls", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  direction: text("direction").notNull().default("outbound"),
  status: text("status").notNull().default("completed"),
  companyId: varchar("company_id", { length: 36 }).references(() => companies.id),
  contactId: varchar("contact_id", { length: 36 }).references(() => contacts.id),
  dealId: varchar("deal_id", { length: 36 }).references(() => deals.id),
  duration: integer("duration"),
  notes: text("notes"),
  outcome: text("outcome"),
  calledBy: varchar("called_by", { length: 36 }).references(() => users.id),
  calledAt: timestamp("called_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCrmCallSchema = createInsertSchema(crmCalls).omit({ id: true, createdAt: true });
export type InsertCrmCall = z.infer<typeof insertCrmCallSchema>;
export type CrmCall = typeof crmCalls.$inferSelect;

// ============ CRM MESSAGE TEMPLATES ============
export const crmMessageTemplates = pgTable("crm_message_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  category: text("category").default("general"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCrmMessageTemplateSchema = createInsertSchema(crmMessageTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrmMessageTemplate = z.infer<typeof insertCrmMessageTemplateSchema>;
export type CrmMessageTemplate = typeof crmMessageTemplates.$inferSelect;

// ============ CRM SNIPPETS ============
export const crmSnippets = pgTable("crm_snippets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  shortcut: text("shortcut").notNull(),
  content: text("content").notNull(),
  category: text("category").default("general"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCrmSnippetSchema = createInsertSchema(crmSnippets).omit({ id: true, createdAt: true });
export type InsertCrmSnippet = z.infer<typeof insertCrmSnippetSchema>;
export type CrmSnippet = typeof crmSnippets.$inferSelect;

// ============ VALIDATION SCHEMAS ============
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type DateRange = z.infer<typeof dateRangeSchema>;
