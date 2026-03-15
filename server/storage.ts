import { db, pool } from "./db";
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
  priceListPrices, type PriceListPrice, type InsertPriceListPrice,
  PURAX_TENANT_ID,
  tenants, type Tenant, type InsertTenant,
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface IStorage {
  // Tenants
  getAllTenants(): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getAllUsers(tenantId?: string): Promise<User[]>;

  // Companies
  getCompany(id: string, tenantId?: string): Promise<Company | undefined>;
  getAllCompanies(tenantId?: string): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<InsertCompany>, tenantId?: string): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<boolean>;
  getCompanyRelatedCounts(id: string): Promise<{ contacts: number; deals: number; orders: number; quotes: number; invoices: number }>;

  // Contacts
  getContact(id: string): Promise<Contact | undefined>;
  getAllContacts(tenantId?: string): Promise<Contact[]>;
  getContactsByCompany(companyId: string): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;

  // Deals
  getDeal(id: string): Promise<Deal | undefined>;
  getAllDeals(tenantId?: string): Promise<Deal[]>;
  getDealsByCompany(companyId: string): Promise<Deal[]>;
  createDeal(deal: InsertDeal): Promise<Deal>;
  updateDeal(id: string, data: Partial<InsertDeal>): Promise<Deal | undefined>;

  // Products
  getProduct(id: string, tenantId?: string): Promise<Product | undefined>;
  getAllProducts(tenantId?: string): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, data: Partial<InsertProduct>, tenantId?: string): Promise<Product | undefined>;
  deleteProduct(id: string, tenantId?: string): Promise<boolean>;
  getDefaultVariantPricesByProductId(productId: string): Promise<DefaultVariantPrice[]>;
  getAllDefaultVariantPrices(tenantId?: string): Promise<DefaultVariantPrice[]>;

  // Price Lists
  getAllPriceLists(tenantId?: string): Promise<PriceList[]>;
  getPriceList(id: string): Promise<PriceList | undefined>;
  createPriceList(data: InsertPriceList): Promise<PriceList>;
  updatePriceList(id: string, data: Partial<InsertPriceList>): Promise<PriceList | undefined>;
  deletePriceList(id: string): Promise<boolean>;
  getPriceListPrices(priceListId: string, productId: string): Promise<PriceListPrice[]>;
  upsertPriceListPrice(data: InsertPriceListPrice): Promise<PriceListPrice>;
  deletePriceListPrice(id: string): Promise<boolean>;
  bulkUpsertPriceListPrices(prices: InsertPriceListPrice[]): Promise<PriceListPrice[]>;

  // Quotes
  getQuote(id: string, tenantId?: string): Promise<Quote | undefined>;
  getAllQuotes(tenantId?: string): Promise<Quote[]>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: string, data: Partial<InsertQuote>, tenantId?: string): Promise<Quote | undefined>;

  // Quote Lines
  getQuoteLines(quoteId: string): Promise<QuoteLine[]>;
  createQuoteLine(line: InsertQuoteLine): Promise<QuoteLine>;

  // Orders
  getOrder(id: string, tenantId?: string): Promise<Order | undefined>;
  getAllOrders(tenantId?: string): Promise<Order[]>;
  getOrdersByCompany(companyId: string, tenantId?: string): Promise<Order[]>;
  getOrdersByDateRange(startDate: Date, endDate: Date, tenantId?: string): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, data: Partial<InsertOrder>, tenantId?: string): Promise<Order | undefined>;

  // Order Lines
  getOrderLines(orderId: string): Promise<OrderLine[]>;
  createOrderLine(line: InsertOrderLine): Promise<OrderLine>;
  updateOrderLine(id: string, data: Partial<InsertOrderLine>): Promise<OrderLine | undefined>;
  deleteOrderLine(id: string): Promise<boolean>;
  deleteOrderLinesByOrderId(orderId: string): Promise<void>;

  // Invoices
  getInvoice(id: string, tenantId?: string): Promise<Invoice | undefined>;
  getAllInvoices(tenantId?: string): Promise<Invoice[]>;
  getCompanyInvoices(companyId: string, tenantId?: string): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<InsertInvoice>, tenantId?: string): Promise<Invoice | undefined>;

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
  getCustomerOrderRequest(id: string, tenantId?: string): Promise<CustomerOrderRequest | undefined>;
  getAllCustomerOrderRequests(tenantId?: string): Promise<CustomerOrderRequest[]>;
  createCustomerOrderRequest(request: InsertCustomerOrderRequest): Promise<CustomerOrderRequest>;
  updateCustomerOrderRequest(id: string, data: Partial<InsertCustomerOrderRequest>, tenantId?: string): Promise<CustomerOrderRequest | undefined>;
  deleteCustomerOrderRequest(id: string, tenantId?: string): Promise<boolean>;

  // Orders - delete
  deleteOrder(id: string): Promise<boolean>;

  // CRM Settings
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;

  // Public
  getActiveProducts(): Promise<Product[]>;

  // Forms
  getForm(id: string, tenantId?: string): Promise<Form | undefined>;
  getAllForms(tenantId?: string): Promise<Form[]>;
  createForm(form: InsertForm): Promise<Form>;
  updateForm(id: string, data: Partial<InsertForm>, tenantId?: string): Promise<Form | undefined>;
  deleteForm(id: string, tenantId?: string): Promise<boolean>;

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
  getDashboardStats(tenantId?: string): Promise<{
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
  // Tenants
  async getAllTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(tenants.name);
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [created] = await db.insert(tenants).values(tenant).returning();
    return created;
  }

  async updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const [updated] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
    return updated;
  }

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

  async getAllUsers(tenantId?: string): Promise<User[]> {
    if (tenantId) {
      return db.select().from(users).where(eq(users.tenantId, tenantId)).orderBy(users.name);
    }
    return db.select().from(users).orderBy(users.name);
  }

  // Companies
  async getCompany(id: string, tenantId?: string): Promise<Company | undefined> {
    const conditions = tenantId
      ? and(eq(companies.id, id), eq(companies.tenantId, tenantId))
      : eq(companies.id, id);
    const [company] = await db.select().from(companies).where(conditions);
    return company;
  }

  async getAllCompanies(tenantId?: string): Promise<Company[]> {
    if (tenantId) {
      return db.select().from(companies).where(eq(companies.tenantId, tenantId)).orderBy(desc(companies.createdAt));
    }
    return db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [created] = await db.insert(companies).values({
      ...company,
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateCompany(id: string, data: Partial<InsertCompany>, tenantId?: string): Promise<Company | undefined> {
    const conditions = tenantId
      ? and(eq(companies.id, id), eq(companies.tenantId, tenantId))
      : eq(companies.id, id);
    const [updated] = await db.update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(conditions)
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

  async getAllContacts(tenantId?: string): Promise<Contact[]> {
    if (tenantId) {
      return db.select({ contact: contacts }).from(contacts)
        .innerJoin(companies, eq(contacts.companyId, companies.id))
        .where(eq(companies.tenantId, tenantId))
        .orderBy(contacts.firstName)
        .then(rows => rows.map(r => r.contact));
    }
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
    const [deleted] = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    return !!deleted;
  }

  // Deals
  async getDeal(id: string): Promise<Deal | undefined> {
    const [deal] = await db.select().from(deals).where(eq(deals.id, id));
    return deal;
  }

  async getAllDeals(tenantId?: string): Promise<Deal[]> {
    if (tenantId) {
      return db.select({ deal: deals }).from(deals)
        .innerJoin(companies, eq(deals.companyId, companies.id))
        .where(eq(companies.tenantId, tenantId))
        .orderBy(desc(deals.createdAt))
        .then(rows => rows.map(r => r.deal));
    }
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
  async getProduct(id: string, tenantId?: string): Promise<Product | undefined> {
    const conditions = tenantId
      ? and(eq(products.id, id), eq(products.tenantId, tenantId))
      : eq(products.id, id);
    const [product] = await db.select().from(products).where(conditions);
    return product;
  }

  async getAllProducts(tenantId?: string): Promise<Product[]> {
    if (tenantId) {
      return db.select().from(products).where(eq(products.tenantId, tenantId)).orderBy(products.name);
    }
    return db.select().from(products).orderBy(products.name);
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async updateProduct(id: string, data: Partial<InsertProduct>, tenantId?: string): Promise<Product | undefined> {
    const conditions = tenantId
      ? and(eq(products.id, id), eq(products.tenantId, tenantId))
      : eq(products.id, id);
    const [updated] = await db.update(products).set(data).where(conditions).returning();
    return updated;
  }

  async deleteProduct(id: string, tenantId?: string): Promise<boolean> {
    const conditions = tenantId
      ? and(eq(products.id, id), eq(products.tenantId, tenantId))
      : eq(products.id, id);
    const [deleted] = await db.delete(products).where(conditions).returning();
    return !!deleted;
  }

  async getDefaultVariantPricesByProductId(productId: string): Promise<DefaultVariantPrice[]> {
    return db.select().from(defaultVariantPrices)
      .where(eq(defaultVariantPrices.productId, productId))
      .orderBy(defaultVariantPrices.filling, defaultVariantPrices.weight);
  }

  async getAllDefaultVariantPrices(tenantId?: string): Promise<DefaultVariantPrice[]> {
    return db.select().from(defaultVariantPrices)
      .orderBy(defaultVariantPrices.productId, defaultVariantPrices.filling, defaultVariantPrices.weight);
  }

  // Price Lists
  async getAllPriceLists(tenantId?: string): Promise<PriceList[]> {
    if (tenantId) {
      return db.select().from(priceLists).where(eq(priceLists.tenantId, tenantId)).orderBy(desc(priceLists.isDefault), priceLists.name);
    }
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
  async getQuote(id: string, tenantId?: string): Promise<Quote | undefined> {
    const conditions = tenantId
      ? and(eq(quotes.id, id), eq(quotes.tenantId, tenantId))
      : eq(quotes.id, id);
    const [quote] = await db.select().from(quotes).where(conditions);
    return quote;
  }

  async getAllQuotes(tenantId?: string): Promise<Quote[]> {
    if (tenantId) {
      return db.select().from(quotes).where(eq(quotes.tenantId, tenantId)).orderBy(desc(quotes.createdAt));
    }
    return db.select().from(quotes).orderBy(desc(quotes.createdAt));
  }

  async createQuote(quote: InsertQuote): Promise<Quote> {
    const [created] = await db.insert(quotes).values(quote).returning();
    return created;
  }

  async updateQuote(id: string, data: Partial<InsertQuote>, tenantId?: string): Promise<Quote | undefined> {
    const conditions = tenantId
      ? and(eq(quotes.id, id), eq(quotes.tenantId, tenantId))
      : eq(quotes.id, id);
    const [updated] = await db.update(quotes).set(data).where(conditions).returning();
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
  async getOrder(id: string, tenantId?: string): Promise<Order | undefined> {
    const conditions = tenantId
      ? and(eq(orders.id, id), eq(orders.tenantId, tenantId))
      : eq(orders.id, id);
    const [order] = await db.select().from(orders).where(conditions);
    return order;
  }

  async getAllOrders(tenantId?: string): Promise<Order[]> {
    if (tenantId) {
      return db.select().from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.orderDate));
    }
    return db.select().from(orders).orderBy(desc(orders.orderDate));
  }

  async getOrdersByCompany(companyId: string, tenantId?: string): Promise<Order[]> {
    const conditions = tenantId
      ? and(eq(orders.companyId, companyId), eq(orders.tenantId, tenantId))
      : eq(orders.companyId, companyId);
    return db.select().from(orders).where(conditions).orderBy(desc(orders.orderDate));
  }

  async getOrdersByDateRange(startDate: Date, endDate: Date, tenantId?: string): Promise<Order[]> {
    const dateConditions = and(
      gte(orders.orderDate, startDate),
      lte(orders.orderDate, endDate)
    );
    const conditions = tenantId
      ? and(dateConditions, eq(orders.tenantId, tenantId))
      : dateConditions;
    return db.select().from(orders)
      .where(conditions)
      .orderBy(desc(orders.orderDate));
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [created] = await db.insert(orders).values({
      ...order,
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async updateOrder(id: string, data: Partial<InsertOrder>, tenantId?: string): Promise<Order | undefined> {
    const conditions = tenantId
      ? and(eq(orders.id, id), eq(orders.tenantId, tenantId))
      : eq(orders.id, id);
    const [updated] = await db.update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(conditions)
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
  async getInvoice(id: string, tenantId?: string): Promise<Invoice | undefined> {
    const conditions = tenantId
      ? and(eq(invoices.id, id), eq(invoices.tenantId, tenantId))
      : eq(invoices.id, id);
    const [invoice] = await db.select().from(invoices).where(conditions);
    return invoice;
  }

  async getAllInvoices(tenantId?: string): Promise<Invoice[]> {
    if (tenantId) {
      return db.select().from(invoices).where(eq(invoices.tenantId, tenantId)).orderBy(desc(invoices.createdAt));
    }
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async getCompanyInvoices(companyId: string, tenantId?: string): Promise<Invoice[]> {
    const conditions = tenantId
      ? and(eq(invoices.companyId, companyId), eq(invoices.tenantId, tenantId))
      : eq(invoices.companyId, companyId);
    return db.select().from(invoices).where(conditions).orderBy(desc(invoices.createdAt));
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async updateInvoice(id: string, data: Partial<InsertInvoice>, tenantId?: string): Promise<Invoice | undefined> {
    const conditions = tenantId
      ? and(eq(invoices.id, id), eq(invoices.tenantId, tenantId))
      : eq(invoices.id, id);
    const [updated] = await db.update(invoices).set(data).where(conditions).returning();
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
  async getCustomerOrderRequest(id: string, tenantId?: string): Promise<CustomerOrderRequest | undefined> {
    const conditions = tenantId
      ? and(eq(customerOrderRequests.id, id), eq(customerOrderRequests.tenantId, tenantId))
      : eq(customerOrderRequests.id, id);
    const [request] = await db.select().from(customerOrderRequests).where(conditions);
    return request;
  }

  async getAllCustomerOrderRequests(tenantId?: string): Promise<CustomerOrderRequest[]> {
    if (tenantId) {
      return db.select().from(customerOrderRequests).where(eq(customerOrderRequests.tenantId, tenantId)).orderBy(desc(customerOrderRequests.createdAt));
    }
    return db.select().from(customerOrderRequests).orderBy(desc(customerOrderRequests.createdAt));
  }

  async createCustomerOrderRequest(request: InsertCustomerOrderRequest): Promise<CustomerOrderRequest> {
    const [created] = await db.insert(customerOrderRequests).values(request).returning();
    return created;
  }

  async updateCustomerOrderRequest(id: string, data: Partial<InsertCustomerOrderRequest>, tenantId?: string): Promise<CustomerOrderRequest | undefined> {
    const conditions = tenantId
      ? and(eq(customerOrderRequests.id, id), eq(customerOrderRequests.tenantId, tenantId))
      : eq(customerOrderRequests.id, id);
    const [updated] = await db.update(customerOrderRequests)
      .set(data)
      .where(conditions)
      .returning();
    return updated;
  }

  async deleteCustomerOrderRequest(id: string, tenantId?: string): Promise<boolean> {
    const conditions = tenantId
      ? and(eq(customerOrderRequests.id, id), eq(customerOrderRequests.tenantId, tenantId))
      : eq(customerOrderRequests.id, id);
    const result = await db.delete(customerOrderRequests).where(conditions);
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
  async getDashboardStats(tenantId?: string) {
    const tid = tenantId || null;
    const tenantClause = tid ? `AND tenant_id = '${tid}'` : "";
    const coTenantClause = tid ? `AND co.tenant_id = '${tid}'` : "";
    const cTenantClause = tid ? `AND c.tenant_id = '${tid}'` : "";

    const companiesResult = await pool.query(`SELECT COUNT(*)::int as count FROM companies WHERE 1=1 ${tenantClause}`);
    const contactsResult = await pool.query(`SELECT COUNT(*)::int as count FROM contacts ct INNER JOIN companies co ON ct.company_id = co.id WHERE 1=1 ${coTenantClause}`);
    const ordersResult = await pool.query(`SELECT COUNT(*)::int as count FROM orders WHERE 1=1 ${tenantClause}`);
    const revenueResult = await pool.query(`SELECT COALESCE(SUM(CAST(total AS DECIMAL)), 0) as total FROM orders WHERE status = 'completed' ${tenantClause}`);
    const pendingResult = await pool.query(`SELECT COUNT(*)::int as count FROM orders WHERE status IN ('new','confirmed','in_production') ${tenantClause}`);
    const dealsResult = await pool.query(`SELECT COUNT(*)::int as count FROM deals d INNER JOIN companies c ON d.company_id = c.id WHERE d.pipeline_stage IN ('lead','qualified','quote_sent','negotiation') ${cTenantClause}`);
    const onHoldResult = await pool.query(`SELECT COUNT(*)::int as count FROM companies WHERE credit_status = 'on_hold' ${tenantClause}`);
    const recentOrdersResult = await pool.query(`SELECT * FROM orders WHERE 1=1 ${tenantClause} ORDER BY created_at DESC LIMIT 5`);
    const recentCompaniesResult = await pool.query(`SELECT * FROM companies WHERE 1=1 ${tenantClause} ORDER BY created_at DESC LIMIT 5`);
    const stageResult = await pool.query(`SELECT d.pipeline_stage as stage, COUNT(*)::int as count FROM deals d INNER JOIN companies c ON d.company_id = c.id WHERE 1=1 ${cTenantClause} GROUP BY d.pipeline_stage`);

    const dealsByStage: Record<string, number> = {};
    for (const row of stageResult.rows) {
      dealsByStage[row.stage] = Number(row.count);
    }

    const toCamel = (obj: Record<string, any>) => {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        const camelKey = k.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
        result[camelKey] = v;
      }
      return result;
    };

    return {
      totalCompanies: Number(companiesResult.rows[0].count),
      totalContacts: Number(contactsResult.rows[0].count),
      totalOrders: Number(ordersResult.rows[0].count),
      totalRevenue: Number(revenueResult.rows[0].total) || 0,
      pendingOrders: Number(pendingResult.rows[0].count),
      activeDeals: Number(dealsResult.rows[0].count),
      companiesOnHold: Number(onHoldResult.rows[0].count),
      recentOrders: recentOrdersResult.rows.map(toCamel),
      recentCompanies: recentCompaniesResult.rows.map(toCamel),
      dealsByStage,
    };
  }


  // Forms
  async getForm(id: string, tenantId?: string): Promise<Form | undefined> {
    const conditions = tenantId
      ? and(eq(forms.id, id), eq(forms.tenantId, tenantId))
      : eq(forms.id, id);
    const [form] = await db.select().from(forms).where(conditions);
    return form;
  }

  async getAllForms(tenantId?: string): Promise<Form[]> {
    if (tenantId) {
      return db.select().from(forms).where(eq(forms.tenantId, tenantId)).orderBy(desc(forms.createdAt));
    }
    return db.select().from(forms).orderBy(desc(forms.createdAt));
  }

  async createForm(form: InsertForm): Promise<Form> {
    const [created] = await db.insert(forms).values(form).returning();
    return created;
  }

  async updateForm(id: string, data: Partial<InsertForm>, tenantId?: string): Promise<Form | undefined> {
    const conditions = tenantId
      ? and(eq(forms.id, id), eq(forms.tenantId, tenantId))
      : eq(forms.id, id);
    const [updated] = await db.update(forms).set({ ...data, updatedAt: new Date() }).where(conditions).returning();
    return updated;
  }

  async deleteForm(id: string, tenantId?: string): Promise<boolean> {
    const conditions = tenantId
      ? and(eq(forms.id, id), eq(forms.tenantId, tenantId))
      : eq(forms.id, id);
    const result = await db.delete(forms).where(conditions);
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
