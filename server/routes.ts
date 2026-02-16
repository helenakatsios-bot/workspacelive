import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool, db } from "./db";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq, ilike, and } from "drizzle-orm";
import { loginSchema, insertCompanySchema, insertContactSchema, insertDealSchema, insertProductSchema, insertOrderSchema, insertOrderLineSchema, insertActivitySchema, emails as emailsTable, contacts, outlookTokens as outlookTokensTable, crmSettings, portalUsers, attachments } from "@shared/schema";
import { registerChatRoutes } from "./replit_integrations/chat";
import { createXeroClient, getStoredToken, saveXeroToken, deleteXeroToken, refreshTokenIfNeeded, importContactsFromXero, syncInvoiceToXero, importInvoicesFromXero, autoSyncXeroInvoices } from "./xero";
import { getOutlookAuthUrl, exchangeCodeForTokens, getStoredOutlookToken, saveOutlookToken, deleteOutlookToken, refreshOutlookTokenIfNeeded, syncEmailsToDatabase, sendEmail, replyToEmail, getEmailsForCompany, getEmailsForContact, getAllEmails, backfillEmailCompanyLinks, fetchEmailAttachments, downloadAttachment } from "./outlook";

declare module "express-session" {
  interface SessionData {
    userId: string;
    portalUserId?: string;
    portalCompanyId?: string;
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

