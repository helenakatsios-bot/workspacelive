import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool, db } from "./db";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq, ilike } from "drizzle-orm";
import { loginSchema, insertCompanySchema, insertContactSchema, insertDealSchema, insertProductSchema, insertOrderSchema, insertOrderLineSchema, insertActivitySchema, emails as emailsTable, contacts, outlookTokens as outlookTokensTable } from "@shared/schema";
import { registerChatRoutes } from "./replit_integrations/chat";
import { createXeroClient, getStoredToken, saveXeroToken, deleteXeroToken, refreshTokenIfNeeded, importContactsFromXero, syncInvoiceToXero, importInvoicesFromXero } from "./xero";
import { getOutlookAuthUrl, exchangeCodeForTokens, getStoredOutlookToken, saveOutlookToken, deleteOutlookToken, refreshOutlookTokenIfNeeded, syncEmailsToDatabase, sendEmail, replyToEmail, getEmailsForCompany, getEmailsForContact, getAllEmails, backfillEmailCompanyLinks, fetchEmailAttachments, downloadAttachment } from "./outlook";

declare module "express-session" {
  interface SessionData {
    userId: string;
    xeroState?: string;
    outlookState?: string;
  }
}

// Middleware to check authentication
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

// Middleware to check admin role
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

// Middleware to check edit permissions
async function requireEdit(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || (user.role !== "admin" && user.role !== "office")) {
    return res.status(403).json({ message: "Edit access required" });
  }
  next();
}

