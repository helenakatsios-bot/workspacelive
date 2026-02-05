import { db } from "./db";
import { eq, and, gte, lte, desc, ilike, or, sql } from "drizzle-orm";
import {
  users, companies, contacts, deals, products, quotes, quoteLines,
  orders, orderLines, invoices, attachments, activities, auditLogs,
  type User, type InsertUser, type Company, type InsertCompany,
  type Contact, type InsertContact, type Deal, type InsertDeal,
  type Product, type InsertProduct, type Quote, type InsertQuote,
  type QuoteLine, type InsertQuoteLine, type Order, type InsertOrder,
  type OrderLine, type InsertOrderLine, type Invoice, type InsertInvoice,
  type Attachment, type InsertAttachment, type Activity, type InsertActivity,
  type AuditLog, type InsertAuditLog
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  // Companies
  getCompany(id: string): Promise<Company | undefined>;
  getAllCompanies(): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined>;

  // Contacts
  getContact(id: string): Promise<Contact | undefined>;
  getAllContacts(): Promise<Contact[]>;
  getContactsByCompany(companyId: string): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;

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

  // Invoices
  getInvoice(id: string): Promise<Invoice | undefined>;
  getAllInvoices(): Promise<Invoice[]>;
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
    const [user] = await db.select().from(users).where(eq(users.email, email));
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
    return db.select().from(orders).where(eq(orders.companyId, companyId)).orderBy(desc(orders.orderDate));
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

  // Invoices
  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getAllInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
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
}

export const storage = new DatabaseStorage();
