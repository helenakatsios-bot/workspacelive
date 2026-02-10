import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool, db } from "./db";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { loginSchema, insertCompanySchema, insertContactSchema, insertDealSchema, insertProductSchema, insertOrderSchema, insertOrderLineSchema, insertActivitySchema, emails as emailsTable } from "@shared/schema";
import { createXeroClient, getStoredToken, saveXeroToken, deleteXeroToken, refreshTokenIfNeeded, importContactsFromXero, syncInvoiceToXero, importInvoicesFromXero } from "./xero";
import { getOutlookAuthUrl, exchangeCodeForTokens, getStoredOutlookToken, saveOutlookToken, deleteOutlookToken, refreshOutlookTokenIfNeeded, syncEmailsToDatabase, sendEmail, replyToEmail, getEmailsForCompany, getEmailsForContact, getAllEmails } from "./outlook";

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

      const { generateOrderPdf } = await import("./pdf");
      const pdfBuffer = await generateOrderPdf({
        order,
        company,
        contact,
        lines: linesWithProducts,
      });

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
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/xero/callback`;
      
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
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/xero/callback`;
      
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
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/xero/callback`;
      
      const xero = createXeroClient(redirectUri);
      const refreshed = await refreshTokenIfNeeded(xero, token);
      
      if (!refreshed) {
        return res.status(401).json({ message: "Xero token expired, please reconnect" });
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
    } catch (error) {
      console.error("Xero import contacts error:", error);
      res.status(500).json({ message: "Failed to import contacts from Xero" });
    }
  });

  app.post("/api/xero/import-invoices", requireAdmin, async (req, res) => {
    try {
      const token = await getStoredToken();
      if (!token) {
        return res.status(400).json({ message: "Xero not connected" });
      }
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/xero/callback`;
      
      const xero = createXeroClient(redirectUri);
      const refreshed = await refreshTokenIfNeeded(xero, token);
      
      if (!refreshed) {
        return res.status(401).json({ message: "Xero token expired, please reconnect" });
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
      console.error("Xero import invoices error:", error);
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
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/xero/callback`;
      
      const xero = createXeroClient(redirectUri);
      const refreshed = await refreshTokenIfNeeded(xero, token);
      
      if (!refreshed) {
        return res.status(401).json({ message: "Xero token expired, please reconnect" });
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

  // Sync emails from Outlook
  app.post("/api/outlook/sync", requireAuth, async (req, res) => {
    try {
      const { folder = "inbox" } = req.body;
      
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/outlook/callback`;
      
      const accessToken = await refreshOutlookTokenIfNeeded(req.session.userId!, redirectUri);
      if (!accessToken) {
        return res.status(401).json({ message: "Outlook not connected or token expired" });
      }
      
      const synced = await syncEmailsToDatabase(req.session.userId!, accessToken, folder);
      
      res.json({ success: true, synced });
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

      const orderNumMatch = subject.match(/Order\s*#(\d+)/i);
      const shopifyOrderNum = orderNumMatch ? orderNumMatch[1] : null;

      const nameMatch = subject.match(/placed by\s+(.+)/i);
      const customerName = nameMatch ? nameMatch[1].trim() : "";

      // Extract customer details from email HTML body
      const bodyHtml = email.bodyHtml || "";
      const plainText = bodyHtml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

      let customerPhone = "";
      let customerAddress = "";
      let deliveryMethodVal = "";
      let paymentMethodVal = "";

      // Extract payment processing method
      const paymentMatch = plainText.match(/Payment processing method\s+(.+?)(?=Delivery method|Shipping address|Billing address|$)/i);
      if (paymentMatch) paymentMethodVal = paymentMatch[1].trim();

      // Extract delivery method
      const deliveryMatch = plainText.match(/Delivery method\s+(.+?)(?=Shipping address|Billing address|Payment processing|$)/i);
      if (deliveryMatch) deliveryMethodVal = deliveryMatch[1].trim();

      // Extract shipping address block
      const shippingAddrMatch = plainText.match(/Shipping address\s+(.+?)(?=Billing address|$)/i);
      if (shippingAddrMatch) {
        let addrBlock = shippingAddrMatch[1].trim();
        // Remove the Shopify footer address (Ottawa, ON)
        addrBlock = addrBlock.replace(/\d+\s+O'Connor\s+Street.*$/i, "").trim();
        // Extract phone number (Australian or international format)
        const phoneMatch = addrBlock.match(/(\+?\d[\d\s\-]{8,})/);
        if (phoneMatch) {
          customerPhone = phoneMatch[1].trim();
          addrBlock = addrBlock.replace(phoneMatch[0], "").trim();
        }
        // Remove customer name from address if it's the first part
        if (customerName && addrBlock.toLowerCase().startsWith(customerName.toLowerCase())) {
          addrBlock = addrBlock.substring(customerName.length).trim();
        }
        customerAddress = addrBlock;
      }

      const lines: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }> = [];

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
            lines.push({
              description: currentProduct,
              quantity: currentQty,
              unitPrice: currentPrice,
              lineTotal,
            });
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
          lines.push({
            description: currentProduct,
            quantity: currentQty,
            unitPrice: currentPrice,
            lineTotal: currentPrice * currentQty,
          });
        }
      }

      const subtotalMatch = preview.match(/Subtotal\s*\$([0-9,.]+)/);
      const shippingMatch = preview.match(/Shipping\s*\([^)]*\)\s*\$([0-9,.]+)/);
      const totalMatch = preview.match(/Total\s*\$([0-9,.]+)/);

      const subtotal = subtotalMatch ? parseFloat(subtotalMatch[1].replace(",", "")) : lines.reduce((s, l) => s + l.lineTotal, 0);
      const shipping = shippingMatch ? parseFloat(shippingMatch[1].replace(",", "")) : 0;
      const total = totalMatch ? parseFloat(totalMatch[1].replace(",", "")) : subtotal + shipping;

      const allCompanies = await storage.getAllCompanies();
      let company = allCompanies.find(
        (c) => c.legalName.toLowerCase().includes("puradown") ||
               (c.tradingName && c.tradingName.toLowerCase().includes("puradown"))
      );

      if (!company) {
        const firstNamePart = customerName.split(" ")[0] || "Customer";
        company = allCompanies.find(
          (c) => c.legalName.toLowerCase().includes(firstNamePart.toLowerCase())
        );
      }

      if (!company) {
        company = await storage.createCompany({
          legalName: customerName || "Puradown Customer",
        });
      }

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
        deliveryMethod: deliveryMethodVal || null,
        paymentMethod: paymentMethodVal || null,
        sourceEmailId: emailId,
        customerNotes: `Converted from Puradown email. Customer: ${customerName}. Shipping: $${shipping.toFixed(2)}`,
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
        content: `Order created from Puradown email (${subject})`,
        createdBy: req.session.userId,
      });

      res.status(201).json(order);
    } catch (error) {
      console.error("Convert email to order error:", error);
      res.status(500).json({ message: "Failed to convert email to order" });
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

  return httpServer;
}