async function recalcCompanyRevenue(companyId: string) {
  try {
    const result = await pool.query(`
      SELECT COALESCE(SUM(o.total), 0) as total_revenue, MAX(o.order_date) as last_order
      FROM orders o WHERE o.status != 'cancelled' AND o.company_id = $1
    `, [companyId]);
    const row = result.rows[0];
    const revenue = parseFloat(row.total_revenue) || 0;
    const grade = revenue >= 500000 ? 'A' : revenue >= 100000 ? 'B' : 'C';
    await pool.query(`
      UPDATE companies SET total_revenue = $1, last_order_date = $2, client_grade = $3 WHERE id = $4
    `, [revenue, row.last_order, grade, companyId]);
  } catch (err) {
    console.error("Error recalculating company revenue:", err);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session configuration - require SESSION_SECRET in production
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && !sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }

  const PgStore = pgSession(session);

  app.set("trust proxy", 1);
  
  app.use(
    session({
      store: new PgStore({
        pool: pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: sessionSecret || "dev-only-secret-do-not-use-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

  // ==================== AUTH ROUTES ====================
  app.post("/api/sync-accounts-once", async (req, res) => {
    try {
      // Clean all demo data first
      await pool.query(`DELETE FROM order_lines`);
      await pool.query(`DELETE FROM quote_lines`);
      await pool.query(`DELETE FROM activities`);
      await pool.query(`DELETE FROM audit_logs`);
      await pool.query(`DELETE FROM attachments`);
      await pool.query(`DELETE FROM invoices`);
      await pool.query(`DELETE FROM orders`);
      await pool.query(`DELETE FROM quotes`);
      await pool.query(`DELETE FROM deals`);
      await pool.query(`DELETE FROM contacts`);
      await pool.query(`DELETE FROM emails`);
      await pool.query(`DELETE FROM customer_order_requests`);
      await pool.query(`DELETE FROM companies`);
      await pool.query(`DELETE FROM users WHERE email NOT ILIKE '%purax%'`);

      const hash = await bcrypt.hash("admin123", 10);
      
      const helenaExists = await storage.getUserByEmail("helena@purax.com.au");
      const adminExists = await storage.getUserByEmail("admin@company.com");
      
      if (!helenaExists && adminExists) {
        await pool.query(
          `UPDATE users SET email = $1, name = $2, role = 'admin', active = true, password_hash = $3 WHERE email ILIKE 'admin@company.com'`,
          ["helena@purax.com.au", "Helena Katsios", hash]
        );
      } else if (helenaExists) {
        await pool.query(
          `UPDATE users SET role = 'admin', active = true, password_hash = $1 WHERE email ILIKE 'helena@purax.com.au'`,
          [hash]
        );
      }
      
      const yanaExists = await storage.getUserByEmail("yana@purax.com.au");
      if (yanaExists) {
        await pool.query(
          `UPDATE users SET role = 'admin', active = true, password_hash = $1 WHERE email ILIKE 'yana@purax.com.au'`,
          [hash]
        );
      } else {
        await pool.query(
          `INSERT INTO users (id, name, email, password_hash, role, active) VALUES (gen_random_uuid(), 'Yana', 'yana@purax.com.au', $1, 'admin', true)`,
          [hash]
        );
      }
      
      const allUsers = await pool.query(`SELECT id, name, email, role, active FROM users ORDER BY name`);
      res.json({ message: "Accounts synced", users: allUsers.rows });
    } catch (error) {
      console.error("Sync accounts error:", error);
      res.status(500).json({ message: "Failed", error: String(error) });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const normalizedEmail = data.email.trim().toLowerCase();
      console.log("[LOGIN DEBUG] Attempting login for email:", normalizedEmail, "password length:", data.password?.length);
      const user = await storage.getUserByEmail(normalizedEmail);
      
      if (!user) {
        console.log("[LOGIN DEBUG] User not found for email:", data.email);
        return res.status(401).json({ message: "Invalid email or password" });
      }

      console.log("[LOGIN DEBUG] User found:", user.email, "hash starts with:", user.passwordHash?.substring(0, 10));
      const validPassword = await bcrypt.compare(data.password, user.passwordHash);
      console.log("[LOGIN DEBUG] Password valid:", validPassword);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.active) {
        return res.status(403).json({ message: "Account is disabled" });
      }

      req.session.userId = user.id;
      await storage.updateUser(user.id, { lastLogin: new Date() } as any);
      await storage.createAuditLog({
        userId: user.id,
        action: "login",
        entityType: "user",
        entityId: user.id,
      });

      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const { passwordHash, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // ==================== DASHBOARD ROUTES ====================
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Critical: Clients who ordered since July 1, 2021
  app.get("/api/reports/clients-by-order-date", requireAuth, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date("2021-07-01");
      const end = endDate ? new Date(endDate as string) : new Date();
      const companies = await storage.getCompaniesWithOrdersInDateRange(start, end);
      res.json(companies);
    } catch (error) {
      console.error("Clients by order date error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== COMPANIES ROUTES ====================
  app.get("/api/companies", requireAuth, async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Get companies error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id", requireAuth, async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      console.error("Get company error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/companies/recalculate-revenue", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        UPDATE companies SET 
          total_revenue = COALESCE(sub.total_revenue, 0),
          last_order_date = sub.last_order,
          client_grade = CASE 
            WHEN COALESCE(sub.total_revenue, 0) >= 500000 THEN 'A'
            WHEN COALESCE(sub.total_revenue, 0) >= 100000 THEN 'B'
            ELSE 'C'
          END
        FROM (
          SELECT c.id as company_id, 
                 COALESCE(SUM(o.total), 0) as total_revenue, 
                 MAX(o.order_date) as last_order
          FROM companies c
          LEFT JOIN orders o ON o.company_id = c.id AND o.status != 'cancelled'
          GROUP BY c.id
        ) sub WHERE companies.id = sub.company_id
      `);
      res.json({ message: "Revenue recalculated", updated: result.rowCount });
    } catch (error) {
      console.error("Recalculate revenue error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/contacts", requireAuth, async (req, res) => {
    try {
      const contacts = await storage.getContactsByCompany(req.params.id);
      res.json(contacts);
    } catch (error) {
      console.error("Get company contacts error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/orders", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getOrdersByCompany(req.params.id);
      res.json(orders);
    } catch (error) {
      console.error("Get company orders error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/deals", requireAuth, async (req, res) => {
    try {
      const deals = await storage.getDealsByCompany(req.params.id);
      res.json(deals);
    } catch (error) {
      console.error("Get company deals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/activities", requireAuth, async (req, res) => {
    try {
      const activities = await storage.getActivitiesByEntity("company", req.params.id);
      res.json(activities);
    } catch (error) {
      console.error("Get company activities error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/companies", requireEdit, async (req, res) => {
    try {
      const data = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(data);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "company",
        entityId: company.id,
        afterJson: company,
      });
      await storage.createActivity({
        entityType: "company",
        entityId: company.id,
        activityType: "system",
        content: "Company created",
        createdBy: req.session.userId,
      });
      res.status(201).json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create company error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/companies/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getCompany(req.params.id);
      if (!before) {
        return res.status(404).json({ message: "Company not found" });
      }
      const company = await storage.updateCompany(req.params.id, req.body);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "company",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: company,
      });
      if (req.body.creditStatus && req.body.creditStatus !== before.creditStatus) {
        await storage.createActivity({
          entityType: "company",
          entityId: req.params.id,
          activityType: "status_change",
          content: `Credit status changed from ${before.creditStatus} to ${req.body.creditStatus}`,
          createdBy: req.session.userId,
        });
      }
      res.json(company);
    } catch (error) {
      console.error("Update company error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/related-counts", requireAuth, async (req, res) => {
    try {
      const counts = await storage.getCompanyRelatedCounts(req.params.id);
      res.json(counts);
    } catch (error) {
      console.error("Get company related counts error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/companies/:id", requireAdmin, async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      const counts = await storage.getCompanyRelatedCounts(req.params.id);
      const totalRelated = counts.contacts + counts.deals + counts.orders + counts.quotes + counts.invoices;
      if (totalRelated > 0) {
        return res.status(400).json({
          message: "Cannot delete company with related records. Remove all contacts, deals, orders, quotes, and invoices first.",
          counts,
        });
      }
      const deleted = await storage.deleteCompany(req.params.id);
      if (deleted) {
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "delete",
          entityType: "company",
          entityId: req.params.id,
          beforeJson: company,
        });
        res.json({ success: true });
      } else {
        res.status(500).json({ message: "Failed to delete company" });
      }
    } catch (error) {
      console.error("Delete company error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/companies/:id/activities", requireEdit, async (req, res) => {
    try {
      const activity = await storage.createActivity({
        entityType: "company",
        entityId: req.params.id,
        activityType: req.body.activityType,
        content: req.body.content,
        createdBy: req.session.userId,
      });
      res.status(201).json(activity);
    } catch (error) {
      console.error("Create activity error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== CONTACTS ROUTES ====================
  app.get("/api/contacts", requireAuth, async (req, res) => {
    try {
      const contacts = await storage.getAllContacts();
      const companies = await storage.getAllCompanies();
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const contactsWithCompany = contacts.map(contact => ({
        ...contact,
        company: companyMap.get(contact.companyId),
      }));
      res.json(contactsWithCompany);
    } catch (error) {
      console.error("Get contacts error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/contacts/:id", requireAuth, async (req, res) => {
    try {
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const company = await storage.getCompany(contact.companyId);
      res.json({ ...contact, company });
    } catch (error) {
      console.error("Get contact error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/contacts", requireEdit, async (req, res) => {
    try {
      const data = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(data);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "contact",
        entityId: contact.id,
        afterJson: contact,
      });
      res.status(201).json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create contact error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/contacts/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getContact(req.params.id);
      const contact = await storage.updateContact(req.params.id, req.body);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "contact",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: contact,
      });
      res.json(contact);
    } catch (error) {
      console.error("Update contact error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/contacts/:id", requireEdit, async (req, res) => {
    try {
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      const deleted = await storage.deleteContact(req.params.id);
      if (deleted) {
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "delete",
          entityType: "contact",
          entityId: req.params.id,
          beforeJson: contact,
          afterJson: null,
        });
        res.json({ message: "Contact deleted successfully" });
      } else {
        res.status(404).json({ message: "Contact not found" });
      }
    } catch (error) {
      console.error("Delete contact error:", error);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // ==================== DEALS ROUTES ====================
  app.get("/api/deals", requireAuth, async (req, res) => {
    try {
      const deals = await storage.getAllDeals();
      const companies = await storage.getAllCompanies();
      const contacts = await storage.getAllContacts();
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const dealsWithRelations = deals.map(deal => ({
        ...deal,
        company: companyMap.get(deal.companyId),
        contact: deal.contactId ? contactMap.get(deal.contactId) : null,
      }));
      res.json(dealsWithRelations);
    } catch (error) {
      console.error("Get deals error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/deals/:id", requireAuth, async (req, res) => {
    try {
      const deal = await storage.getDeal(req.params.id);
      if (!deal) {
        return res.status(404).json({ message: "Deal not found" });
      }
      const company = await storage.getCompany(deal.companyId);
      const contact = deal.contactId ? await storage.getContact(deal.contactId) : null;
      res.json({ ...deal, company, contact });
    } catch (error) {
      console.error("Get deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/deals", requireEdit, async (req, res) => {
    try {
      const data = insertDealSchema.parse(req.body);
      const deal = await storage.createDeal(data);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "deal",
        entityId: deal.id,
        afterJson: deal,
      });
      res.status(201).json(deal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/deals/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getDeal(req.params.id);
      const deal = await storage.updateDeal(req.params.id, req.body);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "deal",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: deal,
      });
      res.json(deal);
    } catch (error) {
      console.error("Update deal error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== PRODUCTS ROUTES ====================
  app.get("/api/products", requireAuth, async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      console.error("Get products error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/products/:id", requireAuth, async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Get product error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/products", requireEdit, async (req, res) => {
    try {
      const data = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(data);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "product",
        entityId: product.id,
        afterJson: product,
      });
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create product error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/products/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getProduct(req.params.id);
      const product = await storage.updateProduct(req.params.id, req.body);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "product",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: product,
      });
      res.json(product);
    } catch (error) {
      console.error("Update product error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/products/:id", requireEdit, async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      const deleted = await storage.deleteProduct(req.params.id);
      if (deleted) {
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "delete",
          entityType: "product",
          entityId: req.params.id,
          beforeJson: product,
          afterJson: null,
        });
        res.json({ message: "Product deleted successfully" });
      } else {
        res.status(404).json({ message: "Product not found" });
      }
    } catch (error) {
      console.error("Delete product error:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // ==================== QUOTES ROUTES ====================
  app.get("/api/quotes", requireAuth, async (req, res) => {
    try {
      const quotes = await storage.getAllQuotes();
      const companies = await storage.getAllCompanies();
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const quotesWithCompany = quotes.map(quote => ({
        ...quote,
        company: companyMap.get(quote.companyId),
      }));
      res.json(quotesWithCompany);
    } catch (error) {
      console.error("Get quotes error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/quotes/:id", requireAuth, async (req, res) => {
    try {
      const quote = await storage.getQuote(req.params.id);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      const company = await storage.getCompany(quote.companyId);
      const lines = await storage.getQuoteLines(quote.id);
      res.json({ ...quote, company, lines });
    } catch (error) {
      console.error("Get quote error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== ORDERS ROUTES ====================
  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      const companies = await storage.getAllCompanies();
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const ordersWithCompany = orders.map(order => ({
        ...order,
        company: companyMap.get(order.companyId),
      }));
      res.json(ordersWithCompany);
    } catch (error) {
      console.error("Get orders error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      const company = await storage.getCompany(order.companyId);
      const contact = order.contactId ? await storage.getContact(order.contactId) : null;
      const lines = await storage.getOrderLines(order.id);
      res.json({ ...order, company, contact, lines });
    } catch (error) {
      console.error("Get order error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/orders/:id/activities", requireAuth, async (req, res) => {
    try {
      const activities = await storage.getActivitiesByEntity("order", req.params.id);
      res.json(activities);
    } catch (error) {
      console.error("Get order activities error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/orders/:id/attachments", requireAuth, async (req, res) => {
    try {
      const attachments = await storage.getAttachmentsByEntity("order", req.params.id);
      res.json(attachments);
    } catch (error) {
      console.error("Get order attachments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/orders", requireEdit, async (req, res) => {
    try {
      const { lines, ...orderData } = req.body;
      if (orderData.orderDate && typeof orderData.orderDate === "string") {
        orderData.orderDate = new Date(orderData.orderDate);
      }
      if (orderData.requestedShipDate && typeof orderData.requestedShipDate === "string") {
        orderData.requestedShipDate = new Date(orderData.requestedShipDate);
      }
      const data = insertOrderSchema.parse(orderData);
      
      const company = await storage.getCompany(data.companyId);
      if (company?.creditStatus === "on_hold") {
        const user = await storage.getUser(req.session.userId!);
        if (user?.role !== "admin") {
          return res.status(403).json({ message: "Cannot create orders for companies on hold" });
        }
      }

      const order = await storage.createOrder({
        ...data,
        createdBy: req.session.userId,
      });

      if (lines && Array.isArray(lines)) {
        for (const line of lines) {
          const validatedLine = insertOrderLineSchema.omit({ orderId: true }).parse(line);
          await storage.createOrderLine({
            ...validatedLine,
            orderId: order.id,
          });
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "order",
        entityId: order.id,
        afterJson: order,
      });
      await storage.createActivity({
        entityType: "order",
        entityId: order.id,
        activityType: "system",
        content: "Order created",
        createdBy: req.session.userId,
      });
      recalcCompanyRevenue(data.companyId);
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create order error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/orders/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getOrder(req.params.id);
      if (!before) {
        return res.status(404).json({ message: "Order not found" });
      }
      const order = await storage.updateOrder(req.params.id, req.body);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "order",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: order,
      });
      if (req.body.status && req.body.status !== before.status) {
        await storage.createActivity({
          entityType: "order",
          entityId: req.params.id,
          activityType: "status_change",
          content: `Status changed from ${before.status} to ${req.body.status}`,
          createdBy: req.session.userId,
        });
      }
      recalcCompanyRevenue(before.companyId);
      res.json(order);
    } catch (error) {
      console.error("Update order error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/orders/:id/activities", requireEdit, async (req, res) => {
    try {
      const activity = await storage.createActivity({
        entityType: "order",
        entityId: req.params.id,
        activityType: req.body.activityType,
        content: req.body.content,
        createdBy: req.session.userId,
      });
      res.status(201).json(activity);
    } catch (error) {
      console.error("Create activity error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== ORDER PDF DOWNLOAD ====================
  app.get("/api/orders/:id/pdf", requireAuth, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const company = await storage.getCompany(order.companyId);
      const contact = order.contactId ? await storage.getContact(order.contactId) : null;
      const lines = await storage.getOrderLines(order.id);

      const linesWithProducts = await Promise.all(
        lines.map(async (line) => {
          let productName = line.descriptionOverride || "Unknown Item";
          let productSku = "";
          if (line.productId) {
            const product = await storage.getProduct(line.productId);
            if (product) {
              productName = line.descriptionOverride || product.name;
              productSku = product.sku;
            }
          }
          return { ...line, productName, productSku };
        })
      );

      const { generateOrderPdf } = await import("./pdf");
      const pdfBuffer = await generateOrderPdf({
        order,
        company,
        contact,
        lines: linesWithProducts,
      });

      const filename = `Order-${order.orderNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // ==================== PURAX SYNC ROUTES ====================
  app.post("/api/orders/:id/sync-purax", requireEdit, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const puraxApiUrl = process.env.PURAX_API_URL;
      const puraxApiKey = process.env.PURAX_API_KEY;

      if (!puraxApiUrl) {
        return res.status(400).json({ message: "Purax API URL not configured. Go to Admin > Integrations to set it up." });
      }

      const company = await storage.getCompany(order.companyId);
      const contact = order.contactId ? await storage.getContact(order.contactId) : null;
      const lines = await storage.getOrderLines(order.id);

      let originalEmailHtml: string | null = null;
      if (order.sourceEmailId) {
        const [sourceEmail] = await db.select().from(emailsTable).where(eq(emailsTable.id, order.sourceEmailId));
        if (sourceEmail) {
          originalEmailHtml = sourceEmail.bodyHtml || null;
        }
      }

      const linesWithProducts = await Promise.all(
        lines.map(async (line) => {
          let productName = line.descriptionOverride || "Unknown Item";
          let productSku = "";
          if (line.productId) {
            const product = await storage.getProduct(line.productId);
            if (product) {
              productName = line.descriptionOverride || product.name;
              productSku = product.sku;
            }
          }
          return { ...line, productName, productSku };
        })
      );

      let pdfBuffer: Buffer;
      if (originalEmailHtml) {
        try {
          const { convertHtmlToPdf } = await import("./html-to-pdf");
          console.log(`[PURAX-SYNC] Converting original email HTML to PDF for order ${order.orderNumber}`);
          const customerAddress = order.customerAddress || company?.shippingAddress || company?.billingAddress || "";
          const customerName = order.customerName
            || (contact ? `${contact.firstName} ${contact.lastName}`.trim() : "")
            || order.customerNotes?.match(/Customer:\s*([^.]+)/)?.[1]?.trim() || "";
          pdfBuffer = await convertHtmlToPdf(originalEmailHtml, {
            customerName,
            customerAddress,
            customerPhone: order.customerPhone || contact?.phone || "",
            customerEmail: order.customerEmail || contact?.email || "",
          });
        } catch (emailPdfError) {
          console.error(`[PURAX-SYNC] Failed to convert email HTML to PDF, falling back to generated PDF:`, emailPdfError);
          const { generateOrderPdf } = await import("./pdf");
          pdfBuffer = await generateOrderPdf({
            order,
            company,
            contact,
            lines: linesWithProducts,
          });
        }
      } else {
        const { generateOrderPdf } = await import("./pdf");
        pdfBuffer = await generateOrderPdf({
          order,
          company,
          contact,
          lines: linesWithProducts,
        });
      }

      const orderDetailsText = linesWithProducts.map(line =>
        `${line.quantity}x ${line.productName}${line.productSku ? ` (${line.productSku})` : ""} @ $${line.unitPrice} = $${line.lineTotal}`
      ).join("\n");

      const customerName = order.customerName
        || (contact ? `${contact.firstName} ${contact.lastName}`.trim() : "")
        || order.customerNotes?.match(/Customer:\s*([^.]+)/)?.[1]?.trim() || "";

      const customerAddress = order.customerAddress || company?.shippingAddress || company?.billingAddress || "";

      const orderNumOnly = order.orderNumber.replace(/^PD-/, "");
      const customerDetails = customerName
        ? `${orderNumOnly} ${customerName}`
        : orderNumOnly;

      const webhookPayload = {
        orderNumber: order.orderNumber,
        companyName: company?.tradingName || company?.legalName || "",
        customerName: customerDetails,
        customerAddress,
        customerPhone: order.customerPhone || contact?.phone || "",
        customerEmail: order.customerEmail || contact?.email || "",
        deliveryMethod: order.deliveryMethod || order.shippingMethod || "",
        paymentMethod: order.paymentMethod || "",
        shippingCost: "0",
        orderDetails: orderDetailsText,
        subtotal: `$${order.subtotal}`,
        tax: `$${order.tax}`,
        totalAmount: `$${order.total}`,
        pdfData: pdfBuffer.toString("base64"),
        originalEmailHtml: originalEmailHtml || null,
        isUrgent: false,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (puraxApiKey) {
        headers["x-api-key"] = puraxApiKey;
      }

      console.log(`[PURAX-SYNC] Sending order ${order.orderNumber} to ${puraxApiUrl}/api/webhook/orders`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      let response: Response;
      try {
        response = await fetch(`${puraxApiUrl}/api/webhook/orders`, {
          method: "POST",
          headers,
          body: JSON.stringify(webhookPayload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const responseText = await response.text();
      console.log(`[PURAX-SYNC] Response status: ${response.status}, body: ${responseText.substring(0, 500)}`);

      if (!response.ok) {
        const now = new Date();
        await storage.updateOrder(order.id, {
          puraxSyncStatus: "failed",
          puraxSyncedAt: now,
        });
        await storage.createActivity({
          entityType: "order",
          entityId: order.id,
          activityType: "system",
          content: `Failed to sync to Purax: ${response.status} - ${responseText}`,
          createdBy: req.session.userId,
        });
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "update",
          entityType: "order",
          entityId: order.id,
          afterJson: { puraxSyncStatus: "failed", puraxSyncedAt: now },
        });
        return res.status(502).json({ message: `Purax sync failed: ${response.status} - ${responseText}` });
      }

      let puraxOrderId: string | null = null;
      try {
        const responseData = JSON.parse(responseText);
        puraxOrderId = responseData.orderId || responseData.id || null;
      } catch {
        // response may not be JSON
      }

      const syncedAt = new Date();
      await storage.updateOrder(order.id, {
        puraxSyncStatus: "sent",
        puraxSyncedAt: syncedAt,
        puraxOrderId: puraxOrderId,
      });

      await storage.createActivity({
        entityType: "order",
        entityId: order.id,
        activityType: "system",
        content: "Order synced to Purax Feather Holdings app",
        createdBy: req.session.userId,
      });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "order",
        entityId: order.id,
        afterJson: { puraxSyncStatus: "sent", puraxSyncedAt: syncedAt, puraxOrderId },
      });

      res.json({ message: "Order synced to Purax successfully", puraxOrderId });
    } catch (error: any) {
      console.error("Purax sync error:", error);
      const errorMessage = error?.name === "AbortError"
        ? "Connection to Purax timed out (30s). Make sure the Purax app is running and published."
        : error?.cause?.code === "ECONNREFUSED"
        ? "Cannot connect to Purax app. Make sure it is running and published."
        : error?.message || "Unknown error";
      try {
        await storage.updateOrder(req.params.id, {
          puraxSyncStatus: "failed",
        });
        await storage.createActivity({
          entityType: "order",
          entityId: req.params.id,
          activityType: "system",
          content: `Failed to sync to Purax: ${errorMessage}`,
          createdBy: req.session.userId,
        });
      } catch {}
      res.status(500).json({ message: `Purax sync failed: ${errorMessage}` });
    }
  });

  // ==================== INVOICES ROUTES ====================
  app.get("/api/invoices", requireAuth, async (req, res) => {
    try {
      const invoices = await storage.getAllInvoices();
      const companies = await storage.getAllCompanies();
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const invoicesWithCompany = invoices.map(invoice => ({
        ...invoice,
        company: companyMap.get(invoice.companyId),
      }));
      res.json(invoicesWithCompany);
    } catch (error) {
      console.error("Get invoices error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/invoices/:id", requireAuth, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      const company = await storage.getCompany(invoice.companyId);
      const order = invoice.orderId ? await storage.getOrder(invoice.orderId) : null;
      res.json({ ...invoice, company, order });
    } catch (error) {
      console.error("Get invoice error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== ADMIN ROUTES ====================
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const usersWithoutPassword = users.map(({ passwordHash, ...user }) => user);
      res.json(usersWithoutPassword);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Valid email is required"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        role: z.enum(["admin", "office", "warehouse", "readonly"]),
        active: z.boolean().default(true),
      });

      const data = schema.parse(req.body);

      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "A user with this email already exists." });
      }

      const passwordHash = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        active: data.active,
      });

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "create",
        entityType: "user",
        entityId: user.id,
        details: { name: user.name, email: user.email, role: user.role },
      });

      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create user error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        role: z.enum(["admin", "office", "warehouse", "readonly"]).optional(),
        active: z.boolean().optional(),
      });

      const data = schema.parse(req.body);
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.active !== undefined) updateData.active = data.active;
      if (data.password) {
        updateData.passwordHash = await bcrypt.hash(data.password, 10);
      }

      if (data.email) {
        const existing = await storage.getUserByEmail(data.email);
        if (existing && existing.id !== req.params.id) {
          return res.status(400).json({ message: "A user with this email already exists." });
        }
      }

      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "update",
        entityType: "user",
        entityId: user.id,
        details: { name: user.name, email: user.email, role: user.role, active: user.active },
      });

      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      if (req.params.id === req.session.userId) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.deleteUser(req.params.id);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.get("/api/admin/audit-logs", requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAuditLogs(100);
      const users = await storage.getAllUsers();
      const userMap = new Map(users.map(u => [u.id, u]));
      const logsWithUser = logs.map(log => ({
        ...log,
        user: log.userId ? userMap.get(log.userId) : null,
      }));
      res.json(logsWithUser);
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== XERO INTEGRATION ROUTES ====================
  
  // Get Xero connection status
  app.get("/api/xero/status", requireAdmin, async (req, res) => {
    try {
      const token = await getStoredToken();
      if (token) {
        res.json({
          connected: true,
          tenantName: token.tenantName,
          expiresAt: token.expiresAt,
        });
      } else {
        res.json({ connected: false });
      }
    } catch (error) {
      console.error("Xero status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get Xero OAuth authorization URL
  app.get("/api/xero/auth-url", requireAdmin, async (req, res) => {
    try {
      const baseUrl = process.env.APP_URL || `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers["x-forwarded-host"] || req.headers.host}`;
      const redirectUri = `${baseUrl}/api/xero/callback`;
      
      // Generate and store state for CSRF protection
      const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
      req.session.xeroState = state;
      
      const xero = createXeroClient(redirectUri);
      const consentUrl = await xero.buildConsentUrl() + `&state=${encodeURIComponent(state)}`;
      
      res.json({ url: consentUrl });
    } catch (error) {
      console.error("Xero auth URL error:", error);
      res.status(500).json({ message: "Failed to generate Xero authorization URL" });
    }
  });

  // Xero OAuth callback - requires valid session with matching state
  app.get("/api/xero/callback", async (req, res) => {
    try {
      // Validate state parameter for CSRF protection
      const returnedState = req.query.state as string | undefined;
      const sessionState = req.session.xeroState;
      
      // Log state validation for debugging
      console.log("Xero callback - returned state:", returnedState?.substring(0, 10) + "...");
      console.log("Xero callback - session state:", sessionState?.substring(0, 10) + "..." || "undefined");
      
      if (!returnedState || !sessionState || returnedState !== sessionState) {
        console.error("Xero callback: state mismatch or missing session. Session:", !!sessionState, "Returned:", !!returnedState);
        return res.redirect("/admin?xero=error&reason=invalid_state");
      }
      
      // Clear state after validation
      delete req.session.xeroState;
      
      // Verify user is still logged in as admin
      if (!req.session.userId) {
        return res.redirect("/admin?xero=error&reason=not_authenticated");
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        return res.redirect("/admin?xero=error&reason=not_admin");
      }
      
      const baseUrl = process.env.APP_URL || `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers["x-forwarded-host"] || req.headers.host}`;
      const redirectUri = `${baseUrl}/api/xero/callback`;
      
      const xero = createXeroClient(redirectUri);
      
      // Strip state from URL and call apiCallback without state verification
      // since we already validated the state ourselves
      const urlWithoutState = req.url.replace(/[&?]state=[^&]*/, '');
      const tokenSet = await xero.apiCallback(urlWithoutState);
      
      // Get tenants directly from the connections endpoint instead of updateTenants()
      // which tries to call Organisation API and may fail with insufficient scopes
      const connectionsResponse = await fetch("https://api.xero.com/connections", {
        headers: {
          "Authorization": `Bearer ${tokenSet.access_token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!connectionsResponse.ok) {
        console.error("Failed to get Xero connections:", await connectionsResponse.text());
        return res.redirect("/admin?xero=error&reason=connections_failed");
      }
      
      const connections = await connectionsResponse.json() as Array<{ tenantId: string; tenantName?: string; tenantType?: string }>;
      const activeTenant = connections[0];
      
      if (activeTenant && tokenSet.access_token && tokenSet.refresh_token) {
        await saveXeroToken(
          activeTenant.tenantId,
          activeTenant.tenantName || "Xero Organisation",
          tokenSet.access_token,
          tokenSet.refresh_token,
          new Date((tokenSet.expires_at || 0) * 1000)
        );
        
        // Audit log the connection
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "create",
          entityType: "xero_connection",
        });
        
        // Redirect back to admin page
        res.redirect("/admin?xero=connected");
      } else {
        res.redirect("/admin?xero=error");
      }
    } catch (error) {
      console.error("Xero callback error:", error);
      res.redirect("/admin?xero=error");
    }
  });

  // Disconnect Xero
  app.post("/api/xero/disconnect", requireAdmin, async (req, res) => {
    try {
      await deleteXeroToken();
      res.json({ success: true });
    } catch (error) {
      console.error("Xero disconnect error:", error);
      res.status(500).json({ message: "Failed to disconnect Xero" });
    }
  });

  // Import contacts from Xero
  app.post("/api/xero/import-contacts", requireAdmin, async (req, res) => {
    try {
      const token = await getStoredToken();
      if (!token) {
        return res.status(400).json({ message: "Xero not connected" });
      }
      
      const baseUrl = process.env.APP_URL || `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers["x-forwarded-host"] || req.headers.host}`;
      const redirectUri = `${baseUrl}/api/xero/callback`;
      
      const xero = createXeroClient(redirectUri);
      const refreshed = await refreshTokenIfNeeded(xero, token);
      
      if (!refreshed) {
        await deleteXeroToken();
        return res.status(401).json({ message: "Xero session expired. Please go to Admin > Integrations and reconnect Xero." });
      }
      
      const imported = await importContactsFromXero(xero, token.tenantId);
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "xero_import",
        afterJson: { imported: imported.length },
      });
      
      res.json({
        success: true,
        imported: imported.filter(i => i.isNew).length,
        skipped: imported.filter(i => !i.isNew).length,
        contacts: imported,
      });
    } catch (error: any) {
      console.error("Xero import contacts error:", error?.message || error);
      if (error?.response?.statusCode === 401 || error?.statusCode === 401) {
        return res.status(401).json({ message: "Xero session expired. Please go to Admin > Integrations and reconnect Xero." });
      }
      res.status(500).json({ message: "Failed to import contacts from Xero" });
    }
  });

  app.post("/api/xero/import-invoices", requireAdmin, async (req, res) => {
    try {
      const token = await getStoredToken();
      if (!token) {
        return res.status(400).json({ message: "Xero not connected" });
      }
      
      const baseUrl = process.env.APP_URL || `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers["x-forwarded-host"] || req.headers.host}`;
      const redirectUri = `${baseUrl}/api/xero/callback`;
      
      const xero = createXeroClient(redirectUri);
      const refreshed = await refreshTokenIfNeeded(xero, token);
      
      if (!refreshed) {
        await deleteXeroToken();
        return res.status(401).json({ message: "Xero session expired. Please go to Admin > Integrations and reconnect Xero." });
      }
      
      const freshToken = await getStoredToken();
      if (!freshToken) {
        return res.status(400).json({ message: "Xero token not found after refresh" });
      }
      
      const result = await importInvoicesFromXero(freshToken.accessToken, freshToken.tenantId);
      
      const newCount = result.imported.filter(i => i.isNew).length;
      const existingCount = result.imported.filter(i => !i.isNew).length;
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "xero_import_invoices",
        afterJson: { newOrders: newCount, skipped: existingCount, errors: result.errors.length },
      });
      
      res.json({
        imported: newCount,
        skipped: existingCount,
        errors: result.errors,
        details: result.imported,
      });
    } catch (error: any) {
      console.error("Xero import invoices error:", error?.message || error);
      if (error?.response?.statusCode === 401 || error?.statusCode === 401) {
        return res.status(401).json({ message: "Xero session expired. Please go to Admin > Integrations and reconnect Xero." });
      }
      res.status(500).json({ message: error.message || "Failed to import invoices from Xero" });
    }
  });

  // Sync invoice to Xero
  app.post("/api/xero/sync-invoice/:invoiceId", requireAdmin, async (req, res) => {
    try {
      const token = await getStoredToken();
      if (!token) {
        return res.status(400).json({ message: "Xero not connected" });
      }
      
      const invoice = await storage.getInvoice(req.params.invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const company = await storage.getCompany(invoice.companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      const baseUrl = process.env.APP_URL || `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers["x-forwarded-host"] || req.headers.host}`;
      const redirectUri = `${baseUrl}/api/xero/callback`;
      
      const xero = createXeroClient(redirectUri);
      const refreshed = await refreshTokenIfNeeded(xero, token);
      
      if (!refreshed) {
        await deleteXeroToken();
        return res.status(401).json({ message: "Xero session expired. Please go to Admin > Integrations and reconnect Xero." });
      }
      
      // Get invoice line items if available (simplified for now)
      const lineItems = [{
        description: `Invoice ${invoice.invoiceNumber}`,
        quantity: 1,
        unitAmount: parseFloat(invoice.subtotal as string),
      }];
      
      await syncInvoiceToXero(xero, token.tenantId, invoice, company, lineItems);
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "xero_sync",
        entityId: invoice.id,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Xero sync invoice error:", error);
      res.status(500).json({ message: "Failed to sync invoice to Xero" });
    }
  });

  // ============ OUTLOOK EMAIL INTEGRATION ============
  
  // Get Outlook connection status
  app.get("/api/outlook/status", requireAuth, async (req, res) => {
    try {
      const token = await getStoredOutlookToken(req.session.userId!);
      if (token) {
        res.json({
          connected: true,
          email: token.emailAddress,
          expiresAt: token.expiresAt,
        });
      } else {
        res.json({ connected: false });
      }
    } catch (error) {
      console.error("Outlook status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get Outlook OAuth authorization URL
  app.get("/api/outlook/auth-url", requireAuth, async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;
      
      const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
      req.session.outlookState = state;
      
      const authUrl = await getOutlookAuthUrl(redirectUri, state);
      
      res.json({ url: authUrl });
    } catch (error) {
      console.error("Outlook auth URL error:", error);
      res.status(500).json({ message: "Failed to generate Outlook authorization URL" });
    }
  });

  // Handle Outlook OAuth callback
  app.get("/api/outlook/callback", async (req, res) => {
    try {
      const returnedState = req.query.state as string | undefined;
      const sessionState = req.session.outlookState;
      
      if (!returnedState || !sessionState || returnedState !== sessionState) {
        console.error("Outlook callback: state mismatch or missing session");
        return res.redirect("/admin?outlook=error&reason=invalid_state");
      }
      
      delete req.session.outlookState;
      
      if (!req.session.userId) {
        return res.redirect("/admin?outlook=error&reason=not_authenticated");
      }
      
      const code = req.query.code as string | undefined;
      if (!code) {
        const error = req.query.error as string;
        console.error("Outlook OAuth error:", error);
        return res.redirect(`/admin?outlook=error&reason=${encodeURIComponent(error || "no_code")}`);
      }
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;
      
      const tokens = await exchangeCodeForTokens(redirectUri, code);
      
      await saveOutlookToken(
        req.session.userId,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresAt,
        tokens.email
      );
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "outlook_connection",
        entityId: req.session.userId,
      });
      
      res.redirect("/admin?outlook=success");
    } catch (error) {
      console.error("Outlook callback error:", error);
      res.redirect("/admin?outlook=error&reason=token_exchange_failed");
    }
  });

  // Disconnect Outlook
  app.post("/api/outlook/disconnect", requireAuth, async (req, res) => {
    try {
      await deleteOutlookToken(req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error("Outlook disconnect error:", error);
      res.status(500).json({ message: "Failed to disconnect Outlook" });
    }
  });

  // Sync emails from Outlook (syncs all connected accounts)
  app.post("/api/outlook/sync", requireAuth, async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;
      
      const allTokens = await db.select().from(outlookTokensTable);
      if (allTokens.length === 0) {
        return res.status(400).json({ message: "No Outlook accounts connected. Connect Outlook in Admin > Integrations." });
      }

      let totalSynced = 0;
      for (const token of allTokens) {
        try {
          const accessToken = await refreshOutlookTokenIfNeeded(token.userId, redirectUri);
          if (!accessToken) continue;
          
          const folders = ["inbox", "sentItems", "drafts"];
          for (const folder of folders) {
            const synced = await syncEmailsToDatabase(token.userId, accessToken, folder);
            totalSynced += synced;
          }
        } catch (err) {
          console.error(`[SYNC] Error syncing for user ${token.userId}:`, err);
        }
      }
      
      res.json({ success: true, synced: totalSynced });
    } catch (error) {
      console.error("Outlook sync error:", error);
      res.status(500).json({ message: "Failed to sync emails from Outlook" });
    }
  });

  // Get emails
  app.get("/api/emails", requireAuth, async (req, res) => {
    try {
      const { folder, companyId, contactId, limit = "50" } = req.query;
      
      let emailList;
      if (companyId) {
        emailList = await getEmailsForCompany(companyId as string, parseInt(limit as string));
      } else if (contactId) {
        emailList = await getEmailsForContact(contactId as string, parseInt(limit as string));
      } else {
        emailList = await getAllEmails(req.session.userId!, folder as string | undefined, parseInt(limit as string));
      }
      
      res.json(emailList);
    } catch (error) {
      console.error("Get emails error:", error);
      res.status(500).json({ message: "Failed to get emails" });
    }
  });

  app.post("/api/emails/:id/convert-to-order", requireEdit, async (req, res) => {
    try {
      const emailId = req.params.id;
      const [email] = await db.select().from(emailsTable).where(eq(emailsTable.id, emailId));
      if (!email) return res.status(404).json({ message: "Email not found" });

      const subject = email.subject || "";
      const preview = email.bodyPreview || "";
      const bodyHtml = email.bodyHtml || "";
      const plainText = bodyHtml
        .replace(/<[^>]+>/g, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n/g, "\n")
        .trim();

      const isShopifyEmail = /Order\s*#\d+/i.test(subject) && /placed by/i.test(subject);

      // Detect forwarded emails and extract real sender
      const isForwarded = /^(fw|fwd):/i.test(subject) || plainText.match(/From:\s*[^<\n]+<[^>]+>/m);
      let realSenderEmail = email.fromAddress || "";
      let realSenderName = "";
      if (isForwarded) {
        const fwdFromMatch = plainText.match(/From:\s*([^<\n]+?)\s*<([^>]+)>/m);
        if (fwdFromMatch) {
          realSenderName = fwdFromMatch[1].trim();
          realSenderEmail = fwdFromMatch[2].trim();
        }
      }

      let customerName = "";
      let customerPhone = "";
      let customerAddress = "";
      let customerEmail = "";
      let shopifyOrderNum: string | null = null;
      let companyName = "";
      const lines: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }> = [];
      let subtotal = 0;
      let shipping = 0;
      let total = 0;

      if (isShopifyEmail) {
        const orderNumMatch = subject.match(/Order\s*#(\d+)/i);
        shopifyOrderNum = orderNumMatch ? orderNumMatch[1] : null;

        const nameMatch = subject.match(/placed by\s+(.+)/i);
        customerName = nameMatch ? nameMatch[1].trim() : "";

        const shippingAddrMatch = plainText.match(/Shipping address\s+(.+?)(?=Billing address|$)/is);
        if (shippingAddrMatch) {
          let addrBlock = shippingAddrMatch[1].trim();
          addrBlock = addrBlock.replace(/\d+\s+O'Connor\s+Street.*$/i, "").trim();
          const phoneMatch = addrBlock.match(/(\+?\d[\d\s\-]{8,})/);
          if (phoneMatch) {
            customerPhone = phoneMatch[1].trim();
            addrBlock = addrBlock.replace(phoneMatch[0], "").trim();
          }
          if (customerName && addrBlock.toLowerCase().startsWith(customerName.toLowerCase())) {
            addrBlock = addrBlock.substring(customerName.length).trim();
          }
          customerAddress = addrBlock;
        }

        const summaryStart = preview.indexOf("Order summary");
        const subtotalStart = preview.indexOf("Subtotal");
        if (summaryStart !== -1 && subtotalStart !== -1) {
          const summaryText = preview.substring(summaryStart + "Order summary".length, subtotalStart).trim();
          const allLines = summaryText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
          let currentProduct = "";
          let currentPrice = 0;
          let currentQty = 1;
          for (const line of allLines) {
            if (line === "View order") continue;
            if (/^[A-Z]+\d+\s*\(/.test(line)) continue;
            const priceQtyMatch = line.match(/\$([0-9,.]+)(?:\s+\$([0-9,.]+))?\s*×\s*(\d+)/);
            if (priceQtyMatch) {
              const originalPrice = parseFloat(priceQtyMatch[1].replace(",", ""));
              const discountedPrice = priceQtyMatch[2] ? parseFloat(priceQtyMatch[2].replace(",", "")) : originalPrice;
              currentPrice = discountedPrice;
              currentQty = parseInt(priceQtyMatch[3]);
              continue;
            }
            const lineTotalMatch = line.match(/^\$([0-9,.]+)$/);
            if (lineTotalMatch && currentProduct && currentPrice > 0) {
              const lineTotal = parseFloat(lineTotalMatch[1].replace(",", ""));
              lines.push({ description: currentProduct, quantity: currentQty, unitPrice: currentPrice, lineTotal });
              currentProduct = "";
              currentPrice = 0;
              currentQty = 1;
              continue;
            }
            if (!line.startsWith("$") && line.length > 2 &&
                !line.includes("View order") && !line.match(/^(King|Queen|Standard|Single|Double|Super)\b/i) &&
                !line.match(/^[A-Z]+\d+/) && !line.match(/^\(\-?\$/) &&
                !line.match(/^Shipping/) && !line.match(/^Total/)) {
              currentProduct = line;
            }
          }
          if (currentProduct && currentPrice > 0 && lines.length === 0) {
            lines.push({ description: currentProduct, quantity: currentQty, unitPrice: currentPrice, lineTotal: currentPrice * currentQty });
          }
        }

        const subtotalMatch = preview.match(/Subtotal\s*\$([0-9,.]+)/);
        const shippingMatch = preview.match(/Shipping\s*\([^)]*\)\s*\$([0-9,.]+)/);
        const totalMatch = preview.match(/Total\s*\$([0-9,.]+)/);
        subtotal = subtotalMatch ? parseFloat(subtotalMatch[1].replace(",", "")) : lines.reduce((s, l) => s + l.lineTotal, 0);
        shipping = shippingMatch ? parseFloat(shippingMatch[1].replace(",", "")) : 0;
        total = totalMatch ? parseFloat(totalMatch[1].replace(",", "")) : subtotal + shipping;
      } else {
        // Generic B2B order email parsing
        customerEmail = realSenderEmail || email.fromAddress || "";
        customerName = realSenderName || "";

        // Parse order lines from email body - handles formats like:
        // "14x 40x80cm", "40x80cm x14", "40x80 cm qty 14", "14 x 40x80cm", "40x80cm - 14"
        const bodyLines = plainText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);

        for (const line of bodyLines) {
          // Pattern: qty first - "14x 40x80cm" or "14 x 40x80cm"
          const qtyFirstMatch = line.match(/^(\d+)\s*x\s+(.+)/i);
          if (qtyFirstMatch) {
            const qty = parseInt(qtyFirstMatch[1]);
            const desc = qtyFirstMatch[2].trim();
            if (qty > 0 && desc.length > 1) {
              lines.push({ description: desc, quantity: qty, unitPrice: 0, lineTotal: 0 });
              continue;
            }
          }

          // Pattern: qty at end - "40x80cm x14" or "40x80cm x 14"
          const qtyEndMatch = line.match(/^(.+?)\s+x\s*(\d+)\s*$/i);
          if (qtyEndMatch) {
            const desc = qtyEndMatch[1].trim();
            const qty = parseInt(qtyEndMatch[2]);
            if (qty > 0 && desc.length > 1 && !/^\d+$/.test(desc)) {
              lines.push({ description: desc, quantity: qty, unitPrice: 0, lineTotal: 0 });
              continue;
            }
          }

          // Pattern: qty with dash - "40x80cm - 14" or "40x80cm — 14"
          const dashMatch = line.match(/^(.+?)\s*[-–—]\s*(\d+)\s*$/);
          if (dashMatch) {
            const desc = dashMatch[1].trim();
            const qty = parseInt(dashMatch[2]);
            if (qty > 0 && desc.length > 1 && !/^\d+$/.test(desc)) {
              lines.push({ description: desc, quantity: qty, unitPrice: 0, lineTotal: 0 });
              continue;
            }
          }

          // Pattern: qty with "qty" keyword - "40x80cm qty 14" or "40x80cm QTY: 14"
          const qtyKeywordMatch = line.match(/^(.+?)\s+qty[:\s]*(\d+)\s*$/i);
          if (qtyKeywordMatch) {
            const desc = qtyKeywordMatch[1].trim();
            const qty = parseInt(qtyKeywordMatch[2]);
            if (qty > 0 && desc.length > 1) {
              lines.push({ description: desc, quantity: qty, unitPrice: 0, lineTotal: 0 });
              continue;
            }
          }

          // Pattern: "qty" keyword first - "qty 14 40x80cm" or "QTY: 14 40x80cm"
          const qtyKeywordFirstMatch = line.match(/^qty[:\s]*(\d+)\s+(.+)/i);
          if (qtyKeywordFirstMatch) {
            const qty = parseInt(qtyKeywordFirstMatch[1]);
            const desc = qtyKeywordFirstMatch[2].trim();
            if (qty > 0 && desc.length > 1) {
              lines.push({ description: desc, quantity: qty, unitPrice: 0, lineTotal: 0 });
              continue;
            }
          }
        }
      }

      // Validate: non-Shopify emails must have at least one parsed order line
      if (!isShopifyEmail && lines.length === 0) {
        return res.status(400).json({ error: "No order lines could be parsed from this email. This doesn't appear to be an order email." });
      }

      // Match company: try subject/body name first (most reliable), then sender email, then domain
      const allCompanies = await storage.getAllCompanies();
      let company: any = null;

      if (isShopifyEmail) {
        company = allCompanies.find(
          (c) => c.legalName.toLowerCase().includes("puradown") ||
                 (c.tradingName && c.tradingName.toLowerCase().includes("puradown"))
        );
      }

      if (!company) {
        const senderEmail = realSenderEmail || email.fromAddress || "";
        const senderDomain = senderEmail.split("@")[1]?.toLowerCase() || "";

        // 1. Try matching company name from subject (most reliable for B2B orders)
        const subjectClean = subject.toLowerCase().replace(/^(fw|fwd|re):\s*/gi, "").replace(/[.]/g, "").replace(/\border\b/gi, "").trim();
        const textClean = plainText.toLowerCase().replace(/[.]/g, "");
        const companyMatches: Array<{ company: any; score: number }> = [];

        for (const c of allCompanies) {
          const rawNames = [c.legalName, c.tradingName].filter(Boolean);
          for (const rawName of rawNames) {
            const nameLower = rawName!.toLowerCase();
            // Strip /COD suffix for matching purposes
            const nameWithoutCod = nameLower.replace(/\/cod\s*$/i, "").trim();
            const nameParts = nameLower.split(/[\/\\|]+/).map(p => p.trim()).filter(p => p.length >= 2 && p !== "cod");
            const cleanName = nameWithoutCod.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

            // Build match targets: full clean name + individual parts that are multi-word or 6+ chars
            const matchTargets = new Set<string>();
            matchTargets.add(cleanName);
            for (const part of nameParts) {
              const partClean = part.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
              if (partClean.split(/\s+/).length >= 2 || partClean.length >= 6) {
                matchTargets.add(partClean);
              }
            }

            for (const target of matchTargets) {
              if (target.length < 3) continue;
              const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const regex = new RegExp(`\\b${escaped}\\b`);
              if (regex.test(subjectClean)) {
                companyMatches.push({ company: c, score: target.length + 20 });
                break;
              } else if (regex.test(textClean)) {
                companyMatches.push({ company: c, score: target.length });
                break;
              }
            }
          }
        }

        if (companyMatches.length > 0) {
          companyMatches.sort((a, b) => b.score - a.score);
          company = companyMatches[0].company;
        }

        // 2. Try matching by contact email
        if (!company && senderEmail) {
          const matchedContacts = await db.select().from(contacts).where(ilike(contacts.email, senderEmail)).limit(1);
          if (matchedContacts.length > 0) {
            company = allCompanies.find(c => c.id === matchedContacts[0].companyId);
          }
        }

        // 3. Try matching by email domain to company name
        if (!company && senderDomain && senderDomain !== "gmail.com" && senderDomain !== "yahoo.com" && senderDomain !== "hotmail.com" && senderDomain !== "outlook.com") {
          const domainName = senderDomain.replace(/\.(com|com\.au|net|org|co).*$/, "").replace(/^(shop|info|orders|sales|hello)/, "");
          if (domainName.length >= 3) {
            company = allCompanies.find(c =>
              c.legalName.toLowerCase().replace(/[^a-z0-9]/g, "").includes(domainName) ||
              (c.tradingName && c.tradingName.toLowerCase().replace(/[^a-z0-9]/g, "").includes(domainName))
            );
          }
        }
      }

      if (!company) {
        const companyNameFromSubject = subject.replace(/order/i, "").replace(/re:/i, "").replace(/fw:/i, "").replace(/fwd:/i, "").trim();
        company = await storage.createCompany({
          legalName: companyNameFromSubject || customerName || "Unknown Customer",
        });
      }

      // Auto-create/update contact with sender email if not Shopify
      if (!isShopifyEmail && customerEmail) {
        const existingContacts = await db.select().from(contacts).where(ilike(contacts.email, customerEmail)).limit(1);
        if (existingContacts.length === 0) {
          let contactFirstName = "";
          let contactLastName = "";
          const bodyLines = plainText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
          for (let i = 0; i < bodyLines.length; i++) {
            const line = bodyLines[i];
            if (/^(thanks|thank you|cheers|regards|kind regards|best|warm regards)/i.test(line)) {
              const nextLine = bodyLines[i + 1];
              if (nextLine && nextLine.length < 40 && /^[A-Z]/.test(nextLine) && !/[.@#$%]/.test(nextLine)) {
                const nameParts = nextLine.split(/\s+/);
                contactFirstName = nameParts[0] || "";
                contactLastName = nameParts.slice(1).join(" ") || "";
                customerName = nextLine;
                break;
              }
            }
          }
          if (!contactFirstName) {
            const fromLineMatch = plainText.match(/From:\s*([^<\n]+?)(?:\s*<|$)/m);
            if (fromLineMatch) {
              const nameParts = fromLineMatch[1].trim().split(/\s+/);
              contactFirstName = nameParts[0] || "";
              contactLastName = nameParts.slice(1).join(" ") || "";
              if (!customerName) customerName = fromLineMatch[1].trim();
            }
          }
          if (!contactFirstName) {
            const emailLocalPart = customerEmail.split("@")[0] || "";
            contactFirstName = emailLocalPart;
          }

          await storage.createContact({
            companyId: company.id,
            firstName: contactFirstName,
            lastName: contactLastName,
            email: customerEmail,
          });
        } else if (existingContacts[0].companyId !== company.id) {
          await db.update(contacts).set({ companyId: company.id }).where(eq(contacts.id, existingContacts[0].id));
        }
      }

      // Generate order number
      const orderNumber = shopifyOrderNum
        ? `PD-${shopifyOrderNum}`
        : `ORD-${Date.now().toString(36).toUpperCase()}`;

      const existingOrders = await storage.getAllOrders();
      const duplicate = existingOrders.find((o) => o.orderNumber === orderNumber);
      if (duplicate) {
        return res.status(400).json({ message: `Order ${orderNumber} already exists`, orderId: duplicate.id });
      }

      const order = await storage.createOrder({
        orderNumber,
        companyId: company.id,
        status: "new",
        orderDate: email.receivedAt || new Date(),
        subtotal: subtotal.toFixed(2),
        tax: "0",
        total: total.toFixed(2),
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        customerAddress: customerAddress || null,
        customerEmail: customerEmail || null,
        sourceEmailId: emailId,
        customerNotes: isShopifyEmail
          ? `Converted from Puradown email. Customer: ${customerName}. Shipping: $${shipping.toFixed(2)}`
          : `Converted from email: ${subject}`,
        createdBy: req.session.userId,
      });

      for (const line of lines) {
        await storage.createOrderLine({
          orderId: order.id,
          productId: null,
          descriptionOverride: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice.toFixed(2),
          discount: "0",
          lineTotal: line.lineTotal.toFixed(2),
        });
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "order",
        entityId: order.id,
        afterJson: order,
      });
      await storage.createActivity({
        entityType: "order",
        entityId: order.id,
        activityType: "system",
        content: `Order created from email (${subject})`,
        createdBy: req.session.userId,
      });

      res.status(201).json(order);
    } catch (error) {
      console.error("Convert email to order error:", error);
      res.status(500).json({ message: "Failed to convert email to order" });
    }
  });

  // ==================== EMAIL ATTACHMENT ENDPOINTS ====================

  app.get("/api/emails/:id/attachments", requireAuth, async (req, res) => {
    try {
      const emailId = req.params.id;
      const [email] = await db.select().from(emailsTable).where(eq(emailsTable.id, emailId));
      if (!email) return res.status(404).json({ message: "Email not found" });

      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;

      const accessToken = await refreshOutlookTokenIfNeeded(email.userId, redirectUri);
      if (!accessToken) return res.status(400).json({ message: "Outlook not connected or token expired" });

      const attachments = await fetchEmailAttachments(accessToken, email.outlookMessageId);
      const pdfAttachments = attachments.filter(a => !a.isInline && (a.contentType === "application/pdf" || a.name?.toLowerCase().endsWith(".pdf")));
      res.json(pdfAttachments);
    } catch (error) {
      console.error("Fetch attachments error:", error);
      res.status(500).json({ message: "Failed to fetch attachments" });
    }
  });

  app.post("/api/emails/:id/extract-pdf-order", requireEdit, async (req, res) => {
    try {
      const emailId = req.params.id;
      const { attachmentId } = req.body;
      if (!attachmentId) return res.status(400).json({ message: "attachmentId is required" });

      const [email] = await db.select().from(emailsTable).where(eq(emailsTable.id, emailId));
      if (!email) return res.status(404).json({ message: "Email not found" });

      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;

      const accessToken = await refreshOutlookTokenIfNeeded(email.userId, redirectUri);
      if (!accessToken) return res.status(400).json({ message: "Outlook not connected or token expired" });

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await downloadAttachment(accessToken, email.outlookMessageId, attachmentId);
        console.log(`[PDF-EXTRACT] Downloaded attachment: ${pdfBuffer.length} bytes`);
      } catch (dlErr: any) {
        console.error("[PDF-EXTRACT] Download failed:", dlErr?.message || dlErr);
        return res.status(500).json({ message: "Failed to download PDF attachment from Outlook" });
      }

      let pdfText: string;
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(pdfBuffer, {
          max: 0,
        });
        pdfText = pdfData.text;
        console.log(`[PDF-EXTRACT] Extracted text: ${pdfText.length} chars, pages: ${pdfData.numpages}`);
      } catch (parseErr: any) {
        console.error("[PDF-EXTRACT] PDF parse failed:", parseErr?.message || parseErr, parseErr?.stack);
        const header = pdfBuffer.slice(0, 5).toString();
        console.log(`[PDF-EXTRACT] Buffer header: "${header}", size: ${pdfBuffer.length}`);
        if (header !== "%PDF-") {
          return res.status(400).json({ message: "This attachment does not appear to be a valid PDF file." });
        }
        return res.status(400).json({ message: "Could not parse this PDF. The file may be corrupted or password-protected." });
      }

      if (!pdfText || pdfText.trim().length < 10) {
        return res.status(400).json({ message: "Could not extract text from this PDF. It may be a scanned image." });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an order data extraction assistant. Extract order/invoice details from the provided text.
Return a JSON object with these fields:
{
  "companyName": "the customer/company name",
  "contactName": "contact person name if found",
  "contactEmail": "email if found",
  "contactPhone": "phone if found",
  "deliveryAddress": "delivery/shipping address if found",
  "orderDate": "date in YYYY-MM-DD format if found",
  "poNumber": "purchase order number if found",
  "notes": "any special notes or instructions",
  "lines": [
    {
      "description": "product name/description",
      "quantity": 1,
      "unitPrice": 0.00,
      "lineTotal": 0.00
    }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00
}
Rules:
- Extract ALL line items you can find
- If prices are not present, use 0
- Quantities must be integers >= 1
- Return ONLY the JSON object, no other text`
          },
          {
            role: "user",
            content: `Extract order details from this PDF:\n\n${pdfText.substring(0, 8000)}`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = aiResponse.choices[0]?.message?.content || "{}";
      let extractedData;
      try {
        extractedData = JSON.parse(content);
      } catch {
        return res.status(500).json({ message: "AI returned invalid data. Please try again." });
      }

      const allCompanies = await storage.getAllCompanies();
      let matchedCompanyId: string | null = null;

      if (extractedData.companyName) {
        const searchName = extractedData.companyName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        for (const c of allCompanies) {
          const legalClean = c.legalName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          const tradingClean = (c.tradingName || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
          if (legalClean.includes(searchName) || searchName.includes(legalClean) ||
              (tradingClean && (tradingClean.includes(searchName) || searchName.includes(tradingClean)))) {
            matchedCompanyId = c.id;
            break;
          }
        }

        if (!matchedCompanyId && extractedData.contactEmail) {
          const domain = extractedData.contactEmail.split("@")[1]?.toLowerCase() || "";
          if (domain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"].includes(domain)) {
            const domainName = domain.replace(/\.(com|com\.au|net|org|co).*$/, "");
            if (domainName.length >= 3) {
              const match = allCompanies.find(c =>
                c.legalName.toLowerCase().replace(/[^a-z0-9]/g, "").includes(domainName) ||
                (c.tradingName && c.tradingName.toLowerCase().replace(/[^a-z0-9]/g, "").includes(domainName))
              );
              if (match) matchedCompanyId = match.id;
            }
          }
        }
      }

      res.json({
        ...extractedData,
        matchedCompanyId,
        matchedCompanyName: matchedCompanyId ? allCompanies.find(c => c.id === matchedCompanyId)?.legalName : null,
        sourceEmailId: emailId,
        senderEmail: email.fromAddress,
        senderName: email.fromName,
      });
    } catch (error) {
      console.error("Extract PDF order error:", error);
      res.status(500).json({ message: "Failed to extract order from PDF" });
    }
  });

  app.post("/api/emails/:id/create-order-from-pdf", requireEdit, async (req, res) => {
    try {
      const emailId = req.params.id;
      const { companyId, companyName, contactName, contactEmail, contactPhone, deliveryAddress, poNumber, notes, lines, subtotal, tax, total } = req.body;

      if (!lines || lines.length === 0) {
        return res.status(400).json({ message: "No order lines provided" });
      }

      let finalCompanyId = companyId;
      if (!finalCompanyId) {
        const newCompany = await storage.createCompany({
          legalName: companyName || "Unknown Customer",
        });
        finalCompanyId = newCompany.id;
      }

      if (contactEmail) {
        const existingContacts = await db.select().from(contacts).where(ilike(contacts.email, contactEmail)).limit(1);
        if (existingContacts.length === 0) {
          const nameParts = (contactName || "").split(/\s+/);
          await storage.createContact({
            companyId: finalCompanyId,
            firstName: nameParts[0] || contactEmail.split("@")[0] || "",
            lastName: nameParts.slice(1).join(" ") || "",
            email: contactEmail,
            phone: contactPhone || undefined,
          });
        }
      }

      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
      const calcTotal = parseFloat(total) || lines.reduce((s: number, l: any) => s + (parseFloat(l.lineTotal) || 0), 0);

      const order = await storage.createOrder({
        orderNumber,
        companyId: finalCompanyId,
        status: "new",
        orderDate: new Date(),
        subtotal: (parseFloat(subtotal) || calcTotal).toFixed(2),
        tax: (parseFloat(tax) || 0).toFixed(2),
        total: calcTotal.toFixed(2),
        customerName: contactName || null,
        customerPhone: contactPhone || null,
        customerAddress: deliveryAddress || null,
        customerEmail: contactEmail || null,
        sourceEmailId: emailId,
        customerNotes: [
          poNumber ? `PO: ${poNumber}` : "",
          notes || "",
          `Created from PDF attachment`,
        ].filter(Boolean).join(". "),
        createdBy: req.session.userId,
      });

      for (const line of lines) {
        await storage.createOrderLine({
          orderId: order.id,
          productId: null,
          descriptionOverride: line.description || "Item",
          quantity: parseInt(line.quantity) || 1,
          unitPrice: (parseFloat(line.unitPrice) || 0).toFixed(2),
          discount: "0",
          lineTotal: (parseFloat(line.lineTotal) || 0).toFixed(2),
        });
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "order",
        entityId: order.id,
        afterJson: order,
      });
      await storage.createActivity({
        entityType: "order",
        entityId: order.id,
        activityType: "system",
        content: `Order created from PDF attachment on email`,
        createdBy: req.session.userId,
      });

      res.status(201).json(order);
    } catch (error) {
      console.error("Create order from PDF error:", error);
      res.status(500).json({ message: "Failed to create order from PDF" });
    }
  });

  // Send email
  app.post("/api/outlook/send", requireAuth, async (req, res) => {
    try {
      const { to, subject, body, cc } = req.body;
      
      if (!to || !to.length || !subject || !body) {
        return res.status(400).json({ message: "Missing required fields: to, subject, body" });
      }
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;
      
      const accessToken = await refreshOutlookTokenIfNeeded(req.session.userId!, redirectUri);
      if (!accessToken) {
        return res.status(401).json({ message: "Outlook not connected or token expired" });
      }
      
      await sendEmail(accessToken, to, subject, body, cc);
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "email_sent",
        entityId: to[0],
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Send email error:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  app.post("/api/emails/:id/reply", requireAuth, async (req, res) => {
    try {
      const emailId = req.params.id;
      const { body, replyAll } = req.body;
      
      if (!body) {
        return res.status(400).json({ message: "Reply body is required" });
      }
      
      const [email] = await db.select().from(emailsTable).where(eq(emailsTable.id, emailId));
      if (!email) return res.status(404).json({ message: "Email not found" });
      
      if (!email.outlookMessageId) {
        return res.status(400).json({ message: "This email does not have an Outlook message ID and cannot be replied to" });
      }
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;
      
      const accessToken = await refreshOutlookTokenIfNeeded(req.session.userId!, redirectUri);
      if (!accessToken) {
        return res.status(401).json({ message: "Outlook not connected or token expired. Please connect Outlook in Admin settings." });
      }
      
      await replyToEmail(accessToken, email.outlookMessageId, body, replyAll === true);
      
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "email_reply",
        entityId: emailId,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Reply email error:", error);
      res.status(500).json({ message: "Failed to send reply" });
    }
  });

  app.get("/api/emails/:id", requireAuth, async (req, res) => {
    try {
      const emailId = req.params.id;
      const [email] = await db.select().from(emailsTable).where(eq(emailsTable.id, emailId));
      if (!email) return res.status(404).json({ message: "Email not found" });
      res.json(email);
    } catch (error) {
      console.error("Get email error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/emails/backfill-companies", requireAdmin, async (_req, res) => {
    try {
      const updated = await backfillEmailCompanyLinks();
      res.json({ success: true, updated });
    } catch (error) {
      console.error("Backfill error:", error);
      res.status(500).json({ message: "Failed to backfill email company links" });
    }
  });

  // ==================== PUBLIC ORDER FORM ROUTES (NO AUTH) ====================
  app.get("/api/public/products", async (_req, res) => {
    try {
      const products = await storage.getActiveProducts();
      const publicProducts = products.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        unitPrice: p.unitPrice,
      }));
      res.json(publicProducts);
    } catch (error) {
      console.error("Public products error:", error);
      res.status(500).json({ message: "Failed to load products" });
    }
  });

  app.post("/api/public/order-request", async (req, res) => {
    try {
      const schema = z.object({
        companyName: z.string().min(1, "Company name is required"),
        contactName: z.string().min(1, "Contact name is required"),
        contactEmail: z.string().email("Valid email is required"),
        contactPhone: z.string().optional(),
        shippingAddress: z.string().optional(),
        streetAddress: z.string().optional(),
        cityStateZip: z.string().optional(),
        customerNotes: z.string().optional(),
        items: z.array(z.object({
          quantity: z.number().min(1),
          description: z.string().min(1),
          unitPrice: z.number().min(0).optional(),
          lineTotal: z.number().min(0).optional(),
        })).min(1, "At least one item is required"),
        subtotal: z.number().optional(),
        gst: z.number().optional(),
        total: z.number().optional(),
      });

      const data = schema.parse(req.body);

      const validatedItems = data.items.map(item => ({
        quantity: item.quantity,
        description: item.description,
        unitPrice: item.unitPrice || 0,
        lineTotal: item.lineTotal || 0,
      }));

      const orderRequest = await storage.createCustomerOrderRequest({
        companyName: data.companyName,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone || null,
        shippingAddress: data.shippingAddress || null,
        customerNotes: data.customerNotes || null,
        items: validatedItems,
        status: "pending",
        convertedOrderId: null,
        reviewedBy: null,
      });

      // Send email notification
      try {
        const notificationEmailSetting = await storage.getSetting("notification_email");
        if (notificationEmailSetting) {
          const recipientEmails = notificationEmailSetting
            .split(",")
            .map((e: string) => e.trim())
            .filter((e: string) => e.length > 0 && e.includes("@"));

          if (recipientEmails.length > 0) {
            const host = req.headers.host || "localhost:5000";
            const protocol = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
            const notificationRedirectUri = `${protocol}://${host}/api/outlook/callback`;

            const allUsers = await storage.getAllUsers();
            let emailSent = false;
            for (const user of allUsers) {
              if (emailSent) break;
              try {
                const accessToken = await refreshOutlookTokenIfNeeded(user.id, notificationRedirectUri);
                if (accessToken) {
                    const itemsList = validatedItems.map((item: { quantity: number; description: string; unitPrice: number; lineTotal: number }) =>
                      `<tr><td style="padding:8px;border:1px solid #ddd;">${item.quantity}</td><td style="padding:8px;border:1px solid #ddd;">${item.description}</td><td style="padding:8px;border:1px solid #ddd;">$${item.unitPrice.toFixed(2)}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">$${item.lineTotal.toFixed(2)}</td></tr>`
                    ).join("");

                    const deliveryInfo = data.shippingAddress || "";
                    const addressInfo = [data.streetAddress, data.cityStateZip].filter(Boolean).join(", ");

                    const emailBody = `
                      <h2>New Customer Order Request</h2>
                      <p><strong>Company:</strong> ${data.companyName}</p>
                      ${addressInfo ? `<p><strong>Address:</strong> ${addressInfo}</p>` : ""}
                      <p><strong>Contact:</strong> ${data.contactName}</p>
                      <p><strong>Email:</strong> ${data.contactEmail}</p>
                      ${data.contactPhone ? `<p><strong>Phone:</strong> ${data.contactPhone}</p>` : ""}
                      ${deliveryInfo ? `<p><strong>Delivery Address:</strong> ${deliveryInfo}</p>` : ""}
                      ${data.customerNotes ? `<p><strong>Notes:</strong> ${data.customerNotes}</p>` : ""}
                      <h3>Items Ordered:</h3>
                      <table style="border-collapse:collapse;width:100%;">
                        <tr><th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Qty</th><th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Description</th><th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Unit Price</th><th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;text-align:right;">Line Total</th></tr>
                        ${itemsList}
                      </table>
                      ${data.subtotal ? `<p style="margin-top:12px;text-align:right;"><strong>Subtotal:</strong> $${data.subtotal.toFixed(2)}</p>` : ""}
                      ${data.gst ? `<p style="text-align:right;"><strong>GST (10%):</strong> $${data.gst.toFixed(2)}</p>` : ""}
                      ${data.total ? `<p style="text-align:right;font-size:1.1em;"><strong>TOTAL: $${data.total.toFixed(2)}</strong></p>` : ""}
                      <p style="margin-top:16px;"><em>Log in to the CRM to review and convert this order.</em></p>
                    `;

                    await sendEmail(
                      accessToken,
                      recipientEmails,
                      `New Order Request from ${data.companyName}`,
                      emailBody
                    );
                    emailSent = true;
                }
              } catch (tokenError) {
                console.error("Notification email error for user:", user.id, tokenError);
              }
            }
            if (!emailSent) {
              console.log("No Outlook token available to send order notifications to:", recipientEmails.join(", "));
            }
          }
        }
      } catch (emailError) {
        console.error("Failed to send notification email:", emailError);
      }

      res.json({ success: true, id: orderRequest.id, message: "Your order has been submitted successfully! We will be in touch shortly." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Order request error:", error);
      res.status(500).json({ message: "Failed to submit order" });
    }
  });

  // ==================== FORMS ENDPOINTS ====================

  app.get("/api/forms", requireAuth, async (req, res) => {
    try {
      const allForms = await storage.getAllForms();
      const formsWithCounts = await Promise.all(
        allForms.map(async (form) => {
          const submissions = await storage.getFormSubmissions(form.id);
          return { ...form, submissionCount: submissions.length };
        })
      );
      res.json(formsWithCounts);
    } catch (error) {
      console.error("Error fetching forms:", error);
      res.status(500).json({ message: "Failed to fetch forms" });
    }
  });

  app.get("/api/forms/:id", requireAuth, async (req, res) => {
    try {
      const form = await storage.getForm(req.params.id);
      if (!form) return res.status(404).json({ message: "Form not found" });
      res.json(form);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch form" });
    }
  });

  app.post("/api/forms", requireEdit, async (req, res) => {
    try {
      const { name, description, status, fields, submitButtonText, successMessage, notifyEmails } = req.body;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Form name is required" });
      }
      const form = await storage.createForm({
        name,
        description: description || null,
        status: status || "draft",
        fields: fields || [],
        submitButtonText: submitButtonText || "Submit",
        successMessage: successMessage || "Thank you for your submission!",
        notifyEmails: notifyEmails || null,
        createdBy: req.session.userId,
      });
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "form",
        entityId: form.id,
        details: `Created form: ${form.name}`,
      });
      res.status(201).json(form);
    } catch (error: any) {
      console.error("Error creating form:", error?.message || error);
      res.status(500).json({ message: "Failed to create form" });
    }
  });

  app.patch("/api/forms/:id", requireEdit, async (req, res) => {
    try {
      const form = await storage.updateForm(req.params.id, req.body);
      if (!form) return res.status(404).json({ message: "Form not found" });
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "form",
        entityId: form.id,
        details: `Updated form: ${form.name}`,
      });
      res.json(form);
    } catch (error) {
      res.status(500).json({ message: "Failed to update form" });
    }
  });

  app.delete("/api/forms/:id", requireAdmin, async (req, res) => {
    try {
      const form = await storage.getForm(req.params.id);
      if (!form) return res.status(404).json({ message: "Form not found" });
      await storage.deleteForm(req.params.id);
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "delete",
        entityType: "form",
        entityId: req.params.id,
        details: `Deleted form: ${form.name}`,
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete form" });
    }
  });

  app.get("/api/forms/:id/submissions", requireAuth, async (req, res) => {
    try {
      const submissions = await storage.getFormSubmissions(req.params.id);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  app.delete("/api/forms/:formId/submissions/:id", requireEdit, async (req, res) => {
    try {
      await storage.deleteFormSubmission(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete submission" });
    }
  });

  // Public form submission endpoint (no auth required)
  app.get("/api/public/forms/:id", async (req, res) => {
    try {
      const form = await storage.getForm(req.params.id);
      if (!form || form.status !== "active") {
        return res.status(404).json({ message: "Form not found or inactive" });
      }
      res.json({
        id: form.id,
        name: form.name,
        description: form.description,
        fields: form.fields,
        submitButtonText: form.submitButtonText,
        successMessage: form.successMessage,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch form" });
    }
  });

  app.post("/api/public/forms/:id/submit", async (req, res) => {
    try {
      const form = await storage.getForm(req.params.id);
      if (!form || form.status !== "active") {
        return res.status(404).json({ message: "Form not found or inactive" });
      }
      const submission = await storage.createFormSubmission({
        formId: form.id,
        data: req.body.data || {},
        contactId: null,
        companyId: null,
      });
      res.status(201).json({ success: true, message: form.successMessage });
    } catch (error) {
      console.error("Error submitting form:", error);
      res.status(500).json({ message: "Failed to submit form" });
    }
  });

  // ==================== EMAIL-TO-ORDER WEBHOOK (PUBLIC, KEY-AUTH) ====================
  const webhookRateLimit = new Map<string, { count: number; resetAt: number }>();
  const WEBHOOK_RATE_LIMIT = 30;
  const WEBHOOK_RATE_WINDOW = 60 * 1000;

  app.post("/api/public/email-order-webhook", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const rateEntry = webhookRateLimit.get(clientIp);
      if (rateEntry && now < rateEntry.resetAt) {
        if (rateEntry.count >= WEBHOOK_RATE_LIMIT) {
          return res.status(429).json({ message: "Too many requests. Try again later." });
        }
        rateEntry.count++;
      } else {
        webhookRateLimit.set(clientIp, { count: 1, resetAt: now + WEBHOOK_RATE_WINDOW });
      }

      const authHeader = req.headers["x-webhook-secret"] || req.headers["authorization"];
      const webhookSecret = await storage.getSetting("email_order_webhook_secret");

      if (!webhookSecret) {
        return res.status(503).json({ message: "Webhook not configured" });
      }

      const providedSecret = typeof authHeader === "string" ? authHeader.replace("Bearer ", "") : "";
      if (providedSecret !== webhookSecret) {
        console.warn(`[EMAIL-WEBHOOK] Invalid secret attempt from ${clientIp}`);
        return res.status(401).json({ message: "Invalid webhook secret" });
      }

      const schema = z.object({
        subject: z.string().optional().default(""),
        body: z.string().optional().default(""),
        htmlBody: z.string().optional().default(""),
        senderEmail: z.string().optional().default(""),
        senderName: z.string().optional().default(""),
        receivedAt: z.string().optional(),
      });

      const data = schema.parse(req.body);

      const companyName = data.senderName || data.senderEmail.split("@")[0] || "Unknown";
      const contactEmail = data.senderEmail || "unknown@email.com";
      const contactName = data.senderName || data.senderEmail.split("@")[0] || "Unknown";

      let plainTextContent = data.body || "";
      if (!plainTextContent && data.htmlBody) {
        plainTextContent = data.htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }

      const customerNotes = [
        "[Forwarded Email]",
        `Subject: ${data.subject}`,
        "",
        plainTextContent || "(No text content)",
      ].join("\n");

      const orderRequest = await storage.createCustomerOrderRequest({
        companyName,
        contactName,
        contactEmail,
        contactPhone: null,
        shippingAddress: null,
        customerNotes,
        items: [{
          quantity: 1,
          description: data.subject || "Order from email",
          unitPrice: 0,
          lineTotal: 0,
        }],
        status: "pending",
        convertedOrderId: null,
        reviewedBy: null,
      });

      console.log(`[EMAIL-WEBHOOK] Order request created from email: ${data.subject} (${contactEmail})`);
      res.json({ success: true, id: orderRequest.id, message: "Order request created from email" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("[EMAIL-WEBHOOK] Error:", error?.message || error);
      res.status(500).json({ message: "Failed to process email" });
    }
  });

  app.post("/api/settings/generate-webhook-secret", requireAdmin, async (req, res) => {
    try {
      const { randomBytes } = await import("crypto");
      const secret = randomBytes(32).toString("hex");
      await storage.setSetting("email_order_webhook_secret", secret);

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "webhook_secret",
        afterJson: { action: "generated" },
      });

      res.json({ secret });
    } catch (error) {
      console.error("Generate webhook secret error:", error);
      res.status(500).json({ message: "Failed to generate webhook secret" });
    }
  });

  // ==================== CUSTOMER ORDER REQUESTS (ADMIN) ====================
  app.get("/api/customer-order-requests", requireAuth, async (_req, res) => {
    try {
      const requests = await storage.getAllCustomerOrderRequests();
      res.json(requests);
    } catch (error) {
      console.error("Get order requests error:", error);
      res.status(500).json({ message: "Failed to load order requests" });
    }
  });

  app.get("/api/customer-order-requests/:id", requireAuth, async (req, res) => {
    try {
      const request = await storage.getCustomerOrderRequest(req.params.id);
      if (!request) return res.status(404).json({ message: "Order request not found" });
      res.json(request);
    } catch (error) {
      console.error("Get order request error:", error);
      res.status(500).json({ message: "Failed to load order request" });
    }
  });

  app.patch("/api/customer-order-requests/:id", requireEdit, async (req, res) => {
    try {
      const updated = await storage.updateCustomerOrderRequest(req.params.id, {
        ...req.body,
        reviewedBy: req.session.userId,
        reviewedAt: new Date(),
      });
      if (!updated) return res.status(404).json({ message: "Order request not found" });
      res.json(updated);
    } catch (error) {
      console.error("Update order request error:", error);
      res.status(500).json({ message: "Failed to update order request" });
    }
  });

  app.post("/api/customer-order-requests/:id/convert", requireEdit, async (req, res) => {
    try {
      const orderRequest = await storage.getCustomerOrderRequest(req.params.id);
      if (!orderRequest) return res.status(404).json({ message: "Order request not found" });
      if (orderRequest.status === "converted") {
        return res.status(400).json({ message: "This order request has already been converted" });
      }

      const allCompanies = await storage.getAllCompanies();
      let company = allCompanies.find(
        (c) =>
          c.legalName.toLowerCase() === orderRequest.companyName.toLowerCase() ||
          (c.tradingName && c.tradingName.toLowerCase() === orderRequest.companyName.toLowerCase())
      );

      if (!company) {
        company = await storage.createCompany({
          legalName: orderRequest.companyName,
          shippingAddress: orderRequest.shippingAddress || undefined,
        });
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "create",
          entityType: "company",
          entityId: company.id,
          afterJson: company,
        });
      }

      const items = (orderRequest.items as any[]) || [];
      const subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.lineTotal) || 0), 0);
      const tax = Math.round(subtotal * 0.1 * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;

      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

      const order = await storage.createOrder({
        orderNumber,
        companyId: company.id,
        status: "new",
        orderDate: new Date(),
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        customerNotes: orderRequest.customerNotes || undefined,
        createdBy: req.session.userId,
      });

      for (const item of items) {
        await storage.createOrderLine({
          orderId: order.id,
          productId: item.productId || null,
          descriptionOverride: item.description || item.productName || "Item",
          quantity: item.quantity || 1,
          unitPrice: String(item.unitPrice || "0"),
          discount: "0",
          lineTotal: String(item.lineTotal || "0"),
        });
      }

      await storage.updateCustomerOrderRequest(req.params.id, {
        status: "converted",
        convertedOrderId: order.id,
        reviewedBy: req.session.userId,
        reviewedAt: new Date(),
      });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "order",
        entityId: order.id,
        afterJson: order,
      });
      await storage.createActivity({
        entityType: "order",
        entityId: order.id,
        activityType: "system",
        content: `Order created from customer order request (${orderRequest.companyName})`,
        createdBy: req.session.userId,
      });

      res.status(201).json(order);
    } catch (error) {
      console.error("Convert order request error:", error);
      res.status(500).json({ message: "Failed to convert order request" });
    }
  });

  app.post("/api/customer-order-requests/:id/unconvert", requireEdit, async (req, res) => {
    try {
      const orderRequest = await storage.getCustomerOrderRequest(req.params.id);
      if (!orderRequest) return res.status(404).json({ message: "Order request not found" });
      if (orderRequest.status !== "converted") {
        return res.status(400).json({ message: "This order request is not converted" });
      }

      const orderId = orderRequest.convertedOrderId;

      const updated = await storage.updateCustomerOrderRequest(req.params.id, {
        status: "pending",
        convertedOrderId: null,
        reviewedBy: req.session.userId,
        reviewedAt: new Date(),
      });

      if (orderId) {
        await storage.deleteOrder(orderId);
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "delete",
          entityType: "order",
          entityId: orderId,
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Unconvert order request error:", error);
      res.status(500).json({ message: "Failed to unconvert order request" });
    }
  });

  app.delete("/api/customer-order-requests/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteCustomerOrderRequest(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Order request not found" });
      res.json({ message: "Order request deleted" });
    } catch (error) {
      console.error("Delete order request error:", error);
      res.status(500).json({ message: "Failed to delete order request" });
    }
  });

  app.delete("/api/orders/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteOrder(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Order not found" });
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "delete",
        entityType: "order",
        entityId: req.params.id,
      });
      res.json({ message: "Order deleted" });
    } catch (error) {
      console.error("Delete order error:", error);
      res.status(500).json({ message: "Failed to delete order" });
    }
  });

  // ==================== CRM SETTINGS ====================
  app.get("/api/settings/:key", requireAuth, async (req, res) => {
    try {
      const value = await storage.getSetting(req.params.key);
      res.json({ key: req.params.key, value: value || "" });
    } catch (error) {
      res.status(500).json({ message: "Failed to load setting" });
    }
  });

  app.put("/api/settings/:key", requireAdmin, async (req, res) => {
    try {
      const { value } = req.body;
      await storage.setSetting(req.params.key, value);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to save setting" });
    }
  });

  // ============ CUSTOMER SUCCESS ============
  app.get("/api/customer-success/metrics", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        WITH company_orders AS (
          SELECT 
            c.id as company_id,
            c.legal_name,
            c.trading_name,
            c.client_grade,
            c.total_revenue,
            c.last_order_date,
            o.order_date,
            o.total as order_total,
            o.status,
            ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY o.order_date DESC) as rn
          FROM companies c
          LEFT JOIN orders o ON o.company_id = c.id 
            AND o.status NOT IN ('cancelled')
        ),
        order_stats AS (
          SELECT 
            company_id,
            legal_name,
            trading_name,
            client_grade,
            total_revenue,
            last_order_date,
            COUNT(order_date) as total_orders,
            MIN(order_date) as first_order_date,
            MAX(order_date) as most_recent_order,
            CASE 
              WHEN COUNT(order_date) > 1 THEN
                EXTRACT(EPOCH FROM (MAX(order_date) - MIN(order_date))) / (COUNT(order_date) - 1) / 86400
              ELSE NULL
            END as avg_days_between_orders,
            CASE 
              WHEN MAX(order_date) IS NOT NULL THEN
                EXTRACT(EPOCH FROM (NOW() - MAX(order_date))) / 86400
              ELSE NULL
            END as days_since_last_order
          FROM company_orders
          GROUP BY company_id, legal_name, trading_name, client_grade, total_revenue, last_order_date
        )
        SELECT 
          company_id,
          legal_name,
          trading_name,
          client_grade,
          total_revenue::float,
          total_orders::int,
          first_order_date,
          most_recent_order,
          ROUND(avg_days_between_orders::numeric, 1)::float as avg_days_between_orders,
          ROUND(days_since_last_order::numeric, 1)::float as days_since_last_order
        FROM order_stats
        WHERE total_orders > 0
        ORDER BY days_since_last_order DESC NULLS LAST
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching customer success metrics:", error);
      res.status(500).json({ message: "Failed to fetch customer success metrics" });
    }
  });

  app.get("/api/customer-success/inactive", requireAuth, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 60;
      const result = await pool.query(`
        SELECT 
          c.id as company_id,
          c.legal_name,
          c.trading_name,
          c.client_grade,
          c.total_revenue::float,
          c.phone,
          MAX(o.order_date) as last_order_date,
          COUNT(o.id)::int as total_orders,
          ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(o.order_date))) / 86400)::int as days_inactive
        FROM companies c
        INNER JOIN orders o ON o.company_id = c.id AND o.status NOT IN ('cancelled')
        GROUP BY c.id, c.legal_name, c.trading_name, c.client_grade, c.total_revenue, c.phone
        HAVING EXTRACT(EPOCH FROM (NOW() - MAX(o.order_date))) / 86400 >= $1
        ORDER BY MAX(o.order_date) ASC
      `, [days]);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching inactive customers:", error);
      res.status(500).json({ message: "Failed to fetch inactive customers" });
    }
  });

  app.post("/api/customer-success/send-inactivity-alert", requireAdmin, async (req, res) => {
    try {
      const days = parseInt(req.body.days as string) || 60;
      
      // Get inactive customers
      const result = await pool.query(`
        SELECT 
          c.legal_name,
          c.trading_name,
          c.client_grade,
          c.total_revenue::float as total_revenue,
          MAX(o.order_date) as last_order_date,
          ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(o.order_date))) / 86400)::int as days_inactive
        FROM companies c
        INNER JOIN orders o ON o.company_id = c.id AND o.status NOT IN ('cancelled')
        GROUP BY c.id, c.legal_name, c.trading_name, c.client_grade, c.total_revenue
        HAVING EXTRACT(EPOCH FROM (NOW() - MAX(o.order_date))) / 86400 >= $1
        ORDER BY MAX(o.order_date) ASC
      `, [days]);

      if (result.rows.length === 0) {
        return res.json({ success: true, message: "No inactive customers found", sent: false });
      }

      // Build email
      const customerRows = result.rows.map((r: any) => {
        const name = r.trading_name || r.legal_name;
        const lastOrder = r.last_order_date ? new Date(r.last_order_date).toLocaleDateString('en-AU') : 'N/A';
        const revenue = r.total_revenue ? `$${Number(r.total_revenue).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : '$0.00';
        return `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${name}</td><td style="padding:8px;border-bottom:1px solid #eee;">${r.client_grade || '-'}</td><td style="padding:8px;border-bottom:1px solid #eee;">${revenue}</td><td style="padding:8px;border-bottom:1px solid #eee;">${lastOrder}</td><td style="padding:8px;border-bottom:1px solid #eee;color:#dc2626;font-weight:600;">${r.days_inactive} days</td></tr>`;
      }).join("");

      const emailBody = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="color:#1a1a1a;">Customer Inactivity Alert</h2>
          <p style="color:#666;">The following <strong>${result.rows.length}</strong> customer(s) have not placed an order in <strong>${days}+ days</strong>. Consider reaching out to re-engage them.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <thead>
              <tr style="background:#f8f8f8;">
                <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Customer</th>
                <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Grade</th>
                <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Revenue</th>
                <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Last Order</th>
                <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Inactive</th>
              </tr>
            </thead>
            <tbody>${customerRows}</tbody>
          </table>
          <p style="color:#888;margin-top:20px;font-size:12px;">Sent from Purax CRM - Customer Success</p>
        </div>
      `;

      // Try to send via Outlook
      const redirectUri = "https://puraxfeatherholdingscrm.replit.app/api/outlook/callback";
      const allTokens = await pool.query("SELECT user_id FROM outlook_tokens LIMIT 1");
      if (allTokens.rows.length === 0) {
        return res.json({ success: false, message: "Outlook not connected. Please connect Outlook in Settings to send email alerts." });
      }

      const tokenUserId = allTokens.rows[0].user_id;
      const accessToken = await refreshOutlookTokenIfNeeded(tokenUserId, redirectUri);
      if (!accessToken) {
        return res.json({ success: false, message: "Outlook token expired. Please reconnect Outlook." });
      }

      const recipients = ["helena@purax.com.au", "michele@purax.com.au"];
      await sendEmail(
        accessToken,
        recipients,
        `Customer Inactivity Alert - ${result.rows.length} customer(s) inactive ${days}+ days`,
        emailBody
      );

      res.json({ success: true, message: `Alert sent to ${recipients.join(", ")} for ${result.rows.length} inactive customer(s)`, sent: true });
    } catch (error) {
      console.error("Error sending inactivity alert:", error);
      res.status(500).json({ message: "Failed to send inactivity alert" });
    }
  });

  registerChatRoutes(app);

  return httpServer;
}