  // ==================== DOWNLOAD ROUTES ====================
  app.get("/api/download/price-template", requireAuth, async (_req, res) => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.join(process.cwd(), "client/public/product-price-template.csv");
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=product-price-template.csv");
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      } else {
        res.status(404).json({ message: "Template file not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to download template" });
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

  app.post("/api/companies/bulk-delete", requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required" });
      }

      const results: { deleted: string[]; skipped: { id: string; name: string; reason: string }[] } = { deleted: [], skipped: [] };

      for (const id of ids) {
        try {
          const company = await storage.getCompany(id);
          if (!company) {
            results.skipped.push({ id, name: "Unknown", reason: "Not found" });
            continue;
          }
          const counts = await storage.getCompanyRelatedCounts(id);
          const nonContactRelated = counts.deals + counts.orders + counts.quotes + counts.invoices;
          if (nonContactRelated > 0) {
            results.skipped.push({
              id,
              name: company.tradingName || company.legalName,
              reason: `Has ${[
                counts.deals > 0 ? `${counts.deals} deal(s)` : "",
                counts.orders > 0 ? `${counts.orders} order(s)` : "",
                counts.quotes > 0 ? `${counts.quotes} quote(s)` : "",
                counts.invoices > 0 ? `${counts.invoices} invoice(s)` : "",
              ].filter(Boolean).join(", ")}`,
            });
            continue;
          }
          if (counts.contacts > 0) {
            await db.delete(contacts).where(eq(contacts.companyId, id));
          }
          await db.delete(portalUsers).where(eq(portalUsers.companyId, id));
          await db.update(emailsTable).set({ companyId: null }).where(eq(emailsTable.companyId, id));
          const deleted = await storage.deleteCompany(id);
          if (deleted) {
            await storage.createAuditLog({
              userId: req.session.userId,
              action: "delete",
              entityType: "company",
              entityId: id,
              beforeJson: company,
            });
            results.deleted.push(id);
          } else {
            results.skipped.push({ id, name: company.tradingName || company.legalName, reason: "Delete failed" });
          }
        } catch (err) {
          results.skipped.push({ id, name: "Unknown", reason: "Error during deletion" });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Bulk delete companies error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/companies/deduplicate", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        DELETE FROM companies
        WHERE id IN (
          SELECT id FROM (
            SELECT id, legal_name, trading_name, created_at,
              ROW_NUMBER() OVER (PARTITION BY legal_name, trading_name ORDER BY created_at ASC) as rn
            FROM companies
          ) ranked
          WHERE rn > 1
        )
      `);
      res.json({ message: "Duplicates removed", deleted: result.rowCount });
    } catch (error) {
      console.error("Deduplicate error:", error);
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

  app.get("/api/companies/:id/invoices", requireAuth, async (req, res) => {
    try {
      const companyInvoices = await storage.getCompanyInvoices(req.params.id);
      res.json(companyInvoices);
    } catch (error) {
      console.error("Get company invoices error:", error);
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
      const nonContactRelated = counts.deals + counts.orders + counts.quotes + counts.invoices;
      if (nonContactRelated > 0) {
        return res.status(400).json({
          message: "Cannot delete company with related records. Remove all deals, orders, quotes, and invoices first.",
          counts,
        });
      }
      if (counts.contacts > 0) {
        await db.delete(contacts).where(eq(contacts.companyId, req.params.id));
      }
      await db.delete(portalUsers).where(eq(portalUsers.companyId, req.params.id));
      await db.update(emailsTable).set({ companyId: null }).where(eq(emailsTable.companyId, req.params.id));
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

  // ==================== COMPANY PRICES ROUTES ====================
  app.get("/api/companies/:id/prices", requireAuth, async (req, res) => {
    try {
      const prices = await storage.getCompanyPrices(req.params.id);
      res.json(prices);
    } catch (error) {
      console.error("Get company prices error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/companies/:id/prices", requireEdit, async (req, res) => {
    try {
      const { productId, unitPrice } = req.body;
      if (!productId || unitPrice === undefined) {
        return res.status(400).json({ message: "productId and unitPrice are required" });
      }
      const price = await storage.setCompanyPrice(req.params.id, productId, unitPrice);
      res.json(price);
    } catch (error) {
      console.error("Set company price error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/companies/:id/prices/:productId", requireEdit, async (req, res) => {
    try {
      await storage.deleteCompanyPrice(req.params.id, req.params.productId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete company price error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/prices/export", requireAuth, async (req, res) => {
    try {
      const allProducts = await storage.getAllProducts();
      const companyPrices = await storage.getCompanyPrices(req.params.id);
      const priceMap = new Map(companyPrices.map(cp => [cp.productId, cp.unitPrice]));
      const activeProducts = allProducts.filter(p => p.active);
      const esc = (s: string) => '"' + String(s).replace(/"/g, '""') + '"';
      let csv = "Product Name,SKU,Category,Default Price,Customer Price\n";
      for (const p of activeProducts) {
        const customPrice = priceMap.get(p.id) || "";
        csv += `${esc(p.name)},${esc(p.sku)},${esc(p.category || "")},${esc(p.unitPrice)},${esc(customPrice)}\n`;
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="company-prices.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Export prices error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/companies/:id/prices/bulk", requireEdit, async (req, res) => {
    try {
      const { prices } = req.body;
      if (!Array.isArray(prices)) {
        return res.status(400).json({ message: "prices array is required" });
      }
      const allProducts = await storage.getAllProducts();
      const skuMap = new Map(allProducts.map(p => [p.sku.toLowerCase(), p.id]));
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const item of prices) {
        const sku = (item.sku || "").trim().toLowerCase();
        const price = parseFloat(item.price);
        if (!sku || isNaN(price) || price <= 0) {
          skipped++;
          continue;
        }
        const productId = skuMap.get(sku);
        if (!productId) {
          errors.push(`SKU not found: ${item.sku}`);
          skipped++;
          continue;
        }
        try {
          await storage.setCompanyPrice(req.params.id, productId, String(price));
          imported++;
        } catch (err: any) {
          errors.push(`Error setting price for ${item.sku}: ${err.message}`);
        }
      }
      res.json({ imported, skipped, errors: errors.slice(0, 20) });
    } catch (error) {
      console.error("Bulk price import error:", error);
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

  app.post("/api/contacts/bulk-delete", requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required" });
      }

      const results: { deleted: string[]; skipped: { id: string; name: string; reason: string }[] } = { deleted: [], skipped: [] };

      for (const id of ids) {
        try {
          const contact = await storage.getContact(id);
          if (!contact) {
            results.skipped.push({ id, name: "Unknown", reason: "Not found" });
            continue;
          }
          const deleted = await storage.deleteContact(id);
          if (deleted) {
            await storage.createAuditLog({
              userId: req.session.userId,
              action: "delete",
              entityType: "contact",
              entityId: id,
              beforeJson: contact,
              afterJson: null,
            });
            results.deleted.push(id);
          } else {
            results.skipped.push({ id, name: `${contact.firstName} ${contact.lastName}`, reason: "Delete failed" });
          }
        } catch (err: any) {
          results.skipped.push({ id, name: "Unknown", reason: err?.message || "Error" });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Bulk delete contacts error:", error);
      res.status(500).json({ message: "Failed to bulk delete contacts" });
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

  app.get("/api/attachments/:id/download", requireAuth, async (req, res) => {
    try {
      const [attachment] = await db.select().from(attachments).where(eq(attachments.id, req.params.id));
      if (!attachment) return res.status(404).json({ message: "Attachment not found" });
      const fs = await import("fs");
      if (!fs.existsSync(attachment.storagePath)) {
        return res.status(404).json({ message: "File not found on disk" });
      }
      res.setHeader("Content-Type", attachment.fileType);
      res.setHeader("Content-Disposition", `attachment; filename="${attachment.fileName}"`);
      const fileStream = fs.createReadStream(attachment.storagePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Download attachment error:", error);
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
      const updateData = { ...req.body };
      if (updateData.orderDate !== undefined) {
        if (typeof updateData.orderDate === "string" && updateData.orderDate) {
          updateData.orderDate = new Date(updateData.orderDate);
        } else if (!updateData.orderDate) {
          delete updateData.orderDate;
        }
      }
      if (updateData.requestedShipDate !== undefined) {
        if (typeof updateData.requestedShipDate === "string" && updateData.requestedShipDate) {
          updateData.requestedShipDate = new Date(updateData.requestedShipDate);
        } else if (updateData.requestedShipDate === null || updateData.requestedShipDate === "") {
          updateData.requestedShipDate = null;
        }
      }
      const order = await storage.updateOrder(req.params.id, updateData);
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

  app.put("/api/orders/:id/lines", requireEdit, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      const { lines } = req.body;
      if (!Array.isArray(lines)) {
        return res.status(400).json({ message: "Lines must be an array" });
      }
      await storage.deleteOrderLinesByOrderId(req.params.id);
      const createdLines = [];
      for (const line of lines) {
        const created = await storage.createOrderLine({
          orderId: req.params.id,
          productId: line.productId || null,
          descriptionOverride: line.descriptionOverride || line.productName || "",
          quantity: line.quantity || 1,
          unitPrice: String(line.unitPrice || "0"),
          discount: String(line.discount || "0"),
          lineTotal: String(line.lineTotal || "0"),
        });
        createdLines.push(created);
      }
      const subtotal = createdLines.reduce((sum, l) => sum + parseFloat(String(l.lineTotal || "0")), 0);
      const tax = subtotal * 0.1;
      const total = subtotal + tax;
      await storage.updateOrder(req.params.id, {
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
      });
      recalcCompanyRevenue(order.companyId);
      res.json(createdLines);
    } catch (error) {
      console.error("Update order lines error:", error);
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

      // Always generate a clean, professional PDF from order data for Purax
      const { generateOrderPdf } = await import("./pdf");
      const pdfBuffer = await generateOrderPdf({
        order,
        company,
        contact,
        lines: linesWithProducts,
      });

      let orderDetailsText = linesWithProducts.map(line =>
        `${line.quantity}x ${line.productName} @ $${line.unitPrice} = $${line.lineTotal}`
      ).join("\n");

      if (!orderDetailsText && originalEmailHtml) {
        const emailPlainText = originalEmailHtml
          .replace(/<[^>]+>/g, "\n")
          .replace(/&nbsp;/g, " ")
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim();
        const summaryStart = emailPlainText.indexOf("Order summary");
        const subtotalStart = emailPlainText.indexOf("Subtotal");
        if (summaryStart !== -1 && subtotalStart !== -1) {
          orderDetailsText = emailPlainText.substring(summaryStart, subtotalStart + 100)
            .split("\n").filter((l: string) => l.trim()).join("\n");
        }
      }

      const customerName = order.customerName
        || (contact ? `${contact.firstName} ${contact.lastName}`.trim() : "")
        || order.customerNotes?.match(/Customer:\s*([^.]+)/)?.[1]?.trim() || "";

      const customerAddress = order.customerAddress || company?.shippingAddress || company?.billingAddress || "";

      const customerDetails = customerName
        ? `${order.orderNumber} ${customerName}`
        : order.orderNumber;

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
      console.log(`[PURAX-SYNC] Order lines: ${linesWithProducts.length}`);
      for (const l of linesWithProducts) {
        console.log(`[PURAX-SYNC]   - ${l.quantity}x "${l.productName}" @ $${l.unitPrice} = $${l.lineTotal}`);
      }
      console.log(`[PURAX-SYNC] Customer: ${webhookPayload.customerName}, Company: ${webhookPayload.companyName}`);
      console.log(`[PURAX-SYNC] PDF size: ${pdfBuffer.length} bytes, orderDetails length: ${orderDetailsText.length}`);

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
      
      const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
      req.session.xeroState = state;
      
      await db.insert(crmSettings).values({
        key: `xero_oauth_state_${state}`,
        value: JSON.stringify({ userId: req.session.userId, createdAt: Date.now() }),
      }).onConflictDoUpdate({
        target: crmSettings.key,
        set: { value: JSON.stringify({ userId: req.session.userId, createdAt: Date.now() }) },
      });
      
      const xero = createXeroClient(redirectUri);
      const consentUrl = await xero.buildConsentUrl() + `&state=${encodeURIComponent(state)}`;
      
      res.json({ url: consentUrl });
    } catch (error) {
      console.error("Xero auth URL error:", error);
      res.status(500).json({ message: "Failed to generate Xero authorization URL" });
    }
  });

  // Xero OAuth callback
  app.get("/api/xero/callback", async (req, res) => {
    try {
      const returnedState = req.query.state as string | undefined;
      const code = req.query.code as string | undefined;
      
      console.log("Xero callback hit - code:", !!code, "state:", !!returnedState);
      
      if (!code) {
        console.error("Xero callback: no authorization code received");
        return res.redirect("/admin?xero=error&reason=no_code");
      }
      
      let userId: string | undefined = req.session.userId;
      
      if (returnedState) {
        const [stateRecord] = await db.select().from(crmSettings)
          .where(eq(crmSettings.key, `xero_oauth_state_${returnedState}`));
        
        if (stateRecord) {
          const stateData = JSON.parse(stateRecord.value || "{}");
          userId = userId || stateData.userId;
          
          const stateAge = Date.now() - (stateData.createdAt || 0);
          if (stateAge > 10 * 60 * 1000) {
            console.error("Xero callback: state expired (age:", stateAge, "ms)");
            await db.delete(crmSettings).where(eq(crmSettings.key, `xero_oauth_state_${returnedState}`));
            return res.redirect("/admin?xero=error&reason=state_expired");
          }
          
          await db.delete(crmSettings).where(eq(crmSettings.key, `xero_oauth_state_${returnedState}`));
        } else {
          console.error("Xero callback: state not found in database");
        }
      }
      
      if (!userId) {
        console.error("Xero callback: no user identified");
        return res.redirect("/admin?xero=error&reason=not_authenticated");
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.redirect("/admin?xero=error&reason=not_admin");
      }
      
      const baseUrl = process.env.APP_URL || `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers["x-forwarded-host"] || req.headers.host}`;
      const redirectUri = `${baseUrl}/api/xero/callback`;
      
      const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }).toString(),
      });
      
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Xero token exchange failed:", errorText);
        return res.redirect("/admin?xero=error&reason=token_exchange_failed");
      }
      
      const tokenData = await tokenResponse.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        token_type: string;
      };
      
      const connectionsResponse = await fetch("https://api.xero.com/connections", {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!connectionsResponse.ok) {
        console.error("Failed to get Xero connections:", await connectionsResponse.text());
        return res.redirect("/admin?xero=error&reason=connections_failed");
      }
      
      const connections = await connectionsResponse.json() as Array<{ tenantId: string; tenantName?: string; tenantType?: string }>;
      const activeTenant = connections[0];
      
      if (activeTenant && tokenData.access_token && tokenData.refresh_token) {
        await saveXeroToken(
          activeTenant.tenantId,
          activeTenant.tenantName || "Xero Organisation",
          tokenData.access_token,
          tokenData.refresh_token,
          new Date(Date.now() + tokenData.expires_in * 1000)
        );
        
        await storage.createAuditLog({
          userId,
          action: "create",
          entityType: "xero_connection",
        });
        
        console.log("Xero connected successfully for tenant:", activeTenant.tenantName);
        res.redirect("/admin?xero=connected");
      } else {
        console.error("Xero callback: missing tenant or tokens");
        res.redirect("/admin?xero=error&reason=no_tenant");
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
      const currentUserId = req.session.userId!;
      if (companyId) {
        emailList = await getEmailsForCompany(companyId as string, parseInt(limit as string), currentUserId);
      } else if (contactId) {
        emailList = await getEmailsForContact(contactId as string, parseInt(limit as string), currentUserId);
      } else {
        emailList = await getAllEmails(req.session.userId!, folder as string | undefined, parseInt(limit as string));
      }
      
      res.json(emailList);
    } catch (error) {
      console.error("Get emails error:", error);
      res.status(500).json({ message: "Failed to get emails" });
    }
  });

  app.patch("/api/emails/:id/converted", requireEdit, async (req, res) => {
    try {
      const { converted } = req.body;
      await db.update(emailsTable).set({ isConverted: !!converted }).where(eq(emailsTable.id, req.params.id));
      res.json({ message: "Email updated" });
    } catch (error) {
      console.error("Toggle email converted error:", error);
      res.status(500).json({ message: "Failed to update email" });
    }
  });

  app.patch("/api/emails/:id/reviewed", requireAuth, async (req, res) => {
    try {
      const { reviewed } = req.body;
      await db.update(emailsTable).set({ isReviewed: !!reviewed }).where(eq(emailsTable.id, req.params.id));
      res.json({ message: "Email updated" });
    } catch (error) {
      console.error("Toggle email reviewed error:", error);
      res.status(500).json({ message: "Failed to update email" });
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

      const isShopifyEmail = /Order\s*#\d+/i.test(subject) && (/placed by/i.test(subject) || /placed\s+(a new\s+)?order/i.test(subject));
      const isForwardedShopify = /^(fw|fwd):/i.test(subject) && /Order\s*#\d+/i.test(subject);

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

      // Use AI to parse order details from ANY email type
      const parseOrderWithAI = async (emailText: string, emailSubject: string, rawHtml?: string): Promise<{
        customerName?: string; customerPhone?: string; customerAddress?: string; customerEmail?: string;
        orderNumber?: string; lines: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>;
        subtotal?: number; shipping?: number; total?: number;
      }> => {
        try {
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI({
            apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          });

          let contentToAnalyze = `Subject: ${emailSubject}\n\nEmail body (plain text):\n${emailText.substring(0, 6000)}`;
          if (rawHtml) {
            const cleanHtml = rawHtml
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/\s+/g, " ")
              .substring(0, 6000);
            contentToAnalyze += `\n\nEmail body (HTML structure for reference):\n${cleanHtml}`;
          }

          console.log("[EMAIL-TO-ORDER] AI input length:", contentToAnalyze.length, "chars");

          const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are an order extraction assistant for a wholesale bedding/feather product company (Purax/Puradown). Extract ALL order line items from emails.

CRITICAL RULES:
- You MUST extract EVERY product line item. This is the most important task.
- Extract the FULL product name including brand, material, and type (e.g., "80% Goose Down Pillow" not just "Pillow")
- Include size/variant info as part of the description using " - " separator (e.g., "80% Goose Down Pillow - Queen / Standard / Cotton Japara")
- Look for product info in table structures, "Order summary" sections, product lists, or any mention of items with quantities
- For forwarded Shopify emails: products are often in HTML tables with "$price x quantity" format. Look carefully at the HTML structure.
- Do NOT include SKU numbers in descriptions
- Do NOT include discount codes or discount amounts in descriptions
- Extract the actual/discounted unit price (not the original price before discount)
- If no price is available, use 0
- For Shopify/Puradown order emails: extract from the "Order summary" section
- For B2B order emails: extract product names and quantities from the email body
- Also extract: customerName, customerPhone, customerAddress, customerEmail, subtotal, shipping, total
- Return valid JSON with this structure: { "lines": [{"description": "...", "quantity": 1, "unitPrice": 0, "lineTotal": 0}], "customerName": "", "customerPhone": "", "customerAddress": "", "customerEmail": "", "subtotal": 0, "shipping": 0, "total": 0 }
- Return valid JSON only, no markdown`
              },
              {
                role: "user",
                content: contentToAnalyze
              }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
          });
          const content = aiResponse.choices[0]?.message?.content || "{}";
          console.log("[EMAIL-TO-ORDER] AI raw response:", content.substring(0, 1000));
          const parsed = JSON.parse(content);
          const extractedLines = (parsed.lines || parsed.items || parsed.orderLines || parsed.order_lines || []).map((l: any) => ({
            description: l.description || l.product || l.name || l.productName || "",
            quantity: parseInt(l.quantity || l.qty || 1) || 1,
            unitPrice: parseFloat(l.unitPrice || l.unit_price || l.price || 0) || 0,
            lineTotal: parseFloat(l.lineTotal || l.line_total || l.total || 0) || 0,
          })).filter((l: any) => l.description);
          console.log(`[EMAIL-TO-ORDER] AI extracted ${extractedLines.length} line items`);
          for (const l of extractedLines) {
            console.log(`[EMAIL-TO-ORDER]   - ${l.quantity}x "${l.description}" @ $${l.unitPrice} = $${l.lineTotal}`);
          }
          return {
            customerName: parsed.customerName || parsed.customer_name || "",
            customerPhone: parsed.customerPhone || parsed.customer_phone || "",
            customerAddress: parsed.customerAddress || parsed.customer_address || parsed.shippingAddress || parsed.shipping_address || parsed.deliveryAddress || "",
            customerEmail: parsed.customerEmail || parsed.customer_email || "",
            orderNumber: parsed.orderNumber || parsed.order_number || "",
            lines: extractedLines,
            subtotal: parseFloat(parsed.subtotal || 0) || 0,
            shipping: parseFloat(parsed.shipping || 0) || 0,
            total: parseFloat(parsed.total || 0) || 0,
          };
        } catch (aiError) {
          console.error("[EMAIL-TO-ORDER] AI parsing failed:", aiError);
          return { lines: [] };
        }
      };

      // --- SHOPIFY DIRECT EMAIL (has order-list CSS classes) ---
      if (isShopifyEmail && !isForwardedShopify) {
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

        // Parse products directly from HTML using Shopify CSS classes
        const itemTitleRegex = /order-list__item-title[^>]*>([^<]+)</g;
        const itemVariantRegex = /order-list__item-variant[^>]*>([^<]+)</g;
        const itemPriceRegex = /order-list__item-price[^>]*>\s*\$([0-9,.]+)/g;
        const priceQtyRegex = /\$\s*([0-9,.]+)\s*[×x]\s*(\d+)/g;

        const productNames: string[] = [];
        const productVariants: string[] = [];
        const productPrices: number[] = [];
        const productQtys: number[] = [];
        const productUnitPrices: number[] = [];

        let titleMatch;
        while ((titleMatch = itemTitleRegex.exec(bodyHtml)) !== null) {
          productNames.push(titleMatch[1].trim());
        }
        let variantMatch;
        while ((variantMatch = itemVariantRegex.exec(bodyHtml)) !== null) {
          productVariants.push(variantMatch[1].trim());
        }
        let priceMatch;
        while ((priceMatch = itemPriceRegex.exec(bodyHtml)) !== null) {
          productPrices.push(parseFloat(priceMatch[1].replace(",", "")));
        }
        let pqMatch;
        while ((pqMatch = priceQtyRegex.exec(bodyHtml)) !== null) {
          productUnitPrices.push(parseFloat(pqMatch[1].replace(",", "")));
          productQtys.push(parseInt(pqMatch[2]));
        }

        for (let i = 0; i < productNames.length; i++) {
          const name = productNames[i];
          const variant = productVariants[i] || "";
          const lineTotal = productPrices[i] || 0;
          const qty = productQtys[i] || 1;
          const unitPrice = productUnitPrices[i] || (qty > 0 ? lineTotal / qty : lineTotal);
          const fullDescription = variant ? `${name} - ${variant}` : name;
          lines.push({ description: fullDescription, quantity: qty, unitPrice, lineTotal });
        }

        // Fallback to AI if HTML regex found nothing
        if (lines.length === 0) {
          console.log("[EMAIL-TO-ORDER] Shopify HTML regex found no products, falling back to AI with HTML");
          const aiResult = await parseOrderWithAI(plainText, subject, bodyHtml);
          lines.push(...aiResult.lines);
        } else {
          console.log(`[EMAIL-TO-ORDER] Shopify HTML regex found ${lines.length} products`);
        }

        const fullText = plainText;
        const subtotalMatch = fullText.match(/Subtotal\s*\$\s*([0-9,.]+)/);
        const shippingMatch = fullText.match(/Shipping\s*(?:\([^)]*\))?\s*\$\s*([0-9,.]+)/);
        const totalMatch = fullText.match(/Total\s*\$\s*([0-9,.]+)/);
        subtotal = subtotalMatch ? parseFloat(subtotalMatch[1].replace(",", "")) : lines.reduce((s, l) => s + l.lineTotal, 0);
        shipping = shippingMatch ? parseFloat(shippingMatch[1].replace(",", "")) : 0;
        total = totalMatch ? parseFloat(totalMatch[1].replace(",", "")) : subtotal + shipping;
      } else {
        // --- ALL OTHER EMAILS (B2B, forwarded Shopify, etc.) - use AI ---
        customerEmail = realSenderEmail || email.fromAddress || "";
        customerName = realSenderName || "";

        // Check if this is a forwarded Shopify email
        if (isForwardedShopify) {
          const orderNumMatch = subject.match(/Order\s*#(\d+)/i);
          shopifyOrderNum = orderNumMatch ? orderNumMatch[1] : null;
          const nameMatch = subject.match(/placed by\s+(.+)/i);
          if (nameMatch) customerName = nameMatch[1].trim();
        }

        // Use AI to extract order details - pass both plain text AND HTML for better parsing
        console.log("[EMAIL-TO-ORDER] Using AI to parse email order details");
        console.log("[EMAIL-TO-ORDER] Email type:", isForwardedShopify ? "Forwarded Shopify" : "B2B/Other");
        console.log("[EMAIL-TO-ORDER] Subject:", subject);
        console.log("[EMAIL-TO-ORDER] Plain text length:", plainText.length, "HTML length:", bodyHtml.length);
        const aiResult = await parseOrderWithAI(plainText, subject, bodyHtml);
        lines.push(...aiResult.lines);
        if (aiResult.customerName && !customerName) customerName = aiResult.customerName;
        if (aiResult.customerPhone) customerPhone = aiResult.customerPhone;
        if (aiResult.customerAddress) customerAddress = aiResult.customerAddress;
        if (aiResult.customerEmail && !customerEmail) customerEmail = aiResult.customerEmail;
        subtotal = aiResult.subtotal || lines.reduce((s, l) => s + l.lineTotal, 0);
        shipping = aiResult.shipping || 0;
        total = aiResult.total || subtotal + shipping;

        // Also extract totals from forwarded Shopify emails via regex
        if (isForwardedShopify) {
          const fullText = plainText;
          const subtotalMatch = fullText.match(/Subtotal\s*\$\s*([0-9,.]+)/);
          const shippingMatch = fullText.match(/Shipping\s*(?:\([^)]*\))?\s*\$\s*([0-9,.]+)/);
          const totalMatch = fullText.match(/Total\s*\$\s*([0-9,.]+)/);
          if (subtotalMatch) subtotal = parseFloat(subtotalMatch[1].replace(",", ""));
          if (shippingMatch) shipping = parseFloat(shippingMatch[1].replace(",", ""));
          if (totalMatch) total = parseFloat(totalMatch[1].replace(",", ""));
        }
      }

      // Validate: ALL emails must have at least one parsed order line
      // (forwarded Shopify emails also need items - they go through AI parsing)
      if (lines.length === 0) {
        console.error("[EMAIL-TO-ORDER] No order lines extracted. Subject:", subject, "isShopify:", isShopifyEmail, "isForwarded:", isForwardedShopify);
        return res.status(400).json({ 
          error: "No order lines could be parsed from this email. The AI could not extract any products. Please check the email content or create the order manually." 
        });
      }
      console.log(`[EMAIL-TO-ORDER] Successfully extracted ${lines.length} order lines`);

      // Match company: try subject/body name first (most reliable), then sender email, then domain
      const allCompanies = await storage.getAllCompanies();
      let company: any = null;

      // For forwarded Shopify emails (e.g. "[Big Bedding Australia] Order #21696 placed by...")
      // Extract the reseller company name from brackets in the subject
      if (isForwardedShopify) {
        const bracketMatch = subject.match(/\[([^\]]+)\]/);
        if (bracketMatch) {
          const reseller = bracketMatch[1].trim().toLowerCase();
          company = allCompanies.find(
            (c) => c.legalName.toLowerCase() === reseller ||
                   (c.tradingName && c.tradingName.toLowerCase() === reseller)
          );
          if (!company) {
            company = allCompanies.find(
              (c) => c.legalName.toLowerCase().includes(reseller) ||
                     (c.tradingName && c.tradingName.toLowerCase().includes(reseller)) ||
                     reseller.includes(c.legalName.toLowerCase()) ||
                     (c.tradingName && reseller.includes(c.tradingName.toLowerCase()))
            );
          }
        }
        // Also try matching by sender email domain for forwarded orders
        if (!company) {
          const senderDomain = (email.fromAddress || "").split("@")[1]?.toLowerCase() || "";
          if (senderDomain && senderDomain !== "gmail.com" && senderDomain !== "yahoo.com" && senderDomain !== "hotmail.com" && senderDomain !== "outlook.com") {
            const domainName = senderDomain.replace(/\.(com|com\.au|net|org|co).*$/, "");
            if (domainName.length >= 3) {
              company = allCompanies.find(c =>
                c.legalName.toLowerCase().replace(/[^a-z0-9]/g, "").includes(domainName) ||
                (c.tradingName && c.tradingName.toLowerCase().replace(/[^a-z0-9]/g, "").includes(domainName))
              );
            }
          }
        }
      }

      // Only direct Puradown Shopify emails (NOT forwarded) go to Puradown Website Sales
      if (!company && isShopifyEmail && !isForwardedShopify) {
        company = allCompanies.find(
          (c) => c.legalName.toLowerCase() === "puradown website sales" ||
                 (c.tradingName && c.tradingName.toLowerCase() === "puradown website sales")
        );
        if (!company) {
          company = allCompanies.find(
            (c) => c.legalName.toLowerCase().includes("puradown") ||
                   (c.tradingName && c.tradingName.toLowerCase().includes("puradown"))
          );
        }
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
        const senderInfo = realSenderEmail || email.fromAddress || "unknown sender";
        return res.status(400).json({ 
          message: `Could not match to an existing company. Sender: ${senderInfo}. Subject: "${subject}". Please create the order manually and select the correct company.`
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

      // Use email order number if available, otherwise generate sequential
      let orderNumber: string;
      if (shopifyOrderNum) {
        const existingOrders = await storage.getAllOrders();
        const duplicate = existingOrders.find((o) => o.orderNumber === `PD-${shopifyOrderNum}` || o.orderNumber === shopifyOrderNum || o.customerNotes?.includes(shopifyOrderNum));
        if (duplicate) {
          return res.status(400).json({ message: `Order with Shopify # ${shopifyOrderNum} already exists`, orderId: duplicate.id });
        }
        orderNumber = shopifyOrderNum;
      } else {
        const maxResultPD = await pool.query(`SELECT COALESCE(MAX(CAST(order_number AS INTEGER)), 0) as max_num FROM orders WHERE order_number ~ '^[0-9]+$'`);
        orderNumber = String((parseInt(maxResultPD.rows[0].max_num) || 0) + 1);
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

      await db.update(emailsTable).set({ isConverted: true }).where(eq(emailsTable.id, emailId));

      // Auto-attach the original email as a PDF to the order Files
      try {
        if (bodyHtml) {
          console.log(`[EMAIL-TO-ORDER] Generating email PDF for order ${order.orderNumber}, HTML length: ${bodyHtml.length}`);
          const { convertHtmlToPdf } = await import("./html-to-pdf");
          const pdfBuffer = await convertHtmlToPdf(bodyHtml, {
            customerName: customerName || "",
            customerAddress: customerAddress || "",
            customerPhone: customerPhone || "",
            customerEmail: customerEmail || "",
          });
          console.log(`[EMAIL-TO-ORDER] PDF generated, size: ${pdfBuffer.length} bytes`);
          const fs = await import("fs");
          const path = await import("path");
          const uploadsDir = path.default.join(process.cwd(), "uploads", "orders", order.id);
          await fs.promises.mkdir(uploadsDir, { recursive: true });
          const safeSubject = subject.replace(/[^a-zA-Z0-9_\-\s#]/g, "").trim().replace(/\s+/g, "_").substring(0, 80);
          const fileName = `Email_${safeSubject || "order"}.pdf`;
          const filePath = path.default.join(uploadsDir, fileName);
          await fs.promises.writeFile(filePath, pdfBuffer);
          console.log(`[EMAIL-TO-ORDER] PDF saved to: ${filePath}`);
          await storage.createAttachment({
            entityType: "order",
            entityId: order.id,
            fileName,
            fileType: "application/pdf",
            fileSize: pdfBuffer.length,
            storagePath: filePath,
            uploadedBy: req.session.userId,
            description: `Original email: ${subject}`,
          });
          console.log(`[EMAIL-TO-ORDER] Auto-attached email PDF to order ${order.orderNumber}`);
        } else {
          console.warn(`[EMAIL-TO-ORDER] No HTML body found for email, skipping PDF attachment`);
        }
      } catch (attachError: any) {
        console.error("[EMAIL-TO-ORDER] Failed to auto-attach email PDF:", attachError?.message || attachError);
        console.error("[EMAIL-TO-ORDER] PDF attachment stack:", attachError?.stack);
      }

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

      let pdfText: string = "";
      const header = pdfBuffer.slice(0, 5).toString();
      console.log(`[PDF-EXTRACT] Buffer header: "${header}", size: ${pdfBuffer.length}`);
      if (header !== "%PDF-") {
        return res.status(400).json({ message: "This attachment does not appear to be a valid PDF file." });
      }

      try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: true });
        const pdfDoc = await loadingTask.promise;
        const textParts: string[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .filter((item: any) => "str" in item)
            .map((item: any) => item.str)
            .join(" ");
          textParts.push(pageText);
        }
        pdfText = textParts.join("\n");
        console.log(`[PDF-EXTRACT] Extracted text: ${pdfText.length} chars, pages: ${pdfDoc.numPages}`);
      } catch (parseErr: any) {
        console.log("[PDF-EXTRACT] pdfjs-dist parse failed, will try OCR:", parseErr?.message);
        pdfText = "";
      }

      const isScannedPdf = !pdfText || pdfText.trim().length < 10;
      console.log(`[PDF-EXTRACT] Scanned PDF: ${isScannedPdf}`);

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const systemPrompt = `You are an order data extraction assistant. Extract order/invoice details from the provided content.
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
- Return ONLY the JSON object, no other text`;

      let aiResponse;

      if (isScannedPdf) {
        const { execSync } = await import("child_process");
        const fs = await import("fs");
        const os = await import("os");
        const path = await import("path");

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-ocr-"));
        const pdfPath = path.join(tmpDir, "input.pdf");
        fs.writeFileSync(pdfPath, pdfBuffer);

        try {
          execSync(`pdftoppm -png -r 200 -l 3 "${pdfPath}" "${path.join(tmpDir, "page")}"`);
          const pageFiles = fs.readdirSync(tmpDir)
            .filter((f: string) => f.endsWith(".png"))
            .sort()
            .slice(0, 3);

          if (pageFiles.length === 0) {
            return res.status(400).json({ message: "Could not convert this PDF to images for reading." });
          }

          const imageContents: any[] = pageFiles.map((f: string) => {
            const imgBuf = fs.readFileSync(path.join(tmpDir, f));
            const b64 = imgBuf.toString("base64");
            return { type: "image_url" as const, image_url: { url: `data:image/png;base64,${b64}` } };
          });

          console.log(`[PDF-EXTRACT] Converted ${pageFiles.length} page(s) to images for vision OCR`);

          aiResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  { type: "text" as const, text: "Extract order details from this scanned PDF document:" },
                  ...imageContents,
                ],
              }
            ],
            response_format: { type: "json_object" },
          });
        } finally {
          try {
            const files = fs.readdirSync(tmpDir);
            for (const f of files) fs.unlinkSync(path.join(tmpDir, f));
            fs.rmdirSync(tmpDir);
          } catch {}
        }
      } else {
        aiResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Extract order details from this PDF:\n\n${pdfText.substring(0, 8000)}` }
          ],
          response_format: { type: "json_object" },
        });
      }

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
        return res.status(400).json({ 
          message: `Could not match "${companyName || "Unknown"}" to an existing company. Please select the correct company before creating the order.`
        });
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

      const maxResult = await pool.query(`SELECT COALESCE(MAX(CAST(order_number AS INTEGER)), 0) as max_num FROM orders WHERE order_number ~ '^[0-9]+$'`);
      const orderNumber = String((parseInt(maxResult.rows[0].max_num) || 0) + 1);
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
      const [email] = await db.select().from(emailsTable).where(
        and(eq(emailsTable.id, emailId), eq(emailsTable.userId, req.session.userId!))
      );
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
        return res.status(400).json({ 
          message: `Could not match "${orderRequest.companyName}" to an existing company. Please check the company name and try again, or create the order manually with the correct company.`
        });
      }

      const items = (orderRequest.items as any[]) || [];
      const subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.lineTotal) || 0), 0);
      const tax = Math.round(subtotal * 0.1 * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;

      const maxResult2 = await pool.query(`SELECT COALESCE(MAX(CAST(order_number AS INTEGER)), 0) as max_num FROM orders WHERE order_number ~ '^[0-9]+$'`);
      const orderNumber = String((parseInt(maxResult2.rows[0].max_num) || 0) + 1);

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

  // ============ PORTAL AUTH & ROUTES ============

  function requirePortalAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session.portalUserId || !req.session.portalCompanyId) {
      return res.status(401).json({ message: "Portal authentication required" });
    }
    next();
  }

  app.post("/api/portal/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email and password required" });
      const [user] = await db.select().from(portalUsers).where(eq(portalUsers.email, email.toLowerCase().trim()));
      if (!user) return res.status(401).json({ message: "Invalid email or password" });
      if (!user.active) return res.status(401).json({ message: "Account is disabled. Contact your supplier." });
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });
      await db.update(portalUsers).set({ lastLogin: new Date() }).where(eq(portalUsers.id, user.id));
      req.session.portalUserId = user.id;
      req.session.portalCompanyId = user.companyId;
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Portal login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/portal/auth/logout", (req, res) => {
    req.session.portalUserId = undefined;
    req.session.portalCompanyId = undefined;
    res.json({ message: "Logged out" });
  });

  app.get("/api/portal/auth/me", async (req, res) => {
    if (!req.session.portalUserId) return res.status(401).json({ message: "Not authenticated" });
    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, req.session.portalUserId));
    if (!user) return res.status(401).json({ message: "User not found" });
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/portal/company", requirePortalAuth, async (req, res) => {
    try {
      const company = await storage.getCompany(req.session.portalCompanyId!);
      if (!company) return res.status(404).json({ message: "Company not found" });
      const { internalNotes, ...safeCompany } = company;
      res.json(safeCompany);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch company" });
    }
  });

  app.get("/api/portal/orders", requirePortalAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT o.*, c.legal_name as company_name
        FROM orders o
        LEFT JOIN companies c ON c.id = o.company_id
        WHERE o.company_id = $1
        ORDER BY o.order_date DESC
      `, [req.session.portalCompanyId]);
      res.json(result.rows.map((r: any) => ({
        id: r.id,
        orderNumber: r.order_number,
        status: r.status,
        orderDate: r.order_date,
        subtotal: r.subtotal,
        tax: r.tax,
        total: r.total,
        customerNotes: r.customer_notes,
        shippingMethod: r.shipping_method,
        trackingNumber: r.tracking_number,
        companyName: r.company_name,
      })));
    } catch (error) {
      console.error("Portal orders error:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/portal/orders/:id", requirePortalAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT o.*, c.legal_name as company_name
        FROM orders o
        LEFT JOIN companies c ON c.id = o.company_id
        WHERE o.id = $1 AND o.company_id = $2
      `, [req.params.id, req.session.portalCompanyId]);
      if (result.rows.length === 0) return res.status(404).json({ message: "Order not found" });
      const r = result.rows[0];
      const linesResult = await pool.query(`
        SELECT ol.*, p.name as product_name, p.sku
        FROM order_lines ol
        LEFT JOIN products p ON p.id = ol.product_id
        WHERE ol.order_id = $1
      `, [req.params.id]);
      res.json({
        id: r.id,
        orderNumber: r.order_number,
        status: r.status,
        orderDate: r.order_date,
        requestedShipDate: r.requested_ship_date,
        subtotal: r.subtotal,
        tax: r.tax,
        total: r.total,
        customerNotes: r.customer_notes,
        shippingMethod: r.shipping_method,
        trackingNumber: r.tracking_number,
        companyName: r.company_name,
        lines: linesResult.rows.map((l: any) => ({
          id: l.id,
          productName: l.product_name || l.description_override || "Unknown",
          sku: l.sku || "",
          description: l.description_override || "",
          quantity: l.quantity,
          unitPrice: l.unit_price,
          lineTotal: l.line_total,
        })),
      });
    } catch (error) {
      console.error("Portal order detail error:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  app.get("/api/portal/invoices", requirePortalAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT i.*, c.legal_name as company_name
        FROM invoices i
        LEFT JOIN companies c ON c.id = i.company_id
        WHERE i.company_id = $1
        ORDER BY i.issue_date DESC
      `, [req.session.portalCompanyId]);
      res.json(result.rows.map((r: any) => ({
        id: r.id,
        invoiceNumber: r.invoice_number,
        status: r.status,
        issueDate: r.issue_date,
        dueDate: r.due_date,
        subtotal: r.subtotal,
        tax: r.tax,
        total: r.total,
        balanceDue: r.balance_due,
        companyName: r.company_name,
        xeroOnlineUrl: r.xero_online_url,
      })));
    } catch (error) {
      console.error("Portal invoices error:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get("/api/portal/products", requirePortalAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    try {
      const hiddenCategories = [
        '4 SEASONS CASE',
        'CASSETTES CASES',
        'CHANNELLED CASES',
        'GOLD PILLOW CASE',
        'GOLD QUILT CASE',
        'MATTRESS TOPPER CASE',
        'MEN JACKET',
        'WOMAN JACKET',
      ];
      const result = await pool.query(`
        SELECT id, sku, name, description, category, unit_price
        FROM products WHERE active = true
        AND (category IS NULL OR category NOT IN (${hiddenCategories.map((_, i) => `$${i + 1}`).join(', ')}))
        ORDER BY category, name
      `, hiddenCategories);

      const companyId = req.session.portalCompanyId;
      let priceMap = new Map<string, string>();
      let variantPriceMap = new Map<string, Array<{ filling: string; weight: string | null; unitPrice: string }>>();
      if (companyId) {
        const companyPricesList = await storage.getCompanyPrices(companyId);
        for (const cp of companyPricesList) {
          priceMap.set(cp.productId, cp.unitPrice);
        }
        const variantResult = await pool.query(
          `SELECT product_id, filling, weight, unit_price FROM company_variant_prices WHERE company_id = $1 ORDER BY filling, weight`,
          [companyId]
        );
        for (const vp of variantResult.rows) {
          const key = vp.product_id;
          if (!variantPriceMap.has(key)) variantPriceMap.set(key, []);
          variantPriceMap.get(key)!.push({ filling: vp.filling, weight: vp.weight, unitPrice: vp.unit_price });
        }
      }

      // Load default variant prices as fallback for products without company-specific variant prices
      const defaultVariantResult = await pool.query(
        `SELECT product_id, filling, weight, unit_price FROM default_variant_prices ORDER BY filling, weight`
      );
      const defaultVariantMap = new Map<string, Array<{ filling: string; weight: string | null; unitPrice: string }>>();
      for (const dvp of defaultVariantResult.rows) {
        const key = dvp.product_id;
        if (!defaultVariantMap.has(key)) defaultVariantMap.set(key, []);
        defaultVariantMap.get(key)!.push({ filling: dvp.filling, weight: dvp.weight, unitPrice: dvp.unit_price });
      }

      res.json(result.rows.map((r: any) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        description: r.description,
        category: r.category,
        unitPrice: priceMap.get(r.id) || r.unit_price,
        hasCustomPrice: priceMap.has(r.id),
        variantPrices: variantPriceMap.get(r.id) || defaultVariantMap.get(r.id) || [],
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.post("/api/portal/orders", requirePortalAuth, async (req, res) => {
    try {
      const { items, customItems, customerNotes, paymentTerms, shippingAddress: deliveryAddress } = req.body;
      const hasItems = items && Array.isArray(items) && items.length > 0;
      const hasCustomItems = customItems && Array.isArray(customItems) && customItems.length > 0;
      if (!hasItems && !hasCustomItems) {
        return res.status(400).json({ message: "At least one item is required" });
      }
      const companyId = req.session.portalCompanyId!;
      const [portalUser] = await db.select().from(portalUsers).where(eq(portalUsers.id, req.session.portalUserId!));

      let subtotal = 0;
      const companyPricesList = await storage.getCompanyPrices(companyId);
      const companyPriceMap = new Map(companyPricesList.map(cp => [cp.productId, cp.unitPrice]));
      const variantResult = await pool.query(
        `SELECT product_id, filling, weight, unit_price FROM company_variant_prices WHERE company_id = $1`,
        [companyId]
      );
      const variantPrices = variantResult.rows;
      // Load default variant prices as fallback
      const defaultVarResult = await pool.query(
        `SELECT product_id, filling, weight, unit_price FROM default_variant_prices`
      );
      const defaultVariantPrices = defaultVarResult.rows;
      const orderLines: Array<{ productId: string | null; quantity: number; unitPrice: number; lineTotal: number; descriptionOverride: string }> = [];
      if (hasItems) {
        for (const item of items) {
          const prodResult = await pool.query("SELECT id, name, unit_price FROM products WHERE id = $1 AND active = true", [item.productId]);
          if (prodResult.rows.length === 0) continue;
          const prod = prodResult.rows[0];
          const qty = Math.max(1, parseInt(item.quantity) || 1);
          let price: number;
          if (item.filling) {
            const f = (item.filling || "").trim();
            const w = (item.weight || "").trim() || null;
            // Try company-specific variant prices first, then fall back to default variant prices
            let prodVariants = variantPrices.filter((vp: any) => vp.product_id === prod.id && (vp.filling || "").trim() === f);
            if (prodVariants.length === 0) {
              prodVariants = defaultVariantPrices.filter((vp: any) => vp.product_id === prod.id && (vp.filling || "").trim() === f);
            }
            let variantMatch = null;
            if (w) {
              variantMatch = prodVariants.find((vp: any) => (vp.weight || "").trim() === w);
            }
            if (!variantMatch) {
              variantMatch = prodVariants.find((vp: any) => !vp.weight) || prodVariants.find((vp: any) => (vp.weight || "").trim() === "Normal") || prodVariants[0] || null;
            }
            price = variantMatch ? parseFloat(variantMatch.unit_price) : (companyPriceMap.has(prod.id) ? parseFloat(companyPriceMap.get(prod.id)!) : parseFloat(prod.unit_price));
          } else {
            const customPrice = companyPriceMap.get(prod.id);
            price = customPrice ? parseFloat(customPrice) : parseFloat(prod.unit_price);
          }
          const lineTotal = price * qty;
          subtotal += lineTotal;
          const desc = item.filling ? `${prod.name} (${item.filling}${item.weight ? `, ${item.weight}` : ''})` : prod.name;
          orderLines.push({
            productId: prod.id,
            quantity: qty,
            unitPrice: price,
            lineTotal,
            descriptionOverride: desc,
          });
        }
      }
      if (hasCustomItems) {
        for (const ci of customItems) {
          const qty = Math.max(1, parseInt(ci.quantity) || 1);
          const desc = `CUSTOM INSERT: ${ci.size}${ci.filling ? ` (${ci.filling})` : ''}${ci.weight ? ` [${ci.weight}]` : ''}`;
          orderLines.push({
            productId: null,
            quantity: qty,
            unitPrice: 0,
            lineTotal: 0,
            descriptionOverride: desc,
          });
        }
      }

      const tax = Math.round(subtotal * 10) / 100;
      const total = subtotal + tax;

      const maxResult3 = await pool.query(`SELECT COALESCE(MAX(CAST(order_number AS INTEGER)), 0) as max_num FROM orders WHERE order_number ~ '^[0-9]+$'`);
      const orderNumber = String((parseInt(maxResult3.rows[0].max_num) || 0) + 1);
      const customerName = portalUser?.name || "Portal Order";

      const orderResult = await pool.query(`
        INSERT INTO orders (id, order_number, company_id, status, order_date, subtotal, tax, total, customer_notes, customer_name, customer_email, customer_address, payment_terms)
        VALUES (gen_random_uuid(), $1, $2, 'new', NOW(), $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, order_number
      `, [orderNumber, companyId, subtotal.toFixed(2), tax.toFixed(2), total.toFixed(2),
          customerNotes || `Order placed by ${customerName}`,
          customerName, portalUser?.email || "", deliveryAddress || null,
          paymentTerms || "Net 30"]);

      const orderId = orderResult.rows[0].id;

      for (const line of orderLines) {
        await pool.query(`
          INSERT INTO order_lines (id, order_id, product_id, description_override, quantity, unit_price, discount, line_total)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, '0', $6)
        `, [orderId, line.productId, line.descriptionOverride, line.quantity, line.unitPrice.toFixed(2), line.lineTotal.toFixed(2)]);
      }

      await recalcCompanyRevenue(companyId);

      res.json({ id: orderId, orderNumber: orderResult.rows[0].order_number });
    } catch (error) {
      console.error("Portal create order error:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  app.put("/api/portal/account/password", requirePortalAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ message: "Current and new passwords required" });
      if (newPassword.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
      const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, req.session.portalUserId!));
      if (!user) return res.status(404).json({ message: "User not found" });
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(400).json({ message: "Current password is incorrect" });
      const hash = await bcrypt.hash(newPassword, 10);
      await db.update(portalUsers).set({ passwordHash: hash }).where(eq(portalUsers.id, user.id));
      res.json({ message: "Password updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  app.get("/api/portal/dashboard", requirePortalAuth, async (req, res) => {
    try {
      const companyId = req.session.portalCompanyId!;
      const ordersResult = await pool.query(`
        SELECT COUNT(*) as total_orders,
          COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')) as open_orders,
          COALESCE(SUM(total), 0) as total_spent,
          MAX(order_date) as last_order_date
        FROM orders WHERE company_id = $1
      `, [companyId]);
      const invoicesResult = await pool.query(`
        SELECT COUNT(*) as total_invoices,
          COUNT(*) FILTER (WHERE status NOT IN ('paid', 'void')) as unpaid_invoices,
          COALESCE(SUM(balance_due) FILTER (WHERE status NOT IN ('paid', 'void')), 0) as outstanding_balance
        FROM invoices WHERE company_id = $1
      `, [companyId]);
      const recentOrders = await pool.query(`
        SELECT id, order_number, status, order_date, total
        FROM orders WHERE company_id = $1
        ORDER BY order_date DESC LIMIT 5
      `, [companyId]);
      res.json({
        totalOrders: parseInt(ordersResult.rows[0].total_orders),
        openOrders: parseInt(ordersResult.rows[0].open_orders),
        totalSpent: parseFloat(ordersResult.rows[0].total_spent),
        lastOrderDate: ordersResult.rows[0].last_order_date,
        totalInvoices: parseInt(invoicesResult.rows[0].total_invoices),
        unpaidInvoices: parseInt(invoicesResult.rows[0].unpaid_invoices),
        outstandingBalance: parseFloat(invoicesResult.rows[0].outstanding_balance),
        recentOrders: recentOrders.rows.map((r: any) => ({
          id: r.id,
          orderNumber: r.order_number,
          status: r.status,
          orderDate: r.order_date,
          total: r.total,
        })),
      });
    } catch (error) {
      console.error("Portal dashboard error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });

  // ============ ADMIN: PORTAL USER MANAGEMENT ============

  app.get("/api/admin/portal-users", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT pu.id, pu.company_id, pu.contact_id, pu.name, pu.email, pu.active, pu.created_at, pu.last_login,
          c.legal_name as company_name, c.payment_terms
        FROM portal_users pu
        LEFT JOIN companies c ON c.id = pu.company_id
        ORDER BY pu.created_at DESC
      `);
      res.json(result.rows.map((r: any) => ({
        id: r.id,
        companyId: r.company_id,
        contactId: r.contact_id,
        name: r.name,
        email: r.email,
        active: r.active,
        createdAt: r.created_at,
        lastLogin: r.last_login,
        companyName: r.company_name,
        paymentTerms: r.payment_terms,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch portal users" });
    }
  });

  app.post("/api/admin/portal-users", requireAdmin, async (req, res) => {
    try {
      const { name, email, password, companyId, contactId } = req.body;
      if (!name || !email || !password || !companyId) {
        return res.status(400).json({ message: "Name, email, password, and company are required" });
      }
      const existing = await db.select().from(portalUsers).where(eq(portalUsers.email, email.toLowerCase().trim()));
      if (existing.length > 0) return res.status(400).json({ message: "A portal user with this email already exists" });
      const hash = await bcrypt.hash(password, 10);
      const [user] = await db.insert(portalUsers).values({
        name,
        email: email.toLowerCase().trim(),
        passwordHash: hash,
        companyId,
        contactId: contactId || null,
        active: true,
      }).returning();
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Create portal user error:", error);
      res.status(500).json({ message: "Failed to create portal user" });
    }
  });

  app.patch("/api/admin/portal-users/:id", requireAdmin, async (req, res) => {
    try {
      const { active, password } = req.body;
      const updates: any = {};
      if (typeof active === "boolean") updates.active = active;
      if (password) updates.passwordHash = await bcrypt.hash(password, 10);
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No updates provided" });
      await db.update(portalUsers).set(updates).where(eq(portalUsers.id, req.params.id));
      res.json({ message: "Portal user updated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update portal user" });
    }
  });

  app.delete("/api/admin/portal-users/:id", requireAdmin, async (req, res) => {
    try {
      await db.delete(portalUsers).where(eq(portalUsers.id, req.params.id));
      res.json({ message: "Portal user deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete portal user" });
    }
  });

  // ============ DATA EXPORTS ============

  app.get("/api/admin/export/:type", requireAdmin, async (req, res) => {
    try {
      const { type } = req.params;
      let rows: any[] = [];
      let filename = "";
      let headers: string[] = [];

      switch (type) {
        case "companies": {
          const result = await pool.query(`SELECT legal_name, trading_name, abn, billing_address, shipping_address, payment_terms, credit_status, phone, email_addresses, total_revenue, client_grade, created_at FROM companies ORDER BY legal_name`);
          rows = result.rows;
          headers = ["Legal Name", "Trading Name", "ABN", "Billing Address", "Shipping Address", "Payment Terms", "Credit Status", "Phone", "Email", "Total Revenue", "Client Grade", "Created"];
          filename = "companies.csv";
          break;
        }
        case "contacts": {
          const result = await pool.query(`SELECT c.first_name, c.last_name, c.email, c.phone, c.position, co.legal_name as company_name, c.created_at FROM contacts c LEFT JOIN companies co ON co.id = c.company_id ORDER BY c.first_name, c.last_name`);
          rows = result.rows;
          headers = ["First Name", "Last Name", "Email", "Phone", "Position", "Company", "Created"];
          filename = "contacts.csv";
          break;
        }
        case "orders": {
          const result = await pool.query(`SELECT o.order_number, co.legal_name as company_name, o.status, o.payment_status, o.total_amount, o.shipping_address, o.notes, o.created_at FROM orders o LEFT JOIN companies co ON co.id = o.company_id ORDER BY o.created_at DESC`);
          rows = result.rows;
          headers = ["Order Number", "Company", "Status", "Payment Status", "Total Amount", "Shipping Address", "Notes", "Created"];
          filename = "orders.csv";
          break;
        }
        case "invoices": {
          const result = await pool.query(`SELECT i.invoice_number, co.legal_name as company_name, i.status, i.total_amount, i.due_date, i.paid_date, i.created_at FROM invoices i LEFT JOIN companies co ON co.id = i.company_id ORDER BY i.created_at DESC`);
          rows = result.rows;
          headers = ["Invoice Number", "Company", "Status", "Total Amount", "Due Date", "Paid Date", "Created"];
          filename = "invoices.csv";
          break;
        }
        case "products": {
          const result = await pool.query(`SELECT name, category, base_price, unit, active, created_at FROM products ORDER BY name`);
          rows = result.rows;
          headers = ["Name", "Category", "Base Price", "Unit", "Active", "Created"];
          filename = "products.csv";
          break;
        }
        case "audit-log": {
          const result = await pool.query(`SELECT al.action, al.entity_type, al.entity_id, u.name as user_name, al.created_at FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id ORDER BY al.created_at DESC LIMIT 5000`);
          rows = result.rows;
          headers = ["Action", "Entity Type", "Entity ID", "User", "Created"];
          filename = "audit-log.csv";
          break;
        }
        default:
          return res.status(400).json({ message: "Invalid export type" });
      }

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return "";
        const str = String(val).replace(/"/g, '""');
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
      };

      const csvLines = [headers.join(",")];
      for (const row of rows) {
        csvLines.push(Object.values(row).map(escapeCsv).join(","));
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvLines.join("\n"));
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  registerChatRoutes(app);

  return httpServer;
}
