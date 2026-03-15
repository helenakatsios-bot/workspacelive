import { db } from "./db";
import { eq, and, gte, lte, desc, ilike, or, sql } from "drizzle-orm";
import {
  users, companies, contacts, deals, products, quotes, quoteLines,
  orders, orderLines, invoices, attachments, activities, auditLogs,
  customerOrderRequests, crmSettings, forms, formSubmissions, companyPrices,
  type User, type InsertUser, type Company, type InsertCompany,
  type Contact, type InsertContact, type Deal, type InsertDeal,
  type Product, type InsertProduct, type Quote, type InsertQuote,
  type QuoteLine, type InsertQuoteLine, type Order, type InsertOrder,
  type OrderLine, type InsertOrderLine, type Invoice, type InsertInvoice,
  type Attachment, type InsertAttachment, type Activity, type InsertActivity,
  type AuditLog, type InsertAuditLog,
  type CustomerOrderRequest, type InsertCustomerOrderRequest, type CrmSetting,
  type Form, type InsertForm, type FormSubmission, type InsertFormSubmission,
  type CompanyPrice, type InsertCompanyPrice,
  defaultVariantPrices, type DefaultVariantPrice,
  priceLists, type PriceList, type InsertPriceList,
  priceListPrices, type PriceListPrice, type InsertPriceListPrice
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getAllUsers(): Promise<User[]>;

  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  getAllCompanies(): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<boolean>;
  getCompanyRelatedCounts(id: string): Promise<{ contacts: number; deals: number; orders: number; quotes: number; invoices: number }>;

  // Contacts
  getContact(id: string): Promise<Contact | undefined>;
  getAllContacts(): Promise<Contact[]>;
  getContactsByCompany(companyId: string): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;

  // Deals
  getDeal(id: string): Promise<Deal | undefined>;
  getAllDeals(): Promise<Deal[]>;
  getDealsByCompany(companyId: string): Promise<Deal[]>;
  createDeal(deal: InsertDeal): Promise<Deal>;
  updateDeal(id: string, data: Partial<InsertDeal>): Promise<Deal | undefined>;

  // Products
  getProduct(id: string): Promise<Product | undefined>;
  getAllProducts(): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  getDefaultVariantPricesByProductId(productId: string): Promise<DefaultVariantPrice[]>;
  getAllDefaultVariantPrices(): Promise<DefaultVariantPrice[]>;

  // Price Lists
  getAllPriceLists(): Promise<PriceList[]>;
  getPriceList(id: string): Promise<PriceList | undefined>;
  createPriceList(data: InsertPriceList): Promise<PriceList>;
  updatePriceList(id: string, data: Partial<InsertPriceList>): Promise<PriceList | undefined>;
  deletePriceList(id: string): Promise<boolean>;
  getPriceListPrices(priceListId: string, productId: string): Promise<PriceListPrice[]>;
  upsertPriceListPrice(data: InsertPriceListPrice): Promise<PriceListPrice>;
  deletePriceListPrice(id: string): Promise<boolean>;
  bulkUpsertPriceListPrices(prices: InsertPriceListPrice[]): Promise<PriceListPrice[]>;

  // Quotes
  getQuote(id: string): Promise<Quote | undefined>;
  getAllQuotes(): Promise<Quote[]>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: string, data: Partial<InsertQuote>): Promise<Quote | undefined>;

  // Quote Lines
  getQuoteLines(quoteId: string): Promise<QuoteLine[]>;
  createQuoteLine(line: InsertQuoteLine): Promise<QuoteLine>;

  // Orders
  getOrder(id: string): Promise<Order | undefined>;
  getAllOrders(): Promise<Order[]>;
  getOrdersByCompany(companyId: string): Promise<Order[]>;
  getOrdersByDateRange(startDate: Date, endDate: Date): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order | undefined>;

  // Order Lines
  getOrderLines(orderId: string): Promise<OrderLine[]>;
  createOrderLine(line: InsertOrderLine): Promise<OrderLine>;
  updateOrderLine(id: string, data: Partial<InsertOrderLine>): Promise<OrderLine | undefined>;
  deleteOrderLine(id: string): Promise<boolean>;
  deleteOrderLinesByOrderId(orderId: string): Promise<void>;

  // Invoices
  getInvoice(id: string): Promise<Invoice | undefined>;
  getAllInvoices(): Promise<Invoice[]>;
  getCompanyInvoices(companyId: string): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;

  // Attachments
  getAttachment(id: string): Promise<Attachment | undefined>;
  getAttachmentsByEntity(entityType: string, entityId: string): Promise<Attachment[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;

  // Activities
  getActivitiesByEntity(entityType: string, entityId: string): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;

  // Audit Logs
  getAuditLogs(limit?: number): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  // Reports
  getCompaniesWithOrdersInDateRange(startDate: Date, endDate: Date): Promise<Company[]>;

  // Customer Order Requests
  getCustomerOrderRequest(id: string): Promise<CustomerOrderRequest | undefined>;
  getAllCustomerOrderRequests(): Promise<CustomerOrderRequest[]>;
  createCustomerOrderRequest(request: InsertCustomerOrderRequest): Promise<CustomerOrderRequest>;
  updateCustomerOrderRequest(id: string, data: Partial<InsertCustomerOrderRequest>): Promise<CustomerOrderRequest | undefined>;
  deleteCustomerOrderRequest(id: string): Promise<boolean>;

  // Orders - delete
  deleteOrder(id: string): Promise<boolean>;

  // CRM Settings
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;

  // Public
  getActiveProducts(): Promise<Product[]>;

  // Forms
  getForm(id: string): Promise<Form | undefined>;
  getAllForms(): Promise<Form[]>;
  createForm(form: InsertForm): Promise<Form>;
  updateForm(id: string, data: Partial<InsertForm>): Promise<Form | undefined>;
  deleteForm(id: string): Promise<boolean>;

  // Form Submissions
  getFormSubmission(id: string): Promise<FormSubmission | undefined>;
  getFormSubmissions(formId: string): Promise<FormSubmission[]>;
  createFormSubmission(submission: InsertFormSubmission): Promise<FormSubmission>;
  deleteFormSubmission(id: string): Promise<boolean>;

  // Company Prices
  getCompanyPrices(companyId: string): Promise<CompanyPrice[]>;
  setCompanyPrice(companyId: string, productId: string, unitPrice: string): Promise<CompanyPrice>;
  deleteCompanyPrice(companyId: string, productId: string): Promise<boolean>;
  deleteAllCompanyPrices(companyId: string): Promise<number>;

  // Dashboard Stats
  getDashboardStats(): Promise<{
    totalCompanies: number;
    totalContacts: number;
    totalOrders: number;
    totalRevenue: number;
    pendingOrders: number;
    activeDeals: number;
    companiesOnHold: number;
    recentOrders: Order[];
    recentCompanies: Company[];
    dealsByStage: Record<string, number>;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(ilike(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    await db.delete(auditLogs).where(eq(auditLogs.userId, id));
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.name);
  }

  // Companies
  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async getAllCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [created] = await db.insert(companies).values({
      ...company,
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [updated] = await db.update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return updated;
  }

  async getCompanyRelatedCounts(id: string): Promise<{ contacts: number; deals: number; orders: number; quotes: number; invoices: number }> {
    const [contactCount] = await db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(eq(contacts.companyId, id));
    const [dealCount] = await db.select({ count: sql<number>`count(*)::int` }).from(deals).where(eq(deals.companyId, id));
    const [orderCount] = await db.select({ count: sql<number>`count(*)::int` }).from(orders).where(eq(orders.companyId, id));
    const [quoteCount] = await db.select({ count: sql<number>`count(*)::int` }).from(quotes).where(eq(quotes.companyId, id));
    const [invoiceCount] = await db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.companyId, id));
    return {
      contacts: contactCount?.count || 0,
      deals: dealCount?.count || 0,
      orders: orderCount?.count || 0,
      quotes: quoteCount?.count || 0,
      invoices: invoiceCount?.count || 0,
    };
  }

  async deleteCompany(id: string): Promise<boolean> {
    const [deleted] = await db.delete(companies).where(eq(companies.id, id)).returning();
    return !!deleted;
  }

  // Contacts
  async getContact(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async getAllContacts(): Promise<Contact[]> {
    return db.select().from(contacts).orderBy(contacts.firstName);
  }

  async getContactsByCompany(companyId: string): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.companyId, companyId)).orderBy(contacts.firstName);
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [created] = await db.insert(contacts).values(contact).returning();
    return created;
  }

  async updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db.update(contacts).set(data).where(eq(contacts.id, id)).returning();
    return updated;
  }

  async deleteContact(id: string): Promise<boolean> {
    // Nullify all foreign key references to this contact before deleting
    await db.execute(sql`UPDATE deals SET contact_id = NULL WHERE contact_id = ${id}`);
    await db.execute(sql`UPDATE quotes SET contact_id = NULL WHERE contact_id = ${id}`);
    await db.execute(sql`UPDATE orders SET contact_id = NULL WHERE contact_id = ${id}`);
    await db.execute(sql`UPDATE emails SET contact_id = NULL WHERE contact_id = ${id}`);
    await db.execute(sql`UPDATE form_submissions SET contact_id = NULL WHERE contact_id = ${id}`);
    await db.execute(sql`UPDATE portal_users SET contact_id = NULL WHERE contact_id = ${id}`);
    await db.execute(sql`UPDATE crm_tasks SET contact_id = NULL WHERE contact_id = ${id}`);
    await db.execute(sql`UPDATE crm_tickets SET contact_id = NULL WHERE contact_id = ${id}`);
    await db.execute(sql`UPDATE crm_calls SET contact_id = NULL WHERE contact_id = ${id}`);
    const [deleted] = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    return !!deleted;
  }

  // Deals
  async getDeal(id: string): Promise<Deal | undefined> {
    const [deal] = await db.select().from(deals).where(eq(deals.id, id));
    return deal;
  }

  async getAllDeals(): Promise<Deal[]> {
    return db.select().from(deals).orderBy(desc(deals.createdAt));
  }

  async getDealsByCompany(companyId: string): Promise<Deal[]> {
    return db.select().from(deals).where(eq(deals.companyId, companyId)).orderBy(desc(deals.createdAt));
  }

  async createDeal(deal: InsertDeal): Promise<Deal> {
    const [created] = await db.insert(deals).values({
      ...deal,
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateDeal(id: string, data: Partial<InsertDeal>): Promise<Deal | undefined> {
    const [updated] = await db.update(deals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(deals.id, id))
      .returning();
    return updated;
  }

  // Products
  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getAllProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(products.name);
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const [deleted] = await db.delete(products).where(eq(products.id, id)).returning();
    return !!deleted;
  }

  async getDefaultVariantPricesByProductId(productId: string): Promise<DefaultVariantPrice[]> {
    return db.select().from(defaultVariantPrices)
      .where(eq(defaultVariantPrices.productId, productId))
      .orderBy(defaultVariantPrices.filling, defaultVariantPrices.weight);
  }

  async getAllDefaultVariantPrices(): Promise<DefaultVariantPrice[]> {
    return db.select().from(defaultVariantPrices)
      .orderBy(defaultVariantPrices.productId, defaultVariantPrices.filling, defaultVariantPrices.weight);
  }

  // Price Lists
  async getAllPriceLists(): Promise<PriceList[]> {
    return db.select().from(priceLists).orderBy(desc(priceLists.isDefault), priceLists.name);
  }

  async getPriceList(id: string): Promise<PriceList | undefined> {
    const [pl] = await db.select().from(priceLists).where(eq(priceLists.id, id));
    return pl;
  }

  async createPriceList(data: InsertPriceList): Promise<PriceList> {
    if (data.isDefault) {
      await db.update(priceLists).set({ isDefault: false }).where(eq(priceLists.isDefault, true));
    }
    const [created] = await db.insert(priceLists).values(data).returning();
    return created;
  }

  async updatePriceList(id: string, data: Partial<InsertPriceList>): Promise<PriceList | undefined> {
    if (data.isDefault) {
      await db.update(priceLists).set({ isDefault: false }).where(eq(priceLists.isDefault, true));
    }
    const [updated] = await db.update(priceLists).set({ ...data, updatedAt: new Date() }).where(eq(priceLists.id, id)).returning();
    return updated;
  }

  async deletePriceList(id: string): Promise<boolean> {
    const [pl] = await db.select().from(priceLists).where(eq(priceLists.id, id));
    if (pl?.isDefault) return false;
    await db.delete(priceListPrices).where(eq(priceListPrices.priceListId, id));
    await db.update(companies).set({ priceListId: null }).where(eq(companies.priceListId, id));
    const result = await db.delete(priceLists).where(eq(priceLists.id, id)).returning();
    return result.length > 0;
  }

  async getPriceListPrices(priceListId: string, productId: string): Promise<PriceListPrice[]> {
    return db.select().from(priceListPrices)
      .where(and(eq(priceListPrices.priceListId, priceListId), eq(priceListPrices.productId, productId)))
      .orderBy(priceListPrices.filling, priceListPrices.weight);
  }

  async upsertPriceListPrice(data: InsertPriceListPrice): Promise<PriceListPrice> {
    const existing = await db.select().from(priceListPrices).where(
      and(
        eq(priceListPrices.priceListId, data.priceListId),
        eq(priceListPrices.productId, data.productId),
        data.filling ? eq(priceListPrices.filling, data.filling) : sql`${priceListPrices.filling} IS NULL`,
        data.weight ? eq(priceListPrices.weight, data.weight) : sql`${priceListPrices.weight} IS NULL`
      )
    );
    if (existing.length > 0) {
      const [updated] = await db.update(priceListPrices)
        .set({ unitPrice: data.unitPrice, updatedAt: new Date() })
        .where(eq(priceListPrices.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(priceListPrices).values(data).returning();
    return created;
  }

  async deletePriceListPrice(id: string): Promise<boolean> {
    const result = await db.delete(priceListPrices).where(eq(priceListPrices.id, id)).returning();
    return result.length > 0;
  }

  async bulkUpsertPriceListPrices(prices: InsertPriceListPrice[]): Promise<PriceListPrice[]> {
    const results: PriceListPrice[] = [];
    for (const price of prices) {
      const result = await this.upsertPriceListPrice(price);
      results.push(result);
    }
    return results;
  }

  // Quotes
  async getQuote(id: string): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    return quote;
  }

  async getAllQuotes(): Promise<Quote[]> {
    return db.select().from(quotes).orderBy(desc(quotes.createdAt));
  }

  async createQuote(quote: InsertQuote): Promise<Quote> {
    const [created] = await db.insert(quotes).values(quote).returning();
    return created;
  }

  async updateQuote(id: string, data: Partial<InsertQuote>): Promise<Quote | undefined> {
    const [updated] = await db.update(quotes).set(data).where(eq(quotes.id, id)).returning();
    return updated;
  }

  // Quote Lines
  async getQuoteLines(quoteId: string): Promise<QuoteLine[]> {
    return db.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId));
  }

  async createQuoteLine(line: InsertQuoteLine): Promise<QuoteLine> {
    const [created] = await db.insert(quoteLines).values(line).returning();
    return created;
  }

  // Orders
  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getAllOrders(): Promise<Order[]> {
    return db.select().from(orders).orderBy(desc(orders.orderDate));
  }

  async getOrdersByCompany(companyId: string): Promise<Order[]> {
    const { pool } = await import("./db");
    const result = await pool.query(`
      SELECT o.*, COALESCE(o.customer_name, c.first_name || ' ' || c.last_name, c.first_name, c.last_name) AS customer_name
      FROM orders o
      LEFT JOIN contacts c ON c.id = o.contact_id
      WHERE o.company_id = $1
      ORDER BY o.order_date DESC
    `, [companyId]);
    return result.rows.map((row: any) => ({
      id: row.id,
      orderNumber: row.order_number,
      companyId: row.company_id,
      contactId: row.contact_id,
      orderDate: row.order_date,
      status: row.status,
      items: row.items,
      subtotal: row.subtotal,
      total: row.total,
      notes: row.notes,
      customerName: row.customer_name?.trim() || null,
      deliveryAddress: row.delivery_address,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pdfPath: row.pdf_path,
      puraxSyncStatus: row.purax_sync_status,
      puraxOrderId: row.purax_order_id,
      miloOrderId: row.milo_order_id,
      shopifyOrderId: row.shopify_order_id,
      shopifyOrderNumber: row.shopify_order_number,
      shopifyFulfillmentId: row.shopify_fulfillment_id,
      tenantId: row.tenant_id,
    })) as Order[];
  }

  async getOrdersByDateRange(startDate: Date, endDate: Date): Promise<Order[]> {
    return db.select().from(orders)
      .where(and(
        gte(orders.orderDate, startDate),
        lte(orders.orderDate, endDate)
      ))
      .orderBy(desc(orders.orderDate));
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [created] = await db.insert(orders).values({
      ...order,
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateOrder(id: string, data: Partial<InsertOrder>): Promise<Order | undefined> {
    const [updated] = await db.update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  // Order Lines
  async getOrderLines(orderId: string): Promise<OrderLine[]> {
    return db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  }

  async createOrderLine(line: InsertOrderLine): Promise<OrderLine> {
    const [created] = await db.insert(orderLines).values(line).returning();
    return created;
  }

  async updateOrderLine(id: string, data: Partial<InsertOrderLine>): Promise<OrderLine | undefined> {
    const [updated] = await db.update(orderLines).set(data).where(eq(orderLines.id, id)).returning();
    return updated;
  }

  async deleteOrderLine(id: string): Promise<boolean> {
    const result = await db.delete(orderLines).where(eq(orderLines.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteOrderLinesByOrderId(orderId: string): Promise<void> {
    await db.delete(orderLines).where(eq(orderLines.orderId, orderId));
  }

  // Invoices
  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getAllInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async getCompanyInvoices(companyId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.companyId, companyId)).orderBy(desc(invoices.createdAt));
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [updated] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return updated;
  }

  // Attachments
  async getAttachment(id: string): Promise<Attachment | undefined> {
    const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id));
    return attachment;
  }

  async getAttachmentsByEntity(entityType: string, entityId: string): Promise<Attachment[]> {
    return db.select().from(attachments)
      .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)))
      .orderBy(desc(attachments.uploadedAt));
  }

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    const [created] = await db.insert(attachments).values(attachment).returning();
    return created;
  }

  // Activities
  async getActivitiesByEntity(entityType: string, entityId: string): Promise<Activity[]> {
    return db.select().from(activities)
      .where(and(eq(activities.entityType, entityType), eq(activities.entityId, entityId)))
      .orderBy(desc(activities.createdAt));
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const [created] = await db.insert(activities).values(activity).returning();
    return created;
  }

  // Audit Logs
  async getAuditLogs(limit: number = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(limit);
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  // Reports
  async getCompaniesWithOrdersInDateRange(startDate: Date, endDate: Date): Promise<Company[]> {
    const ordersInRange = await db.select({ companyId: orders.companyId })
      .from(orders)
      .where(and(
        gte(orders.orderDate, startDate),
        lte(orders.orderDate, endDate)
      ));
    
    const uniqueCompanyIds = [...new Set(ordersInRange.map(o => o.companyId))];
    
    if (uniqueCompanyIds.length === 0) return [];
    
    // Use inArray instead of SQL ANY for proper array handling
    const result = await db.select().from(companies)
      .where(sql`${companies.id} IN (${sql.join(uniqueCompanyIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(companies.tradingName);
    
    return result;
  }

  // Customer Order Requests
  async getCustomerOrderRequest(id: string): Promise<CustomerOrderRequest | undefined> {
    const [request] = await db.select().from(customerOrderRequests).where(eq(customerOrderRequests.id, id));
    return request;
  }

  async getAllCustomerOrderRequests(): Promise<CustomerOrderRequest[]> {
    return db.select().from(customerOrderRequests).orderBy(desc(customerOrderRequests.createdAt));
  }

  async createCustomerOrderRequest(request: InsertCustomerOrderRequest): Promise<CustomerOrderRequest> {
    const [created] = await db.insert(customerOrderRequests).values(request).returning();
    return created;
  }

  async updateCustomerOrderRequest(id: string, data: Partial<InsertCustomerOrderRequest>): Promise<CustomerOrderRequest | undefined> {
    const [updated] = await db.update(customerOrderRequests)
      .set(data)
      .where(eq(customerOrderRequests.id, id))
      .returning();
    return updated;
  }

  async deleteCustomerOrderRequest(id: string): Promise<boolean> {
    const result = await db.delete(customerOrderRequests).where(eq(customerOrderRequests.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteOrder(id: string): Promise<boolean> {
    await db.delete(orderLines).where(eq(orderLines.orderId, id));
    await db.update(invoices).set({ orderId: null }).where(eq(invoices.orderId, id));
    await db.update(customerOrderRequests).set({ convertedOrderId: null }).where(eq(customerOrderRequests.convertedOrderId, id));
    const result = await db.delete(orders).where(eq(orders.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // CRM Settings
  async getSetting(key: string): Promise<string | undefined> {
    const [setting] = await db.select().from(crmSettings).where(eq(crmSettings.key, key));
    return setting?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db.insert(crmSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: crmSettings.key, set: { value, updatedAt: new Date() } });
  }

  // Public
  async getActiveProducts(): Promise<Product[]> {
    return db.select().from(products).where(eq(products.active, true)).orderBy(products.category, products.name);
  }

  // Dashboard Stats
  async getDashboardStats() {
    const [companiesResult] = await db.select({ count: sql<number>`count(*)` }).from(companies);
    const [contactsResult] = await db.select({ count: sql<number>`count(*)` }).from(contacts);
    const [ordersResult] = await db.select({ count: sql<number>`count(*)` }).from(orders);
    
    const [revenueResult] = await db.select({ 
      total: sql<number>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)` 
    }).from(orders).where(eq(orders.status, "completed"));
    
    const [pendingResult] = await db.select({ count: sql<number>`count(*)` }).from(orders)
      .where(or(eq(orders.status, "new"), eq(orders.status, "confirmed"), eq(orders.status, "in_production")));
    
    const [dealsResult] = await db.select({ count: sql<number>`count(*)` }).from(deals)
      .where(or(eq(deals.pipelineStage, "lead"), eq(deals.pipelineStage, "qualified"), eq(deals.pipelineStage, "quote_sent"), eq(deals.pipelineStage, "negotiation")));
    
    const [onHoldResult] = await db.select({ count: sql<number>`count(*)` }).from(companies)
      .where(eq(companies.creditStatus, "on_hold"));

    const recentOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(5);
    const recentCompanies = await db.select().from(companies).orderBy(desc(companies.createdAt)).limit(5);

    const stageResults = await db.select({
      stage: deals.pipelineStage,
      count: sql<number>`count(*)`
    }).from(deals).groupBy(deals.pipelineStage);

    const dealsByStage: Record<string, number> = {};
    stageResults.forEach(r => {
      dealsByStage[r.stage] = Number(r.count);
    });

    return {
      totalCompanies: Number(companiesResult.count),
      totalContacts: Number(contactsResult.count),
      totalOrders: Number(ordersResult.count),
      totalRevenue: Number(revenueResult.total) || 0,
      pendingOrders: Number(pendingResult.count),
      activeDeals: Number(dealsResult.count),
      companiesOnHold: Number(onHoldResult.count),
      recentOrders,
      recentCompanies,
      dealsByStage,
    };
  }

  // Forms
  async getForm(id: string): Promise<Form | undefined> {
    const [form] = await db.select().from(forms).where(eq(forms.id, id));
    return form;
  }

  async getAllForms(): Promise<Form[]> {
    return db.select().from(forms).orderBy(desc(forms.createdAt));
  }

  async createForm(form: InsertForm): Promise<Form> {
    const [created] = await db.insert(forms).values(form).returning();
    return created;
  }

  async updateForm(id: string, data: Partial<InsertForm>): Promise<Form | undefined> {
    const [updated] = await db.update(forms).set({ ...data, updatedAt: new Date() }).where(eq(forms.id, id)).returning();
    return updated;
  }

  async deleteForm(id: string): Promise<boolean> {
    const result = await db.delete(forms).where(eq(forms.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Form Submissions
  async getFormSubmission(id: string): Promise<FormSubmission | undefined> {
    const [sub] = await db.select().from(formSubmissions).where(eq(formSubmissions.id, id));
    return sub;
  }

  async getFormSubmissions(formId: string): Promise<FormSubmission[]> {
    return db.select().from(formSubmissions).where(eq(formSubmissions.formId, formId)).orderBy(desc(formSubmissions.submittedAt));
  }

  async createFormSubmission(submission: InsertFormSubmission): Promise<FormSubmission> {
    const [created] = await db.insert(formSubmissions).values(submission).returning();
    return created;
  }

  async deleteFormSubmission(id: string): Promise<boolean> {
    const result = await db.delete(formSubmissions).where(eq(formSubmissions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Company Prices
  async getCompanyPrices(companyId: string): Promise<CompanyPrice[]> {
    return db.select().from(companyPrices).where(eq(companyPrices.companyId, companyId));
  }

  async setCompanyPrice(companyId: string, productId: string, unitPrice: string): Promise<CompanyPrice> {
    const existing = await db.select().from(companyPrices)
      .where(and(eq(companyPrices.companyId, companyId), eq(companyPrices.productId, productId)));
    if (existing.length > 0) {
      const [updated] = await db.update(companyPrices)
        .set({ unitPrice, updatedAt: new Date() })
        .where(and(eq(companyPrices.companyId, companyId), eq(companyPrices.productId, productId)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(companyPrices).values({ companyId, productId, unitPrice }).returning();
    return created;
  }

  async deleteCompanyPrice(companyId: string, productId: string): Promise<boolean> {
    const result = await db.delete(companyPrices)
      .where(and(eq(companyPrices.companyId, companyId), eq(companyPrices.productId, productId)));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteAllCompanyPrices(companyId: string): Promise<number> {
    const result = await db.delete(companyPrices)
      .where(eq(companyPrices.companyId, companyId));
    return result.rowCount ?? 0;
  }
}

export const storage = new DatabaseStorage();
