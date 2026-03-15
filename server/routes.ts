import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool, db } from "./db";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq, ilike, and, sql, inArray } from "drizzle-orm";
import express from "express";
import { loginSchema, insertCompanySchema, insertContactSchema, insertDealSchema, insertProductSchema, insertOrderSchema, insertOrderLineSchema, insertActivitySchema, insertQuoteSchema, emails as emailsTable, contacts, companies as companiesTable, outlookTokens as outlookTokensTable, crmSettings, portalUsers, attachments } from "@shared/schema";
import { registerChatRoutes } from "./replit_integrations/chat";
import { createXeroClient, getStoredToken, saveXeroToken, deleteXeroToken, refreshTokenIfNeeded, importContactsFromXero, syncInvoiceToXero, importInvoicesFromXero, autoSyncXeroInvoices, repairMissingInvoiceRecords, getXeroSyncMapping, saveXeroSyncMapping } from "./xero";
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

  app.post("/api/companies/merge-orders", requireAdmin, async (req, res) => {
    try {
      const { fromCompanyId, toCompanyId } = req.body;
      if (!fromCompanyId || !toCompanyId) {
        return res.status(400).json({ message: "fromCompanyId and toCompanyId are required" });
      }

      const fromCompany = await storage.getCompany(fromCompanyId);
      const toCompany = await storage.getCompany(toCompanyId);
      if (!fromCompany || !toCompany) {
        return res.status(404).json({ message: "One or both companies not found" });
      }

      const orderResult = await pool.query(
        "UPDATE orders SET company_id = $1 WHERE company_id = $2",
        [toCompanyId, fromCompanyId]
      );
      const invoiceResult = await pool.query(
        "UPDATE invoices SET company_id = $1 WHERE company_id = $2",
        [toCompanyId, fromCompanyId]
      );
      const emailResult = await pool.query(
        "UPDATE emails SET company_id = $1 WHERE company_id = $2",
        [toCompanyId, fromCompanyId]
      );

      res.json({
        merged: {
          orders: orderResult.rowCount,
          invoices: invoiceResult.rowCount,
          emails: emailResult.rowCount,
        },
        from: fromCompany.tradingName || fromCompany.legalName,
        to: toCompany.tradingName || toCompany.legalName,
      });
    } catch (error) {
      console.error("Merge orders error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // -------- Company Additional Price Lists --------
  app.get("/api/companies/:id/additional-price-lists", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT capl.id, capl.price_list_id, pl.name
         FROM company_additional_price_lists capl
         JOIN price_lists pl ON pl.id = capl.price_list_id
         WHERE capl.company_id = $1
         ORDER BY pl.name`,
        [req.params.id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Get additional price lists error:", err);
      res.status(500).json({ message: "Failed to fetch additional price lists" });
    }
  });

  app.post("/api/companies/:id/additional-price-lists", requireEdit, async (req, res) => {
    try {
      const { priceListId } = req.body;
      if (!priceListId) return res.status(400).json({ message: "priceListId is required" });
      // Check if already assigned to avoid duplicate errors if constraint doesn't exist yet
      const existing = await pool.query(
        `SELECT id FROM company_additional_price_lists WHERE company_id = $1 AND price_list_id = $2`,
        [req.params.id, priceListId]
      );
      if (existing.rows.length > 0) {
        return res.status(201).json({ message: "Already assigned" });
      }
      const result = await pool.query(
        `INSERT INTO company_additional_price_lists (company_id, price_list_id) VALUES ($1, $2) RETURNING *`,
        [req.params.id, priceListId]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Add additional price list error:", err);
      res.status(500).json({ message: "Failed to add additional price list" });
    }
  });

  app.delete("/api/companies/:id/additional-price-lists/:plId", requireEdit, async (req, res) => {
    try {
      await pool.query(
        `DELETE FROM company_additional_price_lists WHERE company_id = $1 AND price_list_id = $2`,
        [req.params.id, req.params.plId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Remove additional price list error:", err);
      res.status(500).json({ message: "Failed to remove additional price list" });
    }
  });

  app.post("/api/companies/bulk-assign-price-list", requireAdmin, async (req, res) => {
    try {
      const { ids, priceListId } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required" });
      }
      if (!priceListId) {
        return res.status(400).json({ message: "priceListId is required" });
      }

      const result = await pool.query(
        "UPDATE companies SET price_list_id = $1 WHERE id = ANY($2::varchar[])",
        [priceListId, ids]
      );

      res.json({ updated: result.rowCount, total: ids.length });
    } catch (error) {
      console.error("Bulk assign price list error:", error);
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

  app.get("/api/activities", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT a.*, u.name as user_name FROM activities a LEFT JOIN users u ON a.created_by = u.id ORDER BY a.created_at DESC LIMIT 100`
      );
      res.json(result.rows.map((r: any) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.activity_type,
        content: r.content,
        userName: r.user_name || "System",
        details: r.content,
        createdAt: r.created_at,
      })));
    } catch (error) {
      console.error("Get all activities error:", error);
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

  // ========== MERGE COMPANIES ==========
  app.post("/api/companies/:id/merge", requireAdmin, async (req, res) => {
    const targetId = req.params.id; // company to KEEP
    const { sourceCompanyId } = req.body; // company to merge FROM (will be deleted)
    if (!sourceCompanyId) return res.status(400).json({ message: "sourceCompanyId is required" });
    if (sourceCompanyId === targetId) return res.status(400).json({ message: "Cannot merge a company with itself" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const target = await client.query("SELECT * FROM companies WHERE id = $1", [targetId]);
      const source = await client.query("SELECT * FROM companies WHERE id = $1", [sourceCompanyId]);
      if (target.rows.length === 0) throw new Error("Target company not found");
      if (source.rows.length === 0) throw new Error("Source company not found");

      const targetName = target.rows[0].trading_name || target.rows[0].legal_name;
      const sourceName = source.rows[0].trading_name || source.rows[0].legal_name;
      console.log(`[MERGE] Merging "${sourceName}" → "${targetName}"`);

      // Simple re-parent tables
      const simpleTables = [
        "orders", "contacts", "invoices", "quotes", "deals",
        "emails", "crm_calls", "crm_tasks", "crm_tickets", "form_submissions"
      ];
      for (const table of simpleTables) {
        const r = await client.query(`UPDATE ${table} SET company_id = $1 WHERE company_id = $2`, [targetId, sourceCompanyId]);
        if (r.rowCount && r.rowCount > 0) console.log(`[MERGE] Moved ${r.rowCount} rows in ${table}`);
      }

      // Portal users: only transfer if email not already in target company
      await client.query(`
        UPDATE portal_users SET company_id = $1
        WHERE company_id = $2
          AND email NOT IN (SELECT email FROM portal_users WHERE company_id = $1)
      `, [targetId, sourceCompanyId]);
      // Delete remaining portal users (email conflicts)
      await client.query(`DELETE FROM portal_users WHERE company_id = $1`, [sourceCompanyId]);

      // Company prices: insert only if product not already priced for target
      const srcPrices = await client.query(`SELECT * FROM company_prices WHERE company_id = $1`, [sourceCompanyId]);
      for (const row of srcPrices.rows) {
        await client.query(`
          INSERT INTO company_prices (id, company_id, product_id, unit_price, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
          ON CONFLICT (company_id, product_id) DO NOTHING
        `, [targetId, row.product_id, row.unit_price]);
      }
      await client.query(`DELETE FROM company_prices WHERE company_id = $1`, [sourceCompanyId]);

      // Company variant prices: insert only if variant not already priced for target
      const srcVariants = await client.query(`SELECT * FROM company_variant_prices WHERE company_id = $1`, [sourceCompanyId]);
      for (const row of srcVariants.rows) {
        await client.query(`
          INSERT INTO company_variant_prices (id, company_id, product_id, filling, weight, unit_price)
          SELECT gen_random_uuid(), $1, $2, $3, $4, $5
          WHERE NOT EXISTS (
            SELECT 1 FROM company_variant_prices
            WHERE company_id = $1 AND product_id = $2 AND COALESCE(filling,'') = COALESCE($3,'') AND COALESCE(weight,'') = COALESCE($4,'')
          )
        `, [targetId, row.product_id, row.filling, row.weight, row.unit_price]);
      }
      await client.query(`DELETE FROM company_variant_prices WHERE company_id = $1`, [sourceCompanyId]);

      // Additional price lists
      const srcAddl = await client.query(`SELECT price_list_id FROM company_additional_price_lists WHERE company_id = $1`, [sourceCompanyId]);
      for (const row of srcAddl.rows) {
        const exists = await client.query(`SELECT 1 FROM company_additional_price_lists WHERE company_id = $1 AND price_list_id = $2`, [targetId, row.price_list_id]);
        if (exists.rows.length === 0) {
          await client.query(`INSERT INTO company_additional_price_lists (company_id, price_list_id) VALUES ($1, $2)`, [targetId, row.price_list_id]);
        }
      }
      await client.query(`DELETE FROM company_additional_price_lists WHERE company_id = $1`, [sourceCompanyId]);

      // Merge internal notes
      if (source.rows[0].internal_notes) {
        const existingNotes = target.rows[0].internal_notes || "";
        const mergedNotes = existingNotes
          ? `${existingNotes}\n\n[Merged from ${sourceName}]: ${source.rows[0].internal_notes}`
          : `[Merged from ${sourceName}]: ${source.rows[0].internal_notes}`;
        await client.query(`UPDATE companies SET internal_notes = $1 WHERE id = $2`, [mergedNotes, targetId]);
      }

      // Delete the source company (cascade handles any remaining FK references)
      await client.query(`DELETE FROM companies WHERE id = $1`, [sourceCompanyId]);

      await client.query("COMMIT");
      console.log(`[MERGE] Completed: "${sourceName}" merged into "${targetName}" and deleted`);
      res.json({ success: true, message: `${sourceName} has been merged into ${targetName} and deleted.` });
    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[MERGE] Error:", err.message);
      res.status(500).json({ message: `Merge failed: ${err.message}` });
    } finally {
      client.release();
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

  app.get("/api/companies/:id/effective-prices", requireAuth, async (req, res) => {
    try {
      const companyId = req.params.id;
      const companyResult = await pool.query(`SELECT price_list_id FROM companies WHERE id = $1`, [companyId]);
      const priceListId = companyResult.rows[0]?.price_list_id;
      if (!priceListId) {
        return res.json([]);
      }
      const plPrices = await pool.query(
        `SELECT product_id, filling, weight, unit_price FROM price_list_prices WHERE price_list_id = $1 ORDER BY product_id, filling, weight`,
        [priceListId]
      );
      res.json(plPrices.rows.map((r: any) => ({
        productId: r.product_id,
        filling: r.filling || null,
        weight: r.weight || null,
        unitPrice: r.unit_price,
      })));
    } catch (error) {
      console.error("Get effective prices error:", error);
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

  app.delete("/api/companies/:id/prices", requireEdit, async (req, res) => {
    try {
      const deleted = await storage.deleteAllCompanyPrices(req.params.id);
      res.json({ success: true, deleted });
    } catch (error) {
      console.error("Delete all company prices error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/prices/export", requireAuth, async (req, res) => {
    try {
      const allProducts = await storage.getAllProducts();
      const companyPrices = await storage.getCompanyPrices(req.params.id);
      const priceMap = new Map(companyPrices.map(cp => [cp.productId, cp.unitPrice]));
      const activeProducts = allProducts.filter(p => p.active);
      const esc = (s: string | null | undefined) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
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
      const skuMap = new Map(allProducts.filter(p => p.sku).map(p => [p.sku!.toLowerCase(), p.id]));
      const nameMap = new Map(allProducts.map(p => [p.name.toLowerCase().trim(), p.id]));
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const item of prices) {
        const sku = (item.sku || "").trim().toLowerCase();
        const name = (item.name || "").trim().toLowerCase();
        const price = parseFloat(item.price);
        if (isNaN(price) || price <= 0) {
          skipped++;
          continue;
        }
        const productId = (sku ? skuMap.get(sku) : undefined) || (name ? nameMap.get(name) : undefined);
        if (!productId) {
          if (sku || name) errors.push(`Product not found: ${item.sku || item.name}`);
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

  app.get("/api/products/:id/variants", requireAuth, async (req, res) => {
    try {
      const variants = await storage.getDefaultVariantPricesByProductId(req.params.id);
      res.json(variants);
    } catch (error) {
      console.error("Get variant prices error:", error);
      res.status(500).json({ message: "Failed to get variant prices" });
    }
  });

  app.get("/api/products/all-variant-prices", requireAuth, async (req, res) => {
    try {
      const variants = await storage.getAllDefaultVariantPrices();
      res.json(variants);
    } catch (error) {
      console.error("Get all variant prices error:", error);
      res.status(500).json({ message: "Failed to get variant prices" });
    }
  });

  // ============ PRICE LISTS ============
  app.get("/api/price-lists", requireAuth, async (req, res) => {
    try {
      const lists = await storage.getAllPriceLists();
      res.json(lists);
    } catch (error) {
      console.error("Get price lists error:", error);
      res.status(500).json({ message: "Failed to get price lists" });
    }
  });

  app.post("/api/price-lists", requireAdmin, async (req, res) => {
    try {
      const list = await storage.createPriceList(req.body);
      res.status(201).json(list);
    } catch (error) {
      console.error("Create price list error:", error);
      res.status(500).json({ message: "Failed to create price list" });
    }
  });

  app.patch("/api/price-lists/:id", requireAdmin, async (req, res) => {
    try {
      const list = await storage.updatePriceList(req.params.id, req.body);
      if (!list) return res.status(404).json({ message: "Price list not found" });
      res.json(list);
    } catch (error) {
      console.error("Update price list error:", error);
      res.status(500).json({ message: "Failed to update price list" });
    }
  });

  app.delete("/api/price-lists/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deletePriceList(req.params.id);
      if (!success) return res.status(400).json({ message: "Cannot delete default price list" });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete price list error:", error);
      res.status(500).json({ message: "Failed to delete price list" });
    }
  });

  app.get("/api/price-lists/:priceListId/prices", requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT plp.id, plp.product_id, plp.sku, plp.filling, plp.weight, plp.unit_price, p.name as product_name, p.category
         FROM price_list_prices plp
         JOIN products p ON p.id = plp.product_id
         WHERE plp.price_list_id = $1
         ORDER BY p.category, p.name, plp.filling, plp.weight`,
        [req.params.priceListId]
      );
      res.json(rows);
    } catch (error) {
      console.error("Get all price list prices error:", error);
      res.status(500).json({ message: "Failed to get price list prices" });
    }
  });

  app.get("/api/price-lists/:priceListId/products/:productId/prices", requireAuth, async (req, res) => {
    try {
      const prices = await storage.getPriceListPrices(req.params.priceListId, req.params.productId);
      res.json(prices);
    } catch (error) {
      console.error("Get price list prices error:", error);
      res.status(500).json({ message: "Failed to get price list prices" });
    }
  });

  app.post("/api/price-lists/:priceListId/products/:productId/prices", requireAdmin, async (req, res) => {
    try {
      const price = await storage.upsertPriceListPrice({
        ...req.body,
        priceListId: req.params.priceListId,
        productId: req.params.productId,
      });
      res.status(201).json(price);
    } catch (error) {
      console.error("Upsert price list price error:", error);
      res.status(500).json({ message: "Failed to upsert price list price" });
    }
  });

  app.post("/api/price-lists/:priceListId/products/:productId/prices/bulk", requireAdmin, async (req, res) => {
    try {
      const prices = (req.body.prices || []).map((p: any) => ({
        ...p,
        priceListId: req.params.priceListId,
        productId: req.params.productId,
      }));
      const results = await storage.bulkUpsertPriceListPrices(prices);
      res.status(201).json(results);
    } catch (error) {
      console.error("Bulk upsert price list prices error:", error);
      res.status(500).json({ message: "Failed to bulk upsert price list prices" });
    }
  });

  // Add a single item to a price list (finds or creates the product)
  app.post("/api/price-lists/:priceListId/prices", requireAdmin, async (req, res) => {
    try {
      const { priceListId } = req.params;
      const { productName, sku, category, filling, weight, price } = req.body;
      if (!productName || !price) {
        return res.status(400).json({ message: "Product name and price are required" });
      }
      const unitPrice = parseFloat(price);
      if (isNaN(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ message: "Invalid price" });
      }
      // GUARD: Never allow Highgate products to be added to any non-Highgate price list
      const skuUpper = sku ? sku.trim().toUpperCase() : null;
      const catUpper = (category || "").trim().toUpperCase();
      const isHighgatePL = await pool.query(`SELECT name FROM price_lists WHERE id = $1 LIMIT 1`, [priceListId]);
      const plName = (isHighgatePL.rows[0]?.name || "").toLowerCase();
      if (plName !== "highgate inserts") {
        if (catUpper.includes("HIGHGATE") || (skuUpper && /^HG\d+$/.test(skuUpper))) {
          return res.status(400).json({ message: "Highgate Inserts products cannot be added to other price lists." });
        }
      }
      // Find or create the product
      let productId: string;
      // Try by SKU first
      if (skuUpper) {
        const bySkuResult = await pool.query("SELECT id FROM products WHERE sku = $1 LIMIT 1", [skuUpper]);
        if (bySkuResult.rows.length > 0) {
          productId = bySkuResult.rows[0].id;
        }
      }
      // Try by name + category
      if (!productId!) {
        const byNameResult = await pool.query(
          "SELECT id FROM products WHERE UPPER(name) = $1 AND UPPER(COALESCE(category,'')) = $2 LIMIT 1",
          [productName.trim().toUpperCase(), catUpper]
        );
        if (byNameResult.rows.length > 0) {
          productId = byNameResult.rows[0].id;
        }
      }
      // Create new product if not found
      if (!productId!) {
        const newProd = await pool.query(
          `INSERT INTO products (id, sku, name, category, unit_price, active)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, true) RETURNING id`,
          [skuUpper || null, productName.trim(), catUpper || null, unitPrice.toFixed(2)]
        );
        productId = newProd.rows[0].id;
      }
      // Upsert the price entry
      const existing = await pool.query(
        `SELECT id FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2
         AND COALESCE(filling,'') = $3 AND COALESCE(weight,'') = $4`,
        [priceListId, productId, filling || "", weight || ""]
      );
      let rowId: string;
      if (existing.rows.length > 0) {
        rowId = existing.rows[0].id;
        await pool.query("UPDATE price_list_prices SET unit_price = $1 WHERE id = $2", [unitPrice.toFixed(2), rowId]);
      } else {
        const ins = await pool.query(
          `INSERT INTO price_list_prices (id, price_list_id, product_id, sku, filling, weight, unit_price)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING id`,
          [priceListId, productId, skuUpper || null, filling || null, weight || null, unitPrice.toFixed(2)]
        );
        rowId = ins.rows[0].id;
      }
      // Return the new row with product info
      const row = await pool.query(
        `SELECT plp.id, plp.product_id, plp.sku, plp.filling, plp.weight, plp.unit_price,
                p.name as product_name, p.category
         FROM price_list_prices plp JOIN products p ON p.id = plp.product_id
         WHERE plp.id = $1`,
        [rowId]
      );
      res.status(201).json(row.rows[0]);
    } catch (error) {
      console.error("Add price list item error:", error);
      res.status(500).json({ message: "Failed to add item to price list" });
    }
  });

  // Edit a single price entry
  app.patch("/api/price-list-prices/:id", requireAdmin, async (req, res) => {
    try {
      const { price, filling, weight } = req.body;
      const unitPrice = parseFloat(price);
      if (isNaN(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ message: "Invalid price" });
      }
      await pool.query(
        "UPDATE price_list_prices SET unit_price = $1, filling = $2, weight = $3 WHERE id = $4",
        [unitPrice.toFixed(2), filling || null, weight || null, req.params.id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Edit price list price error:", error);
      res.status(500).json({ message: "Failed to update price" });
    }
  });

  // Delete a single price entry
  app.delete("/api/price-list-prices/:id", requireAdmin, async (req, res) => {
    try {
      await pool.query("DELETE FROM price_list_prices WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete price list price error:", error);
      res.status(500).json({ message: "Failed to delete price entry" });
    }
  });

  app.post("/api/price-lists/:priceListId/import-csv", requireAdmin, async (req, res) => {
    try {
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No price data provided" });
      }

      const priceListId = req.params.priceListId;
      const priceList = await storage.getPriceList(priceListId);
      if (!priceList) {
        return res.status(404).json({ message: "Price list not found" });
      }

      const allProducts = await pool.query("SELECT id, name, sku, category FROM products WHERE active = true");
      const productByName = new Map<string, string>();
      const productBySku = new Map<string, string>();
      const productByDimension = new Map<string, string>();
      for (const p of allProducts.rows) {
        productByName.set(p.name.toUpperCase().trim(), p.id);
        if (p.sku) productBySku.set(p.sku.toUpperCase().trim(), p.id);
        const dimMatch = p.name.match(/^(\d+)X(\d+)CM$/i);
        if (dimMatch) {
          const d1 = dimMatch[1], d2 = dimMatch[2];
          productByDimension.set(`${d1}X${d2}`, p.id);
          productByDimension.set(`${d2}X${d1}`, p.id);
        }
      }

      function normalizeProductName(name: string): string {
        return name
          .replace(/\bDUCK\s+FEATHER\b/gi, "FEATHER")
          .replace(/\bDUCK\s+DOWN\b/gi, "DOWN")
          .replace(/\bDUCK\s+/gi, "")
          .replace(/\bd\/feather\b/gi, "FEATHER")
          .replace(/\bd\/down\b/gi, "DOWN")
          .trim();
      }

      function extractDimensions(name: string): string | null {
        let m = name.match(/(\d+)\s*[xX×]\s*(\d+)\s*cm/i);
        if (m) return `${m[1]}X${m[2]}`;
        m = name.match(/(\d+)cm\s*[xX×]\s*(\d+)cm/i);
        if (m) return `${m[1]}X${m[2]}`;
        m = name.match(/(\d+)\s*[xX×]\s*(\d+)/);
        if (m) return `${m[1]}X${m[2]}`;
        m = name.match(/(\d+)cm\s+round/i);
        if (m) return `${m[1]}X${m[1]}`;
        return null;
      }

      function generateSku(category: string, existingSkus: Set<string>): string {
        const prefix = category.substring(0, 4).toUpperCase().replace(/\s/g, "");
        let num = 1;
        while (existingSkus.has(`${prefix}-${String(num).padStart(3, "0")}`)) {
          num++;
        }
        const sku = `${prefix}-${String(num).padStart(3, "0")}`;
        existingSkus.add(sku);
        return sku;
      }

      const existingSkus = new Set<string>();
      for (const p of allProducts.rows) {
        if (p.sku) existingSkus.add(p.sku.toUpperCase().trim());
      }

      let imported = 0;
      let skipped = 0;
      let notFound = 0;
      let created = 0;
      const notFoundNames: string[] = [];
      const createdNames: string[] = [];

      for (const row of rows) {
        const productName = (row.product || row.Product || "").trim();
        const rowSku = (row.sku || row.Sku || row.SKU || "").trim();
        const rowCategory = (row.category || row.Category || "").trim().toUpperCase();
        const filling = (row.filling || row.Filling || "").trim() || null;
        const weight = (row.weight || row.Weight || "").trim() || null;
        const priceStr = (row.price || row.Price || row.unit_price || row.unitPrice || "").toString().replace(/[^0-9.]/g, "");
        const price = parseFloat(priceStr);

        if (!productName || isNaN(price)) {
          skipped++;
          continue;
        }

        const nameUpper = productName.toUpperCase().trim();
        const normalizedName = normalizeProductName(nameUpper);
        let productId = productByName.get(nameUpper)
          || productByName.get(normalizedName)
          || productBySku.get(nameUpper);

        if (!productId && rowSku) {
          productId = productBySku.get(rowSku.toUpperCase());
        }

        if (!productId) {
          const strippedParenthetical = nameUpper.replace(/\s*-\s*\([^)]+\)\s*/g, "").trim();
          if (strippedParenthetical !== nameUpper) {
            productId = productByName.get(strippedParenthetical);
          }
        }

        if (!productId) {
          const dims = extractDimensions(nameUpper);
          if (dims) {
            productId = productByDimension.get(dims);
            if (!productId) {
              const [d1, d2] = dims.split("X");
              productId = productByDimension.get(`${d2}X${d1}`);
            }
          }
        }

        if (!productId) {
          for (const [dbName, dbId] of productByName.entries()) {
            if (dbName.replace(/\s*[\u2013\u2014]\s*/g, " - ").replace(/\s+/g, " ") === nameUpper.replace(/\s+/g, " ")) {
              productId = dbId;
              break;
            }
            const dbNorm = dbName.replace(/\s*[\u2013\u2014-]\s*/g, " ").replace(/\s*\([^)]+\)\s*/g, " ").replace(/\s+/g, " ").trim();
            const csvNorm = nameUpper.replace(/\s*[\u2013\u2014-]\s*/g, " ").replace(/\s*\([^)]+\)\s*/g, " ").replace(/\s+/g, " ").trim();
            if (dbNorm === csvNorm) {
              productId = dbId;
              break;
            }
          }
        }

        if (!productId && rowCategory) {
          const normalizedCategory = rowCategory.replace(/\bDUCK\s+/gi, "").trim();
          const csvSizeMatch = nameUpper.match(/^(.+?)\s*[-\u2013\u2014]\s*/);
          if (csvSizeMatch) {
            const sizePrefix = csvSizeMatch[1].trim();
            for (const [dbName, dbId] of productByName.entries()) {
              const dbProduct = allProducts.rows.find((p: any) => p.id === dbId);
              if (!dbProduct) continue;
              const dbCat = dbProduct.category.toUpperCase();
              if (dbCat === rowCategory || dbCat === normalizedCategory) {
                if (dbName.startsWith(sizePrefix + " ") || dbName.startsWith(sizePrefix + " -") || dbName.startsWith(sizePrefix + " \u2013")) {
                  productId = dbId;
                  break;
                }
              }
            }
          }
        }

        if (!productId) {
          const category = rowCategory ? rowCategory.replace(/\bDUCK\s+/gi, "").trim() || rowCategory : "UNCATEGORIZED";
          let sku = rowSku;
          if (sku && existingSkus.has(sku.toUpperCase())) {
            const existingId = productBySku.get(sku.toUpperCase());
            if (existingId) {
              productId = existingId;
              console.log(`[IMPORT] Matched "${productName}" by duplicate SKU ${sku} to existing product`);
            }
          }
          // Before creating a new product, check if this price list already has a product with the same name.
          // This prevents duplicates when re-importing a CSV with slightly different formatting.
          if (!productId) {
            const existingInList = await pool.query(
              `SELECT p.id FROM price_list_prices plp JOIN products p ON p.id = plp.product_id
               WHERE plp.price_list_id = $1 AND UPPER(p.name) = $2 LIMIT 1`,
              [priceListId, nameUpper]
            );
            if (existingInList.rows.length > 0) {
              productId = existingInList.rows[0].id;
              console.log(`[IMPORT] Matched "${productName}" by existing price list entry`);
            }
          }
          if (!productId) {
            if (!sku || existingSkus.has(sku.toUpperCase())) {
              sku = generateSku(category, existingSkus);
            }
            try {
              const newProduct = await pool.query(
                `INSERT INTO products (name, sku, category, unit_price, active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
                [productName, sku, category, price.toFixed(2)]
              );
              productId = newProduct.rows[0].id;
              productByName.set(nameUpper, productId);
              productBySku.set(sku.toUpperCase(), productId);
              existingSkus.add(sku.toUpperCase());
              created++;
              createdNames.push(productName);
              console.log(`[IMPORT] Created new product: "${productName}" (SKU: ${sku}, Category: ${category})`);
            } catch (createErr: any) {
              console.error(`[IMPORT] Failed to create product "${productName}":`, createErr.message);
              notFound++;
              if (notFoundNames.length < 20) notFoundNames.push(productName);
              continue;
            }
          }
        }

        try {
          const existing = await pool.query(
            `SELECT id FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2 AND COALESCE(filling, '') = $3 AND COALESCE(weight, '') = $4`,
            [priceListId, productId, filling || "", weight || ""]
          );
          if (existing.rows.length > 0) {
            await pool.query(
              `UPDATE price_list_prices SET unit_price = $1 WHERE id = $2`,
              [price.toFixed(2), existing.rows[0].id]
            );
          } else {
            await pool.query(
              `INSERT INTO price_list_prices (price_list_id, product_id, filling, weight, unit_price) VALUES ($1, $2, $3, $4, $5)`,
              [priceListId, productId, filling, weight, price.toFixed(2)]
            );
          }
          imported++;
        } catch (e: any) {
          skipped++;
        }
      }

      res.json({
        message: `Imported ${imported} prices. ${created} products created. ${skipped} skipped. ${notFound} products not found.`,
        imported,
        created,
        skipped,
        notFound,
        notFoundNames,
        createdNames,
      });
    } catch (error) {
      console.error("Price list CSV import error:", error);
      res.status(500).json({ message: "Failed to import prices" });
    }
  });

  app.delete("/api/price-list-prices/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deletePriceListPrice(req.params.id);
      if (!success) return res.status(404).json({ message: "Price list price not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete price list price error:", error);
      res.status(500).json({ message: "Failed to delete price list price" });
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

  app.post("/api/quotes", requireEdit, async (req, res) => {
    try {
      const maxResult = await pool.query("SELECT MAX(CAST(REPLACE(quote_number, 'QUO-', '') AS INTEGER)) as max_num FROM quotes");
      const nextNum = ((maxResult.rows[0]?.max_num || 0) + 1);
      const quoteNumber = `QUO-${String(nextNum).padStart(4, '0')}`;

      const { lines, ...quoteData } = req.body;
      const data = insertQuoteSchema.parse({ ...quoteData, quoteNumber });
      const quote = await storage.createQuote(data);

      if (lines && Array.isArray(lines)) {
        for (const line of lines) {
          await storage.createQuoteLine({
            quoteId: quote.id,
            productId: line.productId || null,
            descriptionOverride: line.descriptionOverride || null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount || "0",
            lineTotal: line.lineTotal,
          });
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "quote",
        entityId: quote.id,
        afterJson: quote,
      });
      res.status(201).json(quote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create quote error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/quotes/:id", requireEdit, async (req, res) => {
    try {
      const before = await storage.getQuote(req.params.id);
      const { lines, ...quoteData } = req.body;
      const quote = await storage.updateQuote(req.params.id, quoteData);

      if (lines && Array.isArray(lines)) {
        await pool.query("DELETE FROM quote_lines WHERE quote_id = $1", [req.params.id]);
        for (const line of lines) {
          await storage.createQuoteLine({
            quoteId: req.params.id,
            productId: line.productId || null,
            descriptionOverride: line.descriptionOverride || null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount || "0",
            lineTotal: line.lineTotal,
          });
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "quote",
        entityId: req.params.id,
        beforeJson: before,
        afterJson: quote,
      });
      res.json(quote);
    } catch (error) {
      console.error("Update quote error:", error);
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

  app.post("/api/orders/:id/attachments", requireEdit, async (req, res) => {
    try {
      const orderId = req.params.id;
      const contentType = req.headers["content-type"] || "";
      if (!contentType.includes("multipart/form-data")) {
        return res.status(400).json({ message: "Expected multipart/form-data" });
      }
      const busboy = await import("busboy");
      const bb = busboy.default({ headers: req.headers });
      const filePromises: Promise<any>[] = [];
      bb.on("file", (_fieldname: string, file: any, info: any) => {
        const { filename, mimeType } = info;
        const chunks: Buffer[] = [];
        let fileSize = 0;
        file.on("data", (data: Buffer) => { chunks.push(data); fileSize += data.length; });
        const filePromise = new Promise<any>((resolve, reject) => {
          file.on("end", () => {
            resolve({
              entityType: "order",
              entityId: orderId,
              fileName: filename,
              fileType: mimeType,
              fileSize,
              storagePath: `db://${orderId}/${filename}`,
              uploadedBy: req.session.userId,
              fileData: Buffer.concat(chunks),
            });
          });
          file.on("error", reject);
        });
        filePromises.push(filePromise);
      });
      bb.on("finish", async () => {
        try {
          const uploadedFiles = await Promise.all(filePromises);
          for (const f of uploadedFiles) {
            await pool.query(
              `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_type, file_size, storage_path, uploaded_by, uploaded_at, file_data)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
              [f.entityType, f.entityId, f.fileName, f.fileType, f.fileSize, f.storagePath, f.uploadedBy, f.fileData]
            );
          }
          await storage.createActivity({
            entityType: "order",
            entityId: orderId,
            activityType: "system",
            content: `${uploadedFiles.length} file(s) uploaded`,
            createdBy: req.session.userId,
          });
          const result = await storage.getAttachmentsByEntity("order", orderId);
          res.json(result);
        } catch (err) {
          console.error("Order file write error:", err);
          res.status(500).json({ message: "Failed to save files" });
        }
      });
      bb.on("error", (err: any) => {
        console.error("Busboy error:", err);
        res.status(500).json({ message: "Upload processing error" });
      });
      req.pipe(bb);
    } catch (error) {
      console.error("Upload order attachment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/companies/:id/attachments", requireAuth, async (req, res) => {
    try {
      const result = await storage.getAttachmentsByEntity("company", req.params.id);
      res.json(result);
    } catch (error) {
      console.error("Get company attachments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/companies/:id/attachments", requireEdit, async (req, res) => {
    try {
      const companyId = req.params.id;
      const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId));
      if (!company) return res.status(404).json({ message: "Company not found" });

      const contentType = req.headers["content-type"] || "";
      if (!contentType.includes("multipart/form-data")) {
        return res.status(400).json({ message: "Expected multipart/form-data" });
      }

      const busboy = await import("busboy");
      const path = await import("path");
      const fs = await import("fs");
      const bb = busboy.default({ headers: req.headers });
      const uploadsDir = path.default.join(process.cwd(), "uploads", "companies", companyId);
      await fs.promises.mkdir(uploadsDir, { recursive: true });

      const filePromises: Promise<any>[] = [];

      bb.on("file", (_fieldname: string, file: any, info: any) => {
        const { filename, mimeType } = info;
        const chunks: Buffer[] = [];
        let fileSize = 0;

        file.on("data", (data: Buffer) => { chunks.push(data); fileSize += data.length; });

        const filePromise = new Promise<any>((resolve, reject) => {
          file.on("end", () => {
            const fileData = Buffer.concat(chunks);
            resolve({
              entityType: "company",
              entityId: companyId,
              fileName: filename,
              fileType: mimeType,
              fileSize,
              storagePath: `db://${companyId}/${filename}`,
              uploadedBy: req.session.userId,
              fileData,
            });
          });
          file.on("error", reject);
        });
        filePromises.push(filePromise);
      });

      bb.on("finish", async () => {
        try {
          const uploadedFiles = await Promise.all(filePromises);
          for (const f of uploadedFiles) {
            await pool.query(
              `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_type, file_size, storage_path, uploaded_by, uploaded_at, file_data)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
              [f.entityType, f.entityId, f.fileName, f.fileType, f.fileSize, f.storagePath, f.uploadedBy, f.fileData]
            );
          }
          await storage.createActivity({
            entityType: "company",
            entityId: companyId,
            activityType: "system",
            content: `${uploadedFiles.length} file(s) uploaded`,
            createdBy: req.session.userId,
          });
          const result = await storage.getAttachmentsByEntity("company", companyId);
          res.json(result);
        } catch (err) {
          console.error("File write error:", err);
          res.status(500).json({ message: "Failed to save files" });
        }
      });

      bb.on("error", (err: any) => {
        console.error("Busboy error:", err);
        res.status(500).json({ message: "Upload processing error" });
      });

      req.pipe(bb);
    } catch (error) {
      console.error("Upload company attachment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/attachments", requireAuth, async (req, res) => {
    try {
      const allAttachments = await db.select().from(attachments).orderBy(attachments.uploadedAt);
      res.json(allAttachments);
    } catch (error) {
      console.error("Get all attachments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/attachments/:id/download", requireAuth, async (req, res) => {
    try {
      const dbResult = await pool.query(
        `SELECT id, entity_type, entity_id, file_name, file_type, file_size, storage_path, file_data FROM attachments WHERE id = $1`,
        [req.params.id]
      );
      if (dbResult.rows.length === 0) return res.status(404).json({ message: "Attachment not found" });
      const attachment = dbResult.rows[0];

      res.setHeader("Content-Type", attachment.file_type);
      res.setHeader("Content-Disposition", `attachment; filename="${attachment.file_name}"`);

      if (attachment.file_data) {
        res.setHeader("Content-Length", attachment.file_data.length);
        return res.send(attachment.file_data);
      }

      const fs = await import("fs");
      if (!fs.existsSync(attachment.storage_path)) {
        return res.status(404).json({ message: "File not found" });
      }
      const fileStream = fs.createReadStream(attachment.storage_path);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Download attachment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/attachments/:id", requireEdit, async (req, res) => {
    try {
      const [attachment] = await db.select().from(attachments).where(eq(attachments.id, req.params.id));
      if (!attachment) return res.status(404).json({ message: "Attachment not found" });
      const fs = await import("fs");
      try { if (fs.existsSync(attachment.storagePath)) fs.unlinkSync(attachment.storagePath); } catch {}
      await db.delete(attachments).where(eq(attachments.id, req.params.id));
      await storage.createActivity({
        entityType: attachment.entityType as any,
        entityId: attachment.entityId,
        activityType: "system",
        content: `File deleted: ${attachment.fileName}`,
        createdBy: req.session.userId,
      });
      res.json({ message: "Attachment deleted" });
    } catch (error) {
      console.error("Delete attachment error:", error);
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
          let baseProductName = "";
          let productSku = "";
          if (line.productId) {
            const product = await storage.getProduct(line.productId);
            if (product) {
              baseProductName = product.name;
              productName = line.descriptionOverride || product.name;
              productSku = product.sku;
            }
          }
          return { ...line, productName, baseProductName, productSku };
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

  // ==================== XERO INVOICE ROUTES ====================

  // Send order to Xero as a DRAFT invoice
  app.post("/api/orders/:id/send-to-xero", requireEdit, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });

      const token = await getStoredToken();
      if (!token) return res.status(400).json({ message: "Xero not connected. Go to Settings → Xero to connect your account first." });

      // Refresh token if needed — if this returns false the token is expired and can't be refreshed
      const xero = createXeroClient(`${req.protocol}://${req.get("host")}/api/xero/callback`);
      const refreshed = await refreshTokenIfNeeded(xero, token);
      if (!refreshed) return res.status(401).json({ message: "Your Xero connection has expired. Please go to Settings → Xero and reconnect your account." });
      const freshToken = await getStoredToken();
      if (!freshToken) return res.status(401).json({ message: "Your Xero connection has expired. Please go to Settings → Xero and reconnect your account." });

      const accessToken = freshToken.accessToken;
      const tenantId = freshToken.tenantId;

      // Get company and order lines
      const company = order.companyId ? await storage.getCompany(order.companyId) : null;
      if (!company) return res.status(400).json({ message: "Order has no company — cannot create Xero invoice." });

      const lines = await storage.getOrderLines(order.id);
      if (!lines.length) return res.status(400).json({ message: "Order has no line items — add items before sending to Xero." });

      // 1. Get or create Xero contact for this company
      let xeroContactId: string | null = null;
      const companyMapping = await getXeroSyncMapping("company", company.id);
      if (companyMapping) {
        xeroContactId = companyMapping.xeroId;
      } else {
        // Search Xero for matching contact by name
        const searchRes = await fetch(
          `https://api.xero.com/api.xro/2.0/Contacts?searchTerm=${encodeURIComponent(company.tradingName || company.legalName)}`,
          { headers: { Authorization: `Bearer ${accessToken}`, "Xero-Tenant-Id": tenantId, Accept: "application/json" } }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json() as any;
          const found = searchData.Contacts?.find((c: any) =>
            c.Name?.toLowerCase() === (company.tradingName || company.legalName)?.toLowerCase()
          );
          if (found?.ContactID) {
            xeroContactId = found.ContactID;
            await saveXeroSyncMapping("company", company.id, xeroContactId!);
          }
        }
        // If still not found, create new contact in Xero
        if (!xeroContactId) {
          const createContactRes = await fetch("https://api.xero.com/api.xro/2.0/Contacts", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Xero-Tenant-Id": tenantId, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ Contacts: [{ Name: company.tradingName || company.legalName }] }),
          });
          if (!createContactRes.ok) {
            const err = await createContactRes.text();
            console.error("[XERO] Failed to create contact:", err);
            return res.status(500).json({ message: "Failed to create Xero contact for this company." });
          }
          const contactData = await createContactRes.json() as any;
          xeroContactId = contactData.Contacts?.[0]?.ContactID;
          if (xeroContactId) await saveXeroSyncMapping("company", company.id, xeroContactId);
        }
      }
      if (!xeroContactId) return res.status(500).json({ message: "Could not create or find Xero contact." });

      // 2. Build line items with category-based account codes
      // Fetch product categories for all lines that have a productId
      const productIds = lines.map((l: any) => l.productId).filter(Boolean);
      const productInfoMap: Record<string, { category: string; name: string }> = {};
      if (productIds.length > 0) {
        const catRes = await pool.query(
          `SELECT id, category, name FROM products WHERE id = ANY($1)`,
          [productIds]
        );
        for (const row of catRes.rows) {
          productInfoMap[row.id] = {
            category: row.category?.toUpperCase() || "",
            name: row.name?.toUpperCase() || "",
          };
        }
      }

      const getXeroAccountCode = (category: string, productName: string, description: string): string => {
        const cat = (category || "").toUpperCase();
        const name = (productName || "").toUpperCase();
        const desc = (description || "").toUpperCase();
        const combined = `${cat} ${name} ${desc}`;
        // Priority 1: Fee/special line item checks using combined — these ALWAYS override category.
        // Using combined so the match works regardless of which field holds the value.
        if (combined.includes("FREIGHT")) return "44000";
        if (combined.includes("DROP SHIP")) return "41111";
        if (combined.includes("SHOPIFY FEE") || combined.includes("SHOPIFY FEES")) return "51111";
        if (combined.includes("SHOPIFY")) return "51111";
        // Bare "fee" line (Shopify platform/transaction fees come through as just "fee")
        if (desc === "FEE" || name === "FEE") return "51111";
        // Priority 2: Category-based matches
        if (cat.includes("INSERT")) return "41180";
        if (cat.includes("PILLOW")) return "41120";
        if (cat.includes("MATTRESS TOPPER") || cat.includes("MATTRESS_TOPPER")) return "41194";
        if (cat.includes("QUILT CASE") || cat.includes("CASSETTE") || cat.includes("CHANNELLED")) return "41130";
        if (cat.includes("JACKET") || cat.includes("MEN JACKET") || cat.includes("WOMAN JACKET")) return "41195";
        if (cat.includes("JAPARA")) return "41185";
        if (cat.includes("BULK") || cat.includes("LOOSE FILL")) return "41140";
        if (cat.includes("QUILT") || cat.includes("BLANKET") || cat.includes("FILL") ||
            cat.includes("STRIP") || cat.includes("DOWN") || cat.includes("WINTER")) return "41110";
        // Priority 3: Combined text fallback
        if (combined.includes("INSERT")) return "41180";
        if (combined.includes("PILLOW")) return "41120";
        if (combined.includes("MATTRESS TOPPER")) return "41194";
        if (combined.includes("QUILT CASE") || combined.includes("CASSETTE") || combined.includes("CHANNELLED")) return "41130";
        if (combined.includes("JACKET")) return "41195";
        if (combined.includes("JAPARA")) return "41185";
        if (combined.includes("BULK") || combined.includes("LOOSE FILL")) return "41140";
        if (combined.includes("QUILT") || combined.includes("BLANKET") || combined.includes("FILL")) return "41110";
        return "200"; // default fallback — review in Xero
      };

      // Frontline gets a 6.5% discount on everything except INSERTS, BULK, and JACKETS
      const isFrontline = (company.tradingName || company.legalName || "").toUpperCase().includes("FRONTLINE");
      const FRONTLINE_DISCOUNT_EXEMPT_CATS = ['INSERT', 'BULK', 'JACKET'];
      const xeroLineItems = lines.map((line: any) => {
        const info = productInfoMap[line.productId] || { category: "", name: "" };
        const description = line.descriptionOverride || "";
        const cat = (info.category || "").toUpperCase();
        const isDiscountExempt = FRONTLINE_DISCOUNT_EXEMPT_CATS.some(e => cat.includes(e));
        const discountRate = isFrontline && !isDiscountExempt ? 6.5 : undefined;
        return {
          Description: description || info.name || "Item",
          Quantity: parseFloat(line.quantity) || 1,
          UnitAmount: parseFloat(line.unitPrice) || 0,
          AccountCode: getXeroAccountCode(info.category, info.name, description),
          ...(discountRate !== undefined ? { DiscountRate: discountRate } : {}),
        };
      });

      // 3. Due date based on payment terms
      const issueDate = new Date();
      const dueDays = company.paymentTerms === "Net 60" ? 60 : company.paymentTerms === "Net 45" ? 45 : company.paymentTerms === "Net 30" ? 30 : company.paymentTerms === "Net 14" ? 14 : company.paymentTerms === "Net 7" ? 7 : 30;
      const dueDate = new Date(issueDate.getTime() + dueDays * 86400000);
      const fmt = (d: Date) => d.toISOString().split("T")[0];

      // 4. Create DRAFT invoice in Xero
      const invoicePayload = {
        Invoices: [{
          Type: "ACCREC",
          Contact: { ContactID: xeroContactId },
          LineItems: xeroLineItems,
          Date: fmt(issueDate),
          DueDate: fmt(dueDate),
          Status: "DRAFT",
          Reference: `Order #${order.orderNumber}`,
        }],
      };

      const createRes = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Xero-Tenant-Id": tenantId, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(invoicePayload),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error("[XERO] Failed to create invoice:", createRes.status, errText);
        let xeroMsg = `Xero returned an error (${createRes.status}).`;
        try {
          const errJson = JSON.parse(errText);
          const elements = errJson?.Elements?.[0]?.ValidationErrors;
          if (elements?.length) {
            xeroMsg += " " + elements.map((e: any) => e.Message).join("; ");
          } else if (errJson?.Detail) {
            xeroMsg += " " + errJson.Detail;
          } else if (errJson?.Message) {
            xeroMsg += " " + errJson.Message;
          }
        } catch {}
        return res.status(500).json({ message: xeroMsg });
      }

      const createData = await createRes.json() as any;
      const xeroInv = createData.Invoices?.[0];
      if (!xeroInv?.InvoiceID) return res.status(500).json({ message: "Xero did not return an invoice ID." });

      // 5. Get online invoice URL
      let onlineUrl: string | null = null;
      try {
        const urlRes = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${xeroInv.InvoiceID}/OnlineInvoice`, {
          headers: { Authorization: `Bearer ${accessToken}`, "Xero-Tenant-Id": tenantId, Accept: "application/json" },
        });
        if (urlRes.ok) {
          const urlData = await urlRes.json() as any;
          onlineUrl = urlData.OnlineInvoices?.[0]?.OnlineInvoiceUrl || null;
        }
      } catch {}

      // 6. Save Xero invoice ID on the order
      await pool.query(
        `UPDATE orders SET xero_invoice_id = $1, xero_invoice_status = 'DRAFT', xero_online_url = $2, updated_at = NOW() WHERE id = $3`,
        [xeroInv.InvoiceID, onlineUrl, order.id]
      );

      // 7. Log activity
      await storage.createActivity({
        entityType: "order",
        entityId: order.id,
        activityType: "system",
        content: `Sent to Xero as draft invoice (Xero Invoice ID: ${xeroInv.InvoiceID})`,
        createdBy: (req as any).session?.userId || null,
      });

      return res.json({
        success: true,
        xeroInvoiceId: xeroInv.InvoiceID,
        xeroInvoiceStatus: "DRAFT",
        xeroOnlineUrl: onlineUrl,
        message: `Draft invoice created in Xero for Order #${order.orderNumber}. Open Xero to review, approve, and send to the customer.`,
      });
    } catch (err: any) {
      console.error("[XERO] Send to Xero error:", err.message);
      return res.status(500).json({ message: err.message || "Failed to send to Xero." });
    }
  });

  // Sync Xero invoice status back to the CRM order
  app.post("/api/orders/:id/sync-xero-status", requireEdit, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });

      const xeroInvoiceId = (order as any).xeroInvoiceId;
      if (!xeroInvoiceId) return res.status(400).json({ message: "This order has not been sent to Xero yet." });

      const token = await getStoredToken();
      if (!token) return res.status(400).json({ message: "Xero not connected." });

      const xero = createXeroClient(`${req.protocol}://${req.get("host")}/api/xero/callback`);
      const refreshed2 = await refreshTokenIfNeeded(xero, token);
      if (!refreshed2) return res.status(401).json({ message: "Your Xero connection has expired. Please go to Settings → Xero and reconnect your account." });
      const freshToken = await getStoredToken();
      if (!freshToken) return res.status(401).json({ message: "Your Xero connection has expired. Please reconnect." });

      const fetchRes = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${xeroInvoiceId}`, {
        headers: { Authorization: `Bearer ${freshToken.accessToken}`, "Xero-Tenant-Id": freshToken.tenantId, Accept: "application/json" },
      });
      if (!fetchRes.ok) return res.status(500).json({ message: "Could not fetch invoice status from Xero." });

      const data = await fetchRes.json() as any;
      const xeroInv = data.Invoices?.[0];
      if (!xeroInv) return res.status(404).json({ message: "Invoice not found in Xero." });

      const newStatus = xeroInv.Status as string; // DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
      const isPaid = newStatus === "PAID";
      const isInvoiced = newStatus === "AUTHORISED" || newStatus === "PAID";

      await pool.query(
        `UPDATE orders SET xero_invoice_status = $1, payment_status = $2,
         status = CASE WHEN $3 AND status NOT IN ('completed','cancelled') THEN 'completed' ELSE status END,
         updated_at = NOW() WHERE id = $4`,
        [newStatus, isPaid ? "paid" : (order as any).paymentStatus, isInvoiced, order.id]
      );

      if (isInvoiced) {
        // Also mark any linked portal order request as completed
        await pool.query(
          `UPDATE customer_order_requests SET status = 'completed'
           WHERE converted_order_id = $1 AND status != 'completed'`,
          [order.id]
        );
        await storage.createActivity({
          entityType: "order",
          activityType: "system",
          entityId: order.id,
          content: isPaid
            ? `Xero invoice marked as PAID — order and portal marked as completed`
            : `Xero invoice AUTHORISED — order and portal marked as completed`,
          createdBy: (req as any).session?.userId || null,
        });
      }

      return res.json({
        success: true,
        xeroInvoiceStatus: newStatus,
        isPaid,
        message: isPaid ? "Invoice is PAID in Xero — order marked as paid." : `Invoice status in Xero: ${newStatus}`,
      });
    } catch (err: any) {
      console.error("[XERO] Sync status error:", err.message);
      return res.status(500).json({ message: err.message || "Failed to sync Xero status." });
    }
  });

  // ==================== PURAX SYNC ROUTES ====================
  // Manually mark an order as completed (e.g. after Milo finishes it)
  app.post("/api/orders/:id/mark-completed", requireEdit, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });

      await pool.query(
        `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [order.id]
      );

      await storage.createActivity({
        entityType: "order",
        entityId: order.id,
        activityType: "system",
        content: `Order manually marked as completed (Milo order done).`,
        createdBy: (req.user as any)?.id || null,
      });

      console.log(`[MARK-COMPLETED] Order ${order.orderNumber} marked as completed by user ${(req.user as any)?.name || "unknown"}`);
      return res.json({ success: true, message: "Order marked as completed" });
    } catch (err: any) {
      console.error("[MARK-COMPLETED] Error:", err.message);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

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

      // Fetch attachments to include with the sync
      // Always include BOTH direct order attachments AND any attachments from the source portal
      // order request — so customer-uploaded files are never missed even if a CRM user also
      // added attachments directly to the order.
      let orderAttachments = await storage.getAttachmentsByEntity("order", order.id);
      const srcRequest = await pool.query(
        `SELECT id FROM customer_order_requests WHERE converted_order_id = $1 LIMIT 1`,
        [order.id]
      );
      if (srcRequest.rows.length > 0) {
        const reqId = srcRequest.rows[0].id;
        const reqAttachments = await storage.getAttachmentsByEntity("order_request", reqId);
        if (reqAttachments.length > 0) {
          const existingIds = new Set(orderAttachments.map((a: any) => a.id));
          const newAttachments = reqAttachments.filter((a: any) => !existingIds.has(a.id));
          if (newAttachments.length > 0) {
            console.log(`[PURAX-SYNC] Adding ${newAttachments.length} portal attachment(s) from order_request ${reqId} to order's ${orderAttachments.length} attachment(s)`);
            orderAttachments = [...orderAttachments, ...newAttachments];
          }
        }
      }

      // If this order came from Shopify, fetch the original Shopify order and generate a PDF to attach
      let shopifyOrderPdfEntry: { fileName: string; mimeType: string; data: string } | null = null;
      const shopifyOrderId = (order as any).shopifyOrderId;
      const shopifyOrderNumber = (order as any).shopifyOrderNumber;
      if (shopifyOrderId) {
        try {
          const shopifyConfig = await getShopifyConfig();
          if (shopifyConfig.storeDomain && shopifyConfig.apiToken) {
            const shopifyRes = await fetch(
              `https://${shopifyConfig.storeDomain}/admin/api/2026-01/orders/${shopifyOrderId}.json`,
              { headers: { "X-Shopify-Access-Token": shopifyConfig.apiToken, "Content-Type": "application/json" } }
            );
            if (shopifyRes.ok) {
              const { order: so } = await shopifyRes.json() as any;
              // Build PDF directly with PDFKit — bypass the email HTML parser
              const shopifyPdfBuffer: Buffer = await new Promise((resolve, reject) => {
                const PDFDoc = require("pdfkit");
                const doc = new PDFDoc({ size: "A4", margin: 50 });
                const chunks: Buffer[] = [];
                doc.on("data", (c: Buffer) => chunks.push(c));
                doc.on("end", () => resolve(Buffer.concat(chunks)));
                doc.on("error", reject);

                const W = doc.page.width - 100;
                const ship = so.shipping_address || so.billing_address || {};
                const customerName = `${so.customer?.first_name || ""} ${so.customer?.last_name || ""}`.trim();

                // Header
                doc.fontSize(20).font("Helvetica-Bold").fillColor("#000000").text(`Shopify Order ${so.name}`, 50, 50);
                doc.moveDown(0.4);
                doc.fontSize(10).font("Helvetica").fillColor("#555555");
                doc.text(`Date: ${new Date(so.created_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}`);
                doc.text(`Payment: ${so.financial_status}`);
                if (customerName) doc.text(`Customer: ${customerName}${so.customer?.email ? ` — ${so.customer.email}` : ""}`);
                if (so.customer?.phone) doc.text(`Phone: ${so.customer.phone}`);
                if (ship.address1) {
                  const addrParts = [ship.address1, ship.address2, ship.city, ship.province_code || ship.province, ship.zip, ship.country].filter(Boolean);
                  doc.text(`Ship to: ${addrParts.join(", ")}`);
                }

                doc.moveDown(1.5);
                doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor("#cccccc").lineWidth(1).stroke();
                doc.moveDown(0.5);

                // Column headers
                const col1 = 50, col2 = 50 + W - 180, col3 = 50 + W - 100, col4 = 50 + W - 40;
                doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666");
                doc.text("PRODUCT", col1, doc.y, { width: col2 - col1 - 10 });
                doc.text("QTY", col2, doc.y - doc.currentLineHeight(), { width: 40, align: "center" });
                doc.text("UNIT", col3, doc.y - doc.currentLineHeight(), { width: 50, align: "right" });
                doc.text("TOTAL", col4 - 10, doc.y - doc.currentLineHeight(), { width: 60, align: "right" });
                doc.moveDown(0.3);
                doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor("#cccccc").lineWidth(0.5).stroke();
                doc.moveDown(0.5);

                // Line items
                for (const li of so.line_items || []) {
                  if (doc.y > doc.page.height - 120) doc.addPage();
                  const itemName = li.title + (li.variant_title && li.variant_title !== "Default Title" ? ` — ${li.variant_title}` : "");
                  const unitPrice = parseFloat(li.price || "0");
                  const lineTotal = unitPrice * (li.quantity || 1);
                  const rowY = doc.y;
                  doc.fontSize(10).font("Helvetica").fillColor("#000000");
                  doc.text(itemName, col1, rowY, { width: col2 - col1 - 10 });
                  doc.text(String(li.quantity || 1), col2, rowY, { width: 40, align: "center" });
                  doc.text(`$${unitPrice.toFixed(2)}`, col3, rowY, { width: 50, align: "right" });
                  doc.text(`$${lineTotal.toFixed(2)}`, col4 - 10, rowY, { width: 60, align: "right" });
                  const afterY = doc.y;
                  doc.y = Math.max(afterY, rowY + 16);
                  doc.moveDown(0.3);
                }

                // Shipping lines
                for (const sl of so.shipping_lines || []) {
                  const rowY = doc.y;
                  doc.fontSize(10).font("Helvetica").fillColor("#555555");
                  doc.text(`Shipping: ${sl.title}`, col1, rowY, { width: col2 - col1 - 10 });
                  doc.text(`$${parseFloat(sl.price || "0").toFixed(2)}`, col4 - 10, rowY, { width: 60, align: "right" });
                  doc.y = Math.max(doc.y, rowY + 16);
                  doc.moveDown(0.3);
                }

                doc.moveDown(0.5);
                doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor("#cccccc").lineWidth(1).stroke();
                doc.moveDown(0.5);

                // Totals
                const totals = [
                  ["Subtotal", `$${parseFloat(so.subtotal_price || "0").toFixed(2)}`],
                  ["Tax (GST included)", `$${parseFloat(so.total_tax || "0").toFixed(2)}`],
                  ["TOTAL", `$${parseFloat(so.total_price || "0").toFixed(2)} AUD`],
                ];
                for (const [label, val] of totals) {
                  const rowY = doc.y;
                  const isBold = label === "TOTAL";
                  doc.fontSize(isBold ? 11 : 10).font(isBold ? "Helvetica-Bold" : "Helvetica").fillColor("#000000");
                  doc.text(label, col1, rowY);
                  doc.text(val, col4 - 10, rowY, { width: 60, align: "right" });
                  doc.y = Math.max(doc.y, rowY + (isBold ? 18 : 14));
                  doc.moveDown(0.2);
                }

                doc.end();
              });
              shopifyOrderPdfEntry = {
                fileName: `Shopify_Order_${so.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
                mimeType: "application/pdf",
                data: shopifyPdfBuffer.toString("base64"),
              };
              console.log(`[PURAX-SYNC] Generated Shopify original order PDF for ${so.name} (${shopifyPdfBuffer.length} bytes)`);
            } else {
              console.warn(`[PURAX-SYNC] Could not fetch Shopify order ${shopifyOrderId}: ${shopifyRes.status}`);
            }
          }
        } catch (shopifyErr: any) {
          console.warn(`[PURAX-SYNC] Failed to fetch/generate Shopify order PDF:`, shopifyErr.message);
        }
      }

      // For email-sourced orders (non-Shopify): convert original email to a PDF attachment
      let emailOriginalPdfEntry: { fileName: string; mimeType: string; data: string } | null = null;
      if (!shopifyOrderId && originalEmailHtml) {
        try {
          const { convertHtmlToPdf } = await import("./html-to-pdf");
          const emailPdfBuffer = await convertHtmlToPdf(originalEmailHtml);
          emailOriginalPdfEntry = {
            fileName: `Original_Email_Order_${order.orderNumber}.pdf`,
            mimeType: "application/pdf",
            data: emailPdfBuffer.toString("base64"),
          };
          console.log(`[PURAX-SYNC] Generated original email PDF for order ${order.orderNumber} (${emailPdfBuffer.length} bytes)`);
        } catch (emailPdfErr: any) {
          console.warn(`[PURAX-SYNC] Failed to generate email PDF:`, emailPdfErr.message);
        }
      }

      // For portal order requests (non-Shopify, non-email): generate a summary PDF of what the customer submitted
      let portalRequestPdfEntry: { fileName: string; mimeType: string; data: string } | null = null;
      if (!shopifyOrderId && !originalEmailHtml) {
        try {
          const srcReqResult = await pool.query(
            `SELECT cor.*
             FROM customer_order_requests cor
             WHERE cor.converted_order_id = $1 LIMIT 1`,
            [order.id]
          );
          if (srcReqResult.rows.length > 0) {
            const req = srcReqResult.rows[0];
            const items: any[] = Array.isArray(req.items) ? req.items : (req.items ? JSON.parse(req.items) : []);
            const customerLines = [
              ...items.map((item: any) =>
                `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${item.productName || item.name || "Item"}</td>
                 <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity || item.qty || 1}</td>
                 <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">$${parseFloat(item.unitPrice || item.price || "0").toFixed(2)}</td>
                 <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">$${(parseFloat(item.unitPrice || item.price || "0") * parseInt(item.quantity || item.qty || "1")).toFixed(2)}</td></tr>`
              ),
            ].join("");
            const companyDisplay = req.company_name || "";
            const contactDisplay = req.contact_name || "";
            const contactEmail = req.contact_email || "";
            const submittedAt = req.created_at ? new Date(req.created_at).toLocaleString("en-AU") : "";
            const portalHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
              <style>body{font-family:Arial,sans-serif;font-size:13px;color:#222;margin:30px;}
              h1{font-size:20px;margin-bottom:4px;}
              table{width:100%;border-collapse:collapse;margin-top:16px;}
              th{background:#f5f5f5;padding:8px;text-align:left;border-bottom:2px solid #ddd;font-size:12px;}
              .meta{color:#555;margin-bottom:4px;font-size:12px;}
              </style></head><body>
              <h1>Original Customer Portal Order</h1>
              <p class="meta"><strong>Submitted:</strong> ${submittedAt}</p>
              <p class="meta"><strong>Company:</strong> ${companyDisplay}</p>
              ${contactDisplay ? `<p class="meta"><strong>Contact:</strong> ${contactDisplay}</p>` : ""}
              ${contactEmail ? `<p class="meta"><strong>Email:</strong> ${contactEmail}</p>` : ""}
              ${req.customer_notes ? `<p class="meta"><strong>Customer Notes:</strong> ${req.customer_notes}</p>` : ""}
              <table>
                <thead><tr><th>Product</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Total</th></tr></thead>
                <tbody>${customerLines || '<tr><td colspan="4" style="padding:8px;color:#888;">(No line items recorded)</td></tr>'}</tbody>
                ${req.total_amount ? `<tfoot><tr><td colspan="3" style="padding:8px;font-weight:bold;">Total</td><td style="padding:8px;font-weight:bold;text-align:right;">$${parseFloat(req.total_amount).toFixed(2)}</td></tr></tfoot>` : ""}
              </table>
              </body></html>`;
            const { convertHtmlToPdf } = await import("./html-to-pdf");
            const portalPdfBuffer = await convertHtmlToPdf(portalHtml);
            portalRequestPdfEntry = {
              fileName: `Original_Portal_Order_${order.orderNumber}.pdf`,
              mimeType: "application/pdf",
              data: portalPdfBuffer.toString("base64"),
            };
            console.log(`[PURAX-SYNC] Generated portal order request PDF for order ${order.orderNumber} (${portalPdfBuffer.length} bytes)`);
          }
        } catch (portalPdfErr: any) {
          console.warn(`[PURAX-SYNC] Failed to generate portal order request PDF:`, portalPdfErr.message);
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

      // Only include actual product lines — header info (order number, company) goes in notes/combinedNotes
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

      // Build notes — for Shopify orders show only the Shopify order number; for others include CRM context
      let combinedNotes: string;
      if (shopifyOrderNumber) {
        // Shopify orders: just the Shopify order number (clean and simple for Milo)
        combinedNotes = `Shopify Order ${shopifyOrderNumber}`;
        if ((order as any).notes) combinedNotes += `\n\n${(order as any).notes}`;
      } else {
        const noteParts: string[] = [];
        noteParts.push(`CRM Order Number: ${order.orderNumber}`);
        if (order.customerNotes) noteParts.push(`Customer Notes:\n${order.customerNotes}`);
        if ((order as any).notes) noteParts.push(`Internal Notes:\n${(order as any).notes}`);
        combinedNotes = noteParts.join("\n\n");
      }

      // Fetch attachment file data from DB and convert to base64 for Purax
      console.log(`[PURAX-SYNC] Found ${orderAttachments.length} attachment(s) for order ${order.orderNumber}`);
      const attachmentsPayload = await Promise.all(
        orderAttachments.map(async (att: any) => {
          try {
            console.log(`[PURAX-SYNC] Fetching file_data for attachment id=${att.id}, name=${att.fileName}`);
            const result = await pool.query(
              `SELECT file_name, file_type, file_data, storage_path FROM attachments WHERE id = $1`,
              [att.id]
            );
            const row = result.rows[0];
            if (!row) {
              console.warn(`[PURAX-SYNC] No DB row found for attachment id=${att.id}`);
              return null;
            }
            let fileBuffer: Buffer | null = null;
            if (row.file_data) {
              fileBuffer = Buffer.isBuffer(row.file_data) ? row.file_data : Buffer.from(row.file_data);
            } else if (row.storage_path && !row.storage_path.startsWith("db://")) {
              // Fallback: try reading from filesystem (older attachments stored before file_data was implemented)
              try {
                const fsModule = await import("fs");
                const fsData = await fsModule.promises.readFile(row.storage_path);
                fileBuffer = fsData;
                console.log(`[PURAX-SYNC] Read attachment from filesystem: ${row.storage_path} (${fsData.length} bytes)`);
              } catch (fsErr: any) {
                console.warn(`[PURAX-SYNC] file_data null and filesystem read failed for ${row.file_name}: ${fsErr.message}`);
              }
            }
            if (!fileBuffer) {
              console.warn(`[PURAX-SYNC] No file content available for attachment id=${att.id}, name=${row.file_name}`);
              return null;
            }
            const b64 = fileBuffer.toString("base64");
            console.log(`[PURAX-SYNC] Attachment "${row.file_name}" encoded (${b64.length} base64 chars)`);
            return {
              fileName: row.file_name,
              mimeType: row.file_type,
              data: b64,
            };
          } catch (attErr) {
            console.error(`[PURAX-SYNC] Error fetching attachment id=${att.id}:`, attErr);
            return null;
          }
        })
      ).then(results => results.filter(Boolean));
      // For Shopify orders: use the Shopify PDF as pdfData (primary doc Milo processes as "Original Invoice")
      // and add the CRM summary PDF as an attachment. For all other orders keep CRM PDF as pdfData.
      let primaryPdfData: string;
      if (shopifyOrderPdfEntry) {
        primaryPdfData = shopifyOrderPdfEntry.data;
        // CRM summary goes as an attachment after the Shopify original
        attachmentsPayload.unshift({
          fileName: `CRM_Order_Summary_${order.orderNumber}.pdf`,
          mimeType: "application/pdf",
          data: pdfBuffer.toString("base64"),
        });
        console.log(`[PURAX-SYNC] Shopify order: using Shopify PDF as pdfData (${shopifyOrderPdfEntry.data.length} base64 chars), CRM PDF as attachment`);
      } else {
        primaryPdfData = pdfBuffer.toString("base64");
        if (portalRequestPdfEntry) {
          attachmentsPayload.unshift(portalRequestPdfEntry);
          console.log(`[PURAX-SYNC] Prepended portal original order PDF: ${portalRequestPdfEntry.fileName}`);
        }
        if (emailOriginalPdfEntry) {
          attachmentsPayload.unshift(emailOriginalPdfEntry);
          console.log(`[PURAX-SYNC] Prepended email original order PDF: ${emailOriginalPdfEntry.fileName}`);
        }
      }
      console.log(`[PURAX-SYNC] ${attachmentsPayload.length} attachment(s) will be sent to Purax (including source doc)`);

      const crmBaseUrl = `${req.protocol}://${req.get("host")}`;
      const webhookPayload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        companyName: company?.tradingName || company?.legalName || "",
        customerName: customerName || company?.tradingName || company?.legalName || "",
        customerAddress,
        customerPhone: order.customerPhone || contact?.phone || "",
        customerEmail: order.customerEmail || contact?.email || "",
        deliveryMethod: order.deliveryMethod || order.shippingMethod || "",
        paymentMethod: order.paymentMethod || "",
        shippingCost: "0",
        orderDetails: orderDetailsText,
        notes: combinedNotes,
        subtotal: `$${order.subtotal}`,
        tax: `$${order.tax}`,
        // Puradown prices are already GST-inclusive so send the full total; all other accounts send ex-GST subtotal
        totalAmount: `$${(company?.tradingName || company?.legalName || "").toLowerCase().includes('puradown') ? order.total : order.subtotal}`,
        pdfData: primaryPdfData,
        originalEmailHtml: originalEmailHtml || null,
        attachments: attachmentsPayload,
        isUrgent: false,
        callbackUrl: (() => {
          const crmKey = process.env.CRM_API_KEY;
          const base = `${crmBaseUrl}/api/webhooks/milo/order-complete`;
          return crmKey ? `${base}?key=${encodeURIComponent(crmKey)}` : base;
        })(),
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
        // Purax API sometimes returns 500 even when the order is successfully created on their side.
        // Treat 500 as "sent with warning" rather than a hard failure so the order isn't stuck.
        if (response.status === 500) {
          await storage.updateOrder(order.id, {
            puraxSyncStatus: "sent",
            puraxSyncedAt: now,
          });
          await storage.createActivity({
            entityType: "order",
            entityId: order.id,
            activityType: "system",
            content: `Synced to Purax (Purax returned 500 but order typically goes through — verify in Purax app)`,
            createdBy: req.session.userId,
          });
          await storage.createAuditLog({
            userId: req.session.userId,
            action: "update",
            entityType: "order",
            entityId: order.id,
            afterJson: { puraxSyncStatus: "sent", puraxSyncedAt: now },
          });
          return res.json({ success: true, warning: "Purax returned an error response but the order usually goes through. Please verify in the Purax app." });
        }
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

  // Helper: fire a webhook to Millie (or any configured URL) when an order is invoiced
  async function notifyMillieWebhook(payload: Record<string, any>) {
    try {
      const millieWebhookUrl = await storage.getSetting("millie_webhook_url");
      if (!millieWebhookUrl) return;

      const apiKey = process.env.CRM_API_KEY;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const resp = await fetch(millieWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        console.log(`[MILLIE-WEBHOOK] Notified ${millieWebhookUrl} — status ${resp.status}`);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        console.warn("[MILLIE-WEBHOOK] Request timed out after 8s — skipping");
      } else {
        console.error("[MILLIE-WEBHOOK] Failed to notify:", err?.message);
      }
    }
  }

  // Helper: when an invoice is sent/paid, auto-complete linked portal order and log it
  async function autoCompletePortalOrderForInvoice(invoice: any, updated: any) {
    try {
      if (!invoice.orderId) return;
      const order = await storage.getOrder(invoice.orderId);
      if (!order) return;

      // Also mark the CRM order itself as completed so portal order list reflects it
      await pool.query(
        `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1 AND status NOT IN ('completed', 'cancelled')`,
        [invoice.orderId]
      );

      // Find the portal order request linked to this CRM order
      const portalResult = await pool.query(
        `SELECT id, status FROM customer_order_requests WHERE converted_order_id = $1 LIMIT 1`,
        [invoice.orderId]
      );
      if (portalResult.rows.length > 0) {
        const portalOrder = portalResult.rows[0];
        if (portalOrder.status !== "completed") {
          await pool.query(
            `UPDATE customer_order_requests SET status = 'completed' WHERE id = $1`,
            [portalOrder.id]
          );
        }
      }

      // Add an activity log entry so the CRM shows what happened
      const invoiceNumber = updated.invoiceNumber || invoice.invoiceNumber;
      const invoiceStatus = updated.status || invoice.status;
      await storage.createActivity({
        entityType: "order",
        entityId: invoice.orderId,
        activityType: "system",
        content: `Invoice ${invoiceNumber} marked as ${invoiceStatus} — portal order automatically marked as completed.`,
        createdBy: null as any,
      });

      console.log(`[INVOICE] Portal order ${portalOrder.id} auto-completed after invoice ${invoiceNumber} was marked ${invoiceStatus}`);

      // Fire webhook to Millie (non-blocking — errors are caught inside)
      const company = order.companyId ? await storage.getCompany(order.companyId) : null;
      notifyMillieWebhook({
        event: "order_invoiced",
        orderId: order.id,
        orderNumber: order.orderNumber,
        companyName: company?.tradingName || company?.legalName || "",
        customerName: order.customerName || "",
        xeroInvoiceNumber: invoiceNumber,
        totalAmount: invoice.total,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[INVOICE] Failed to auto-complete portal order:", err);
    }
  }

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

  app.post("/api/invoices", requireEdit, async (req, res) => {
    try {
      const schema = z.object({
        orderId: z.string().optional(),
        companyId: z.string().min(1, "Company is required"),
        status: z.enum(["draft", "sent", "paid", "overdue", "void"]).default("draft"),
        issueDate: z.string().optional(),
        dueDate: z.string().optional(),
        subtotal: z.string().or(z.number()).transform(String).default("0"),
        tax: z.string().or(z.number()).transform(String).default("0"),
        total: z.string().or(z.number()).transform(String).default("0"),
        balanceDue: z.string().or(z.number()).transform(String).optional(),
      });

      const data = schema.parse(req.body);

      const existingInvoices = await storage.getAllInvoices();
      let maxNum = 0;
      for (const inv of existingInvoices) {
        const match = inv.invoiceNumber.match(/INV-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      const invoiceNumber = `INV-${String(maxNum + 1).padStart(4, "0")}`;

      const invoice = await storage.createInvoice({
        invoiceNumber,
        orderId: data.orderId || null,
        companyId: data.companyId,
        status: data.status,
        issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: data.subtotal,
        tax: data.tax,
        total: data.total,
        balanceDue: data.balanceDue || data.total,
      });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "invoice",
        entityId: invoice.id,
        details: { invoiceNumber: invoice.invoiceNumber, companyId: invoice.companyId, total: invoice.total },
      });

      res.status(201).json(invoice);
    } catch (error: any) {
      console.error("Create invoice error:", error);
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: error.errors[0]?.message || "Validation error" });
      }
      res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  app.patch("/api/invoices/:id", requireEdit, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const schema = z.object({
        status: z.enum(["draft", "sent", "paid", "overdue", "void"]).optional(),
        issueDate: z.string().optional(),
        dueDate: z.string().optional(),
        subtotal: z.string().or(z.number()).transform(String).optional(),
        tax: z.string().or(z.number()).transform(String).optional(),
        total: z.string().or(z.number()).transform(String).optional(),
        balanceDue: z.string().or(z.number()).transform(String).optional(),
      });

      const data = schema.parse(req.body);
      const updateData: any = {};
      if (data.status) updateData.status = data.status;
      if (data.issueDate) updateData.issueDate = new Date(data.issueDate);
      if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
      if (data.subtotal) updateData.subtotal = data.subtotal;
      if (data.tax) updateData.tax = data.tax;
      if (data.total) updateData.total = data.total;
      if (data.balanceDue) updateData.balanceDue = data.balanceDue;

      const updated = await storage.updateInvoice(req.params.id, updateData);

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "update",
        entityType: "invoice",
        entityId: req.params.id,
        beforeJson: invoice,
        afterJson: updated,
      });

      // When an invoice is marked sent or paid, auto-complete the linked portal order
      if (data.status === "sent" || data.status === "paid") {
        await autoCompletePortalOrderForInvoice(invoice, updated);
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Update invoice error:", error);
      res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  // Generate invoice from order
  app.post("/api/orders/:orderId/generate-invoice", requireEdit, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (!order.companyId) {
        return res.status(400).json({ message: "Order has no company assigned" });
      }

      const existingInvoices = await storage.getAllInvoices();
      const alreadyHasInvoice = existingInvoices.find(inv => inv.orderId === order.id);
      if (alreadyHasInvoice) {
        return res.status(400).json({ message: `This order already has invoice ${alreadyHasInvoice.invoiceNumber}` });
      }

      let maxNum = 0;
      for (const inv of existingInvoices) {
        const match = inv.invoiceNumber.match(/INV-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      const invoiceNumber = `INV-${String(maxNum + 1).padStart(4, "0")}`;

      const orderLinesList = await storage.getOrderLines(order.id);
      const subtotal = orderLinesList.reduce((sum, l) => sum + parseFloat(l.lineTotal || "0"), 0);
      const tax = subtotal * 0.1;
      const total = subtotal + tax;

      const invoice = await storage.createInvoice({
        invoiceNumber,
        orderId: order.id,
        companyId: order.companyId,
        status: "draft",
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        balanceDue: total.toFixed(2),
      });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "create",
        entityType: "invoice",
        entityId: invoice.id,
        details: { invoiceNumber, orderId: order.id, companyId: order.companyId, total: total.toFixed(2) },
      });

      const company = await storage.getCompany(invoice.companyId);
      res.status(201).json({ ...invoice, company, order });
    } catch (error) {
      console.error("Generate invoice from order error:", error);
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // GET invoice for a specific order (used on order detail page)
  app.get("/api/orders/:orderId/invoice", requireAuth, async (req, res) => {
    try {
      const allInvoices = await storage.getAllInvoices();
      const invoice = allInvoices.find(inv => inv.orderId === req.params.orderId);
      if (!invoice) return res.status(404).json({ message: "No invoice found for this order" });
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ message: "Failed to get invoice" });
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

  let xeroImportStatus: { running: boolean; progress: string; result: any | null; error: string | null } = {
    running: false, progress: "", result: null, error: null,
  };

  app.get("/api/xero/import-invoices/status", requireAdmin, async (_req, res) => {
    res.json(xeroImportStatus);
  });

  app.post("/api/xero/import-invoices", requireAdmin, async (req, res) => {
    try {
      if (xeroImportStatus.running) {
        return res.json({ message: "Import already in progress", status: "running", progress: xeroImportStatus.progress });
      }

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

      xeroImportStatus = { running: true, progress: "Starting import...", result: null, error: null };
      res.json({ message: "Import started in background", status: "running" });

      (async () => {
        try {
          xeroImportStatus.progress = "Fetching invoices from Xero...";
          const result = await importInvoicesFromXero(freshToken.accessToken, freshToken.tenantId);
          
          const newCount = result.imported.filter(i => i.isNew).length;
          const existingCount = result.imported.filter(i => !i.isNew).length;
          
          await storage.createAuditLog({
            userId: req.session.userId,
            action: "create",
            entityType: "xero_import_invoices",
            afterJson: { newOrders: newCount, skipped: existingCount, errors: result.errors.length },
          });
          
          xeroImportStatus = {
            running: false,
            progress: "Complete",
            result: { imported: newCount, skipped: existingCount, errors: result.errors, details: result.imported },
            error: null,
          };
          console.log(`[XERO-IMPORT] Complete: ${newCount} imported, ${existingCount} skipped, ${result.errors.length} errors`);
        } catch (error: any) {
          console.error("Xero import invoices error:", error?.message || error);
          xeroImportStatus = { running: false, progress: "Failed", result: null, error: error.message || "Failed to import invoices" };
        }
      })();
    } catch (error: any) {
      console.error("Xero import invoices error:", error?.message || error);
      if (error?.response?.statusCode === 401 || error?.statusCode === 401) {
        return res.status(401).json({ message: "Xero session expired. Please go to Admin > Integrations and reconnect Xero." });
      }
      res.status(500).json({ message: error.message || "Failed to import invoices from Xero" });
    }
  });

  let xeroRepairStatus: { running: boolean; progress: string; result: any | null; error: string | null } = {
    running: false, progress: "", result: null, error: null,
  };

  app.get("/api/xero/repair-invoices/status", requireAdmin, async (_req, res) => {
    res.json(xeroRepairStatus);
  });

  app.post("/api/xero/repair-invoices", requireAdmin, async (req, res) => {
    try {
      if (xeroRepairStatus.running) {
        return res.json({ message: "Repair already in progress", status: "running", progress: xeroRepairStatus.progress });
      }

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
        return res.status(401).json({ message: "Xero session expired. Please reconnect Xero." });
      }

      const freshToken = await getStoredToken();
      if (!freshToken) {
        return res.status(400).json({ message: "Xero token not found after refresh" });
      }

      xeroRepairStatus = { running: true, progress: "Scanning Xero invoices for missing records...", result: null, error: null };
      res.json({ message: "Repair started in background", status: "running" });

      (async () => {
        try {
          const result = await repairMissingInvoiceRecords(freshToken.accessToken, freshToken.tenantId);
          xeroRepairStatus = {
            running: false,
            progress: "Complete",
            result,
            error: null,
          };
          console.log(`[XERO-REPAIR] Complete: ${result.fixed} fixed, ${result.skipped} skipped, ${result.errors.length} errors`);
        } catch (error: any) {
          console.error("Xero repair invoices error:", error?.message || error);
          xeroRepairStatus = { running: false, progress: "Failed", result: null, error: error.message || "Failed to repair invoices" };
        }
      })();
    } catch (error: any) {
      console.error("Xero repair invoices error:", error?.message || error);
      res.status(500).json({ message: error.message || "Failed to repair invoices from Xero" });
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

      // Auto-complete linked portal order when synced to Xero
      await autoCompletePortalOrderForInvoice(invoice, { ...invoice, status: "sent", invoiceNumber: invoice.invoiceNumber });
      
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

  // Get emails (list - excludes bodyHtml for performance)
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
      
      const lightList = emailList.map(({ bodyHtml, ...rest }: any) => rest);
      res.json(lightList);
    } catch (error) {
      console.error("Get emails error:", error);
      res.status(500).json({ message: "Failed to get emails" });
    }
  });

  // Get single email detail (includes bodyHtml)
  app.get("/api/emails/:id/detail", requireAuth, async (req, res) => {
    try {
      const [email] = await db.select().from(emailsTable).where(eq(emailsTable.id, req.params.id)).limit(1);
      if (!email) {
        return res.status(404).json({ message: "Email not found" });
      }
      res.json(email);
    } catch (error) {
      console.error("Get email detail error:", error);
      res.status(500).json({ message: "Failed to get email detail" });
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

      // If no order lines from email body, try extracting from PDF attachments
      if (lines.length === 0) {
        console.log("[EMAIL-TO-ORDER] No order lines from email body, checking for PDF attachments...");
        try {
          const protocol = req.headers["x-forwarded-proto"] || req.protocol;
          const host = req.headers["x-forwarded-host"] || req.headers.host;
          const redirectUri = `${protocol}://${host}/api/outlook/callback`;
          const accessToken = await refreshOutlookTokenIfNeeded(email.userId, redirectUri);
          if (accessToken && email.outlookMessageId) {
            const attachments = await fetchEmailAttachments(accessToken, email.outlookMessageId);
            const pdfAttachments = attachments.filter((a: any) => !a.isInline && (a.contentType === "application/pdf" || a.name?.toLowerCase().endsWith(".pdf")));
            if (pdfAttachments.length > 0) {
              console.log(`[EMAIL-TO-ORDER] Found ${pdfAttachments.length} PDF attachment(s), extracting from first: ${pdfAttachments[0].name}`);
              const pdfBuffer = await downloadAttachment(accessToken, email.outlookMessageId, pdfAttachments[0].id);
              const pdfHeader = pdfBuffer.slice(0, 5).toString();
              if (pdfHeader === "%PDF-") {
                let pdfText = "";
                try {
                  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
                  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: true });
                  const pdfDoc = await loadingTask.promise;
                  const textParts: string[] = [];
                  for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items.filter((item: any) => "str" in item).map((item: any) => item.str).join(" ");
                    textParts.push(pageText);
                  }
                  pdfText = textParts.join("\n");
                } catch { pdfText = ""; }

                const isScannedPdf = !pdfText || pdfText.trim().length < 10;
                const OpenAI2 = (await import("openai")).default;
                const openai2 = new OpenAI2({
                  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
                  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
                });
                const pdfSystemPrompt = `You are an order data extraction assistant. Extract order details from the provided content.
Return a JSON object with: { "companyName": "", "contactName": "", "contactEmail": "", "contactPhone": "", "deliveryAddress": "", "poNumber": "", "notes": "", "lines": [{"description": "", "quantity": 1, "unitPrice": 0, "lineTotal": 0}], "subtotal": 0, "tax": 0, "total": 0 }
Rules: Extract ALL line items. If prices are not present, use 0. Quantities must be integers >= 1. Return ONLY the JSON object.`;

                let pdfAiResponse;
                if (isScannedPdf) {
                  const { execSync } = await import("child_process");
                  const fsP = await import("fs");
                  const osP = await import("os");
                  const pathP = await import("path");
                  const tmpDir = fsP.mkdtempSync(pathP.join(osP.tmpdir(), "pdf-ocr-"));
                  const pdfPath = pathP.join(tmpDir, "input.pdf");
                  fsP.writeFileSync(pdfPath, pdfBuffer);
                  try {
                    execSync(`pdftoppm -png -r 200 -l 3 "${pdfPath}" "${pathP.join(tmpDir, "page")}"`);
                    const pageFiles = fsP.readdirSync(tmpDir).filter((f: string) => f.endsWith(".png")).sort().slice(0, 3);
                    if (pageFiles.length > 0) {
                      const imageContents: any[] = pageFiles.map((f: string) => {
                        const imgBuf = fsP.readFileSync(pathP.join(tmpDir, f));
                        return { type: "image_url" as const, image_url: { url: `data:image/png;base64,${imgBuf.toString("base64")}` } };
                      });
                      pdfAiResponse = await openai2.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                          { role: "system", content: pdfSystemPrompt },
                          { role: "user", content: [{ type: "text" as const, text: "Extract order details from this scanned PDF:" }, ...imageContents] }
                        ],
                        response_format: { type: "json_object" },
                      });
                    }
                  } finally {
                    try { const files = fsP.readdirSync(tmpDir); for (const f of files) fsP.unlinkSync(pathP.join(tmpDir, f)); fsP.rmdirSync(tmpDir); } catch {}
                  }
                } else {
                  pdfAiResponse = await openai2.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                      { role: "system", content: pdfSystemPrompt },
                      { role: "user", content: `Extract order details from this PDF:\n\n${pdfText.substring(0, 8000)}` }
                    ],
                    response_format: { type: "json_object" },
                  });
                }

                if (pdfAiResponse) {
                  const pdfContent = pdfAiResponse.choices[0]?.message?.content || "{}";
                  try {
                    const pdfData = JSON.parse(pdfContent);
                    if (pdfData.lines && Array.isArray(pdfData.lines)) {
                      for (const l of pdfData.lines) {
                        if (l.description) {
                          lines.push({
                            description: l.description,
                            quantity: Math.max(1, parseInt(l.quantity) || 1),
                            unitPrice: parseFloat(l.unitPrice) || 0,
                            lineTotal: parseFloat(l.lineTotal) || 0,
                          });
                        }
                      }
                    }
                    if (pdfData.companyName && !companyName) companyName = pdfData.companyName;
                    if (pdfData.contactName && !customerName) customerName = pdfData.contactName;
                    if (pdfData.contactEmail && !customerEmail) customerEmail = pdfData.contactEmail;
                    if (pdfData.contactPhone && !customerPhone) customerPhone = pdfData.contactPhone;
                    if (pdfData.deliveryAddress && !customerAddress) customerAddress = pdfData.deliveryAddress;
                    if (pdfData.subtotal) subtotal = parseFloat(pdfData.subtotal) || subtotal;
                    if (pdfData.tax) { /* tax handled later */ }
                    if (pdfData.total) total = parseFloat(pdfData.total) || total;
                    if (pdfData.poNumber) shopifyOrderNum = pdfData.poNumber;
                    console.log(`[EMAIL-TO-ORDER] Extracted ${lines.length} lines from PDF attachment: ${pdfAttachments[0].name}`);
                  } catch (jsonErr) {
                    console.error("[EMAIL-TO-ORDER] Failed to parse PDF AI response:", jsonErr);
                  }
                }
              }
            }
          }
        } catch (pdfErr: any) {
          console.error("[EMAIL-TO-ORDER] PDF fallback extraction failed:", pdfErr?.message);
        }
      }

      if (lines.length === 0) {
        console.error("[EMAIL-TO-ORDER] No order lines extracted from email or PDF. Subject:", subject);
        return res.status(400).json({ 
          error: "No order lines could be parsed from this email or its PDF attachments. The AI could not extract any products. Please check the email content or create the order manually." 
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
          console.log(`[EMAIL-TO-ORDER] Forwarded Shopify - extracted reseller from brackets: "${reseller}"`);
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
          if (company) {
            console.log(`[EMAIL-TO-ORDER] Matched reseller to company: "${company.legalName}" (${company.id})`);
          } else {
            console.log(`[EMAIL-TO-ORDER] No company match found for reseller: "${reseller}"`);
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
        const fromDisplayName = (email.fromName || "").toLowerCase().replace(/^hq\s+/i, "").trim();

        // Collect all searchable text for company matching
        const subjectClean = subject.toLowerCase().replace(/^(fw|fwd|re):\s*/gi, "").replace(/[.]/g, "").replace(/\border\b/gi, "").trim();
        const textClean = plainText.toLowerCase().replace(/[.]/g, "");
        const companyMatches: Array<{ company: any; score: number }> = [];

        // Helper to match company names against search text
        const matchCompanyInText = (searchText: string, scoreBonus: number) => {
          for (const c of allCompanies) {
            if (companyMatches.some(m => m.company.id === c.id)) continue;
            const rawNames = [c.legalName, c.tradingName].filter(Boolean);
            for (const rawName of rawNames) {
              const nameLower = rawName!.toLowerCase();
              const nameWithoutCod = nameLower.replace(/\/cod\s*$/i, "").trim();
              const nameParts = nameLower.split(/[\/\\|]+/).map(p => p.trim()).filter(p => p.length >= 2 && p !== "cod");
              const cleanName = nameWithoutCod.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

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
                if (regex.test(searchText)) {
                  companyMatches.push({ company: c, score: target.length + scoreBonus });
                  break;
                }
              }
            }
          }
        };

        // 1. Try matching from subject (highest priority)
        matchCompanyInText(subjectClean, 20);

        // 2. Try matching from "From" display name (e.g. "HQ Ecolinen" -> "ecolinen")
        if (fromDisplayName && fromDisplayName.length >= 3) {
          matchCompanyInText(fromDisplayName, 15);
        }

        // 3. Try matching from email body text
        matchCompanyInText(textClean, 0);

        // 4. Try matching from PDF-extracted company name
        if (companyName && companyName.length >= 3) {
          const pdfCompanyClean = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
          matchCompanyInText(pdfCompanyClean, 10);
        }

        if (companyMatches.length > 0) {
          companyMatches.sort((a, b) => b.score - a.score);
          company = companyMatches[0].company;
          console.log(`[EMAIL-TO-ORDER] Company matched: "${company.legalName}" (score: ${companyMatches[0].score})`);
        }

        // 5. Try matching by contact email (sender or CC)
        if (!company) {
          const emailsToCheck = [senderEmail];
          if (email.ccAddresses && Array.isArray(email.ccAddresses)) {
            emailsToCheck.push(...email.ccAddresses.map((e: string) => e.trim()));
          }
          for (const checkEmail of emailsToCheck) {
            if (!checkEmail) continue;
            const matchedContacts = await db.select().from(contacts).where(ilike(contacts.email, checkEmail)).limit(1);
            if (matchedContacts.length > 0) {
              company = allCompanies.find(c => c.id === matchedContacts[0].companyId);
              if (company) {
                console.log(`[EMAIL-TO-ORDER] Company matched via contact email "${checkEmail}": "${company.legalName}"`);
                break;
              }
            }
          }
        }

        // 6. Try matching by email domain to company name (sender domain first, then CC domains)
        const ignoreDomains = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "post.saasu.com", "xero.com"]);
        const domainsToCheck: string[] = [];
        if (senderDomain && !ignoreDomains.has(senderDomain)) domainsToCheck.push(senderDomain);
        if (email.ccAddresses && Array.isArray(email.ccAddresses)) {
          for (const cc of email.ccAddresses) {
            const ccDomain = cc.split("@")[1]?.toLowerCase() || "";
            if (ccDomain && !ignoreDomains.has(ccDomain)) domainsToCheck.push(ccDomain);
          }
        }
        for (const domain of domainsToCheck) {
          if (company) break;
          const domainName = domain.replace(/\.(com|com\.au|net|org|co).*$/, "").replace(/^(shop|info|orders|sales|hello|notifications|noreply|no-reply)/, "");
          if (domainName.length >= 3) {
            company = allCompanies.find(c =>
              c.legalName.toLowerCase().replace(/[^a-z0-9]/g, "").includes(domainName) ||
              (c.tradingName && c.tradingName.toLowerCase().replace(/[^a-z0-9]/g, "").includes(domainName))
            );
            if (company) console.log(`[EMAIL-TO-ORDER] Company matched via domain "${domain}": "${company.legalName}"`);
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
        const shopifyNotePattern = new RegExp(`(^|\\W)#?${shopifyOrderNum}(\\W|$)`);
        const duplicate = existingOrders.find((o) => 
          o.orderNumber === `PD-${shopifyOrderNum}` || 
          o.orderNumber === shopifyOrderNum ||
          o.sourceEmailId === emailId
        );
        if (duplicate) {
          if (duplicate.sourceEmailId === emailId) {
            return res.status(400).json({ message: `This email was already converted to order ${duplicate.orderNumber}`, orderId: duplicate.id });
          }
          if (company && duplicate.companyId !== company.id) {
            const existingForSameCompany = existingOrders.find((o) => 
              o.companyId === company.id && (
                o.sourceEmailId === emailId ||
                o.internalNotes?.includes(`Shopify #${shopifyOrderNum}`) ||
                o.customerNotes?.includes(`Shopify #${shopifyOrderNum}`)
              )
            );
            if (existingForSameCompany) {
              return res.status(400).json({ message: `Order for ${company.legalName} with Shopify #${shopifyOrderNum} already exists`, orderId: existingForSameCompany.id });
            }
            console.log(`[EMAIL-TO-ORDER] Order #${shopifyOrderNum} exists for different company (${duplicate.companyId}), preserving original order number for ${company.legalName}`);
            orderNumber = shopifyOrderNum;
          } else if (duplicate.companyId === company?.id) {
            return res.status(400).json({ message: `Order #${shopifyOrderNum} already exists for ${company.legalName}`, orderId: duplicate.id });
          } else {
            return res.status(400).json({ message: `Order with Shopify # ${shopifyOrderNum} already exists`, orderId: duplicate.id });
          }
        } else {
          orderNumber = shopifyOrderNum;
        }
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
        internalNotes: shopifyOrderNum
          ? (isForwardedShopify 
              ? `Forwarded Shopify #${shopifyOrderNum} for ${company.legalName}` 
              : `Shopify #${shopifyOrderNum}`)
          : undefined,
        customerNotes: isForwardedShopify
          ? `Converted from forwarded Shopify email (${company.legalName}). Shopify #${shopifyOrderNum || "N/A"}. Customer: ${customerName}. Shipping: $${shipping.toFixed(2)}`
          : isShopifyEmail
            ? `Converted from Puradown email. Shopify #${shopifyOrderNum || "N/A"}. Customer: ${customerName}. Shipping: $${shipping.toFixed(2)}`
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
      const fs = await import("fs");
      const path = await import("path");
      const uploadsDir = path.default.join(process.cwd(), "uploads", "orders", order.id);
      await fs.promises.mkdir(uploadsDir, { recursive: true });

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
          const safeSubject = subject.replace(/[^a-zA-Z0-9_\-\s#]/g, "").trim().replace(/\s+/g, "_").substring(0, 80);
          const fileName = `Email_${safeSubject || "order"}.pdf`;
          const filePath = path.default.join(uploadsDir, fileName);
          await fs.promises.writeFile(filePath, pdfBuffer);
          console.log(`[EMAIL-TO-ORDER] PDF saved to: ${filePath}`);
          await pool.query(
            `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_type, file_size, storage_path, uploaded_by, uploaded_at, description, file_data)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)`,
            ["order", order.id, fileName, "application/pdf", pdfBuffer.length, filePath, req.session.userId, `Original email: ${subject}`, pdfBuffer]
          );
          console.log(`[EMAIL-TO-ORDER] Auto-attached email PDF to order ${order.orderNumber} (with file_data)`);
        } else {
          console.warn(`[EMAIL-TO-ORDER] No HTML body found for email, skipping PDF attachment`);
        }
      } catch (attachError: any) {
        console.error("[EMAIL-TO-ORDER] Failed to auto-attach email PDF:", attachError?.message || attachError);
        console.error("[EMAIL-TO-ORDER] PDF attachment stack:", attachError?.stack);
      }

      // Also download and attach any Outlook email attachments (shipping labels, PDFs, etc.)
      try {
        const protocol = req.headers["x-forwarded-proto"] || req.protocol;
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const redirectUri = `${protocol}://${host}/api/outlook/callback`;
        const accessToken = await refreshOutlookTokenIfNeeded(email.userId, redirectUri);
        if (accessToken && email.outlookMessageId) {
          const attRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${email.outlookMessageId}/attachments`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (attRes.ok) {
            const attData = await attRes.json() as any;
            const fileAttachments = (attData.value || []).filter((a: any) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && !a.isInline);
            console.log(`[EMAIL-TO-ORDER] Found ${fileAttachments.length} email attachments to download`);
            for (const att of fileAttachments) {
              try {
                const attBuffer = Buffer.from(att.contentBytes, "base64");
                const rawName = att.name || "attachment";
                const attFileName = path.default.basename(rawName).replace(/[^a-zA-Z0-9_\-.\s]/g, "_");
                const attFilePath = path.default.join(uploadsDir, attFileName);
                await fs.promises.writeFile(attFilePath, attBuffer);
                await pool.query(
                  `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_type, file_size, storage_path, uploaded_by, uploaded_at, description, file_data)
                   VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)`,
                  ["order", order.id, attFileName, att.contentType || "application/octet-stream", attBuffer.length, attFilePath, req.session.userId, `Email attachment: ${attFileName}`, attBuffer]
                );
                console.log(`[EMAIL-TO-ORDER] Attached email file: ${attFileName} (${attBuffer.length} bytes, with file_data)`);
              } catch (fileErr: any) {
                console.error(`[EMAIL-TO-ORDER] Failed to attach file ${att.name}:`, fileErr?.message);
              }
            }
          }
        }
      } catch (outlookAttachErr: any) {
        console.error("[EMAIL-TO-ORDER] Failed to download Outlook attachments:", outlookAttachErr?.message);
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

  // ==================== ONE-TIME PRICE LIST CLEANUP ====================
  app.delete("/api/admin/cleanup-old-price-lists", async (req, res) => {
    const key = (req.query.key || req.headers["x-api-key"]) as string;
    if (!key || key !== process.env.CRM_API_KEY) return res.status(401).json({ message: "Unauthorized" });
    const oldNames = [
      "EXTRA FIRM FILL AS FIRM PRICE",
      "EXTRA FIRM FILL AS FIRM PRICE ",
      "HOTEL LUXURY HUNGARIAN PILLOW",
      "JENNIFER BUTTON",
      "L&M",
      "eco down under",
    ];
    const deleted: string[] = [];
    for (const name of oldNames) {
      const rows = await pool.query("SELECT id FROM price_lists WHERE name = $1", [name]);
      for (const row of rows.rows) {
        await pool.query("UPDATE companies SET price_list_id = NULL WHERE price_list_id = $1", [row.id]);
        await pool.query("DELETE FROM price_list_prices WHERE price_list_id = $1", [row.id]);
        await pool.query("DELETE FROM price_lists WHERE id = $1", [row.id]);
        deleted.push(name);
      }
    }
    res.json({ deleted, message: `Removed ${deleted.length} old price lists` });
  });

  // ==================== MILO ORDER-COMPLETE CALLBACK WEBHOOK ====================
  // Called by the Milo/Purax app when an order has been completed
  app.post("/api/webhooks/milo/order-complete", async (req, res) => {
    try {
      // Authenticate using CRM_API_KEY — accept from header OR query param so Milo
      // can call the URL directly without needing custom header configuration.
      const providedKey = req.headers["x-api-key"]
        || req.headers["authorization"]?.toString().replace("Bearer ", "")
        || (req.query.key as string | undefined);
      const expectedKey = process.env.CRM_API_KEY;
      if (expectedKey && providedKey !== expectedKey) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { orderId, orderNumber } = req.body as { orderId?: string; orderNumber?: string };
      if (!orderId && !orderNumber) {
        return res.status(400).json({ message: "orderId or orderNumber is required" });
      }

      // Find the order
      let order: any = null;
      if (orderId) {
        const r = await pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
        order = r.rows[0];
      }
      if (!order && orderNumber) {
        const r = await pool.query(`SELECT * FROM orders WHERE order_number = $1`, [orderNumber]);
        order = r.rows[0];
      }

      if (!order) {
        return res.status(404).json({ message: `Order not found (orderId=${orderId}, orderNumber=${orderNumber})` });
      }

      // Mark the order as completed
      await pool.query(
        `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [order.id]
      );

      // Also mark any linked portal order request as completed
      await pool.query(
        `UPDATE customer_order_requests SET status = 'completed'
         WHERE converted_order_id = $1 AND status != 'completed'`,
        [order.id]
      );

      // Log the activity
      await storage.createActivity({
        entityType: "order",
        entityId: order.id,
        activityType: "system",
        content: `Order marked as completed by Milo (Purax app callback)`,
        createdBy: null,
      });

      console.log(`[MILO-CALLBACK] Order ${order.order_number} (${order.id}) marked as completed`);
      return res.json({ success: true, message: `Order ${order.order_number} marked as completed` });
    } catch (err: any) {
      console.error("[MILO-CALLBACK] Error:", err.message);
      return res.status(500).json({ message: "Internal server error" });
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

  // ==================== MILLIE INCOMING WEBHOOK ====================
  // POST /api/webhook/order-completed — receives notifications from Millie (or any external system)
  // Secured with CRM_API_KEY as a Bearer token
  app.post("/api/webhook/order-completed", async (req, res) => {
    try {
      const apiKey = process.env.CRM_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ ok: false, message: "Webhook not configured — CRM_API_KEY missing" });
      }

      const authHeader = req.headers["authorization"] || "";
      const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
      if (provided !== apiKey) {
        console.warn("[MILLIE-WEBHOOK-IN] Rejected request — invalid API key");
        return res.status(401).json({ ok: false, message: "Invalid API key" });
      }

      const body = req.body as Record<string, any>;
      const { event, orderId, orderNumber, companyName, customerName, xeroInvoiceNumber, totalAmount, completedAt } = body;

      console.log(`[MILLIE-WEBHOOK-IN] Received event="${event}" orderNumber="${orderNumber}" orderId="${orderId}" invoice="${xeroInvoiceNumber}"`);

      // Resolve the CRM order — try by ID first, then by order number
      let resolvedOrderId: string | null = orderId || null;
      if (!resolvedOrderId && orderNumber) {
        try {
          const found = await pool.query(
            `SELECT id FROM orders WHERE order_number = $1 LIMIT 1`,
            [String(orderNumber)]
          );
          if (found.rows.length > 0) resolvedOrderId = found.rows[0].id;
        } catch (_) {}
      }

      // Mark the order as completed
      if (resolvedOrderId) {
        try {
          await pool.query(
            `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1 AND status != 'completed'`,
            [resolvedOrderId]
          );
          console.log(`[MILLIE-WEBHOOK-IN] Order ${resolvedOrderId} (${orderNumber || ""}) marked as completed`);

          // Log an activity note against the order
          await storage.createActivity({
            entityType: "order",
            entityId: resolvedOrderId,
            activityType: "system",
            content: `Order marked as completed — Milo notification received${xeroInvoiceNumber ? ` (Invoice ${xeroInvoiceNumber})` : ""}${completedAt ? ` at ${new Date(completedAt).toLocaleString("en-AU")}` : ""}.`,
            createdBy: null as any,
          });
        } catch (err: any) {
          console.error("[MILLIE-WEBHOOK-IN] Failed to update order status:", err?.message);
        }
      } else {
        console.warn(`[MILLIE-WEBHOOK-IN] Could not resolve order — orderId="${orderId}" orderNumber="${orderNumber}"`);
      }

      res.json({
        ok: true,
        received: true,
        event: event || "unknown",
        orderNumber: orderNumber || null,
        orderId: resolvedOrderId || null,
        processedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[MILLIE-WEBHOOK-IN] Error:", err?.message);
      res.status(500).json({ ok: false, message: "Internal server error" });
    }
  });

  // ==================== CUSTOMER ORDER REQUESTS (ADMIN) ====================
  app.get("/api/customer-order-requests/pending-count", requireAuth, async (_req, res) => {
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM customer_order_requests WHERE status = 'pending'`);
      res.json({ count: parseInt(result.rows[0].count) || 0 });
    } catch (error) {
      res.status(500).json({ count: 0 });
    }
  });

  app.get("/api/customer-order-requests", requireAuth, async (_req, res) => {
    try {
      const requests = await storage.getAllCustomerOrderRequests();
      const attachCounts = await pool.query(
        `SELECT entity_id, COUNT(*)::int as count FROM attachments WHERE entity_type = 'order_request' GROUP BY entity_id`
      );
      const countMap: Record<string, number> = {};
      for (const row of attachCounts.rows) {
        countMap[row.entity_id] = row.count;
      }
      // Get purax sync status from linked orders
      const puraxResult = await pool.query(
        `SELECT id, purax_sync_status, purax_synced_at FROM orders WHERE id IN (
          SELECT converted_order_id FROM customer_order_requests WHERE converted_order_id IS NOT NULL
        )`
      );
      const puraxMap: Record<string, { status: string; syncedAt: string | null }> = {};
      for (const row of puraxResult.rows) {
        puraxMap[row.id] = { status: row.purax_sync_status, syncedAt: row.purax_synced_at };
      }
      const withCounts = requests.map((r: any) => {
        const purax = r.convertedOrderId ? puraxMap[r.convertedOrderId] : null;
        return {
          ...r,
          attachmentCount: countMap[r.id] || 0,
          puraxSyncStatus: purax?.status || null,
          puraxSyncedAt: purax?.syncedAt || null,
        };
      });
      res.json(withCounts);
    } catch (error) {
      console.error("Get order requests error:", error);
      res.status(500).json({ message: "Failed to load order requests" });
    }
  });

  app.get("/api/customer-order-requests/:id", requireAuth, async (req, res) => {
    try {
      const request = await storage.getCustomerOrderRequest(req.params.id);
      if (!request) return res.status(404).json({ message: "Order request not found" });
      const attachments = await pool.query(
        `SELECT id, file_name, file_type, file_size, storage_path, uploaded_at FROM attachments WHERE entity_type = 'order_request' AND entity_id = $1 ORDER BY uploaded_at`,
        [req.params.id]
      );
      res.json({
        ...request,
        attachments: attachments.rows.map((a: any) => ({
          id: a.id,
          fileName: a.file_name,
          fileType: a.file_type,
          fileSize: a.file_size,
          storagePath: a.storage_path,
          uploadedAt: a.uploaded_at,
        })),
      });
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
    const client = await pool.connect();
    try {
      const orderRequest = await storage.getCustomerOrderRequest(req.params.id);
      if (!orderRequest) return res.status(404).json({ message: "Order request not found" });
      if (orderRequest.status === "converted") {
        return res.status(400).json({ message: "This order request has already been converted" });
      }

      const allCompanies = await storage.getAllCompanies();
      const reqName = orderRequest.companyName.toLowerCase().trim();
      let company = allCompanies.find(
        (c) =>
          c.legalName.toLowerCase() === reqName ||
          (c.tradingName && c.tradingName.toLowerCase() === reqName)
      );

      if (!company) {
        company = allCompanies.find(
          (c) =>
            c.legalName.toLowerCase().includes(reqName) ||
            reqName.includes(c.legalName.toLowerCase()) ||
            (c.tradingName && (c.tradingName.toLowerCase().includes(reqName) || reqName.includes(c.tradingName.toLowerCase())))
        );
      }

      if (!company && orderRequest.contactEmail) {
        const emailDomain = orderRequest.contactEmail.split("@")[1]?.toLowerCase();
        if (emailDomain && !["gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "icloud.com", "live.com"].includes(emailDomain)) {
          company = allCompanies.find(
            (c) => c.emailAddresses && c.emailAddresses.some((e: string) => e.toLowerCase().endsWith("@" + emailDomain))
          );
        }
      }

      const overrideCompanyId = req.body?.companyId;
      if (!company && overrideCompanyId) {
        company = allCompanies.find((c) => c.id === overrideCompanyId);
      }

      if (!company) {
        const suggestions = allCompanies
          .filter((c) => {
            const ln = c.legalName.toLowerCase();
            const tn = (c.tradingName || "").toLowerCase();
            const words = reqName.split(/\s+/);
            return words.some((w) => w.length >= 3 && (ln.includes(w) || tn.includes(w)));
          })
          .slice(0, 5)
          .map((c) => c.tradingName || c.legalName);
        const suggestionText = suggestions.length > 0
          ? ` Did you mean: ${suggestions.join(", ")}?`
          : "";
        return res.status(400).json({ 
          message: `Could not match "${orderRequest.companyName}" to an existing company.${suggestionText} You can edit the company name on the request, or create the order manually with the correct company.`
        });
      }

      const items = (orderRequest.items as any[]) || [];

      // Build convertPriceMap: company's main price list (or Standard fallback) + additional price lists
      const convertPriceMap = new Map<string, number>();
      let convertEffectivePriceListId = company.priceListId;
      if (!convertEffectivePriceListId) {
        const stdList = await client.query(`SELECT id FROM price_lists WHERE LOWER(name) = 'standard' LIMIT 1`);
        if (stdList.rows.length > 0) convertEffectivePriceListId = stdList.rows[0].id;
      }
      const convertPriceListIds: string[] = [];
      if (convertEffectivePriceListId) convertPriceListIds.push(convertEffectivePriceListId);
      const convertAdditionalPls = await client.query(
        `SELECT price_list_id FROM company_additional_price_lists WHERE company_id = $1`,
        [company.id]
      );
      for (const r of convertAdditionalPls.rows) {
        if (!convertPriceListIds.includes(r.price_list_id)) convertPriceListIds.push(r.price_list_id);
      }
      const convertOrderedIds = [...convertPriceListIds.slice(1), ...(convertPriceListIds[0] ? [convertPriceListIds[0]] : [])];
      for (const plId of convertOrderedIds) {
        const priceRows = await client.query(
          `SELECT product_id, filling, weight, unit_price FROM price_list_prices WHERE price_list_id = $1`,
          [plId]
        );
        for (const row of priceRows.rows) {
          const key = `${row.product_id}|${row.filling || ''}|${row.weight || ''}`;
          convertPriceMap.set(key, parseFloat(row.unit_price));
          convertPriceMap.set(row.product_id, parseFloat(row.unit_price));
        }
      }

      const resolvedItems = items.map((item: any) => {
        let unitPrice = Number(item.unitPrice) || 0;
        if (unitPrice === 0 && item.productId) {
          const variantKey = `${item.productId}|${item.filling || ''}|${item.weight || ''}`;
          unitPrice = convertPriceMap.get(variantKey) ?? convertPriceMap.get(item.productId) ?? 0;
        }
        const qty = item.quantity || 1;
        const lineTotal = Number(item.lineTotal) || Math.round(qty * unitPrice * 100) / 100;
        return { ...item, unitPrice, lineTotal };
      });

      const subtotal = resolvedItems.reduce((sum: number, item: any) => sum + (Number(item.lineTotal) || 0), 0);
      const tax = Math.round(subtotal * 0.1 * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;

      await client.query('BEGIN');

      const maxResult2 = await client.query(`SELECT COALESCE(MAX(CAST(order_number AS INTEGER)), 0) as max_num FROM orders WHERE order_number ~ '^[0-9]+$'`);
      const orderNumber = String((parseInt(maxResult2.rows[0].max_num) || 0) + 1);

      const customerName = orderRequest.contactName || company.tradingName || company.legalName;
      const customerEmail = orderRequest.contactEmail || (company.emailAddresses && company.emailAddresses.length > 0 ? company.emailAddresses[0] : null);
      const customerPhone = orderRequest.contactPhone || company.phone || null;
      const customerAddress = orderRequest.shippingAddress || company.shippingAddress || company.billingAddress || null;

      const shopifyOrderIdFromReq = (orderRequest as any).shopifyOrderId || null;
      const shopifyOrderNumberFromReq = (orderRequest as any).shopifyOrderNumber || null;
      const paymentStatusFromReq = (orderRequest as any).paymentStatus || "unpaid";

      const orderResult = await client.query(
        `INSERT INTO orders (id, order_number, company_id, status, order_date, subtotal, tax, total, customer_notes, customer_name, customer_email, customer_phone, customer_address, created_by, shopify_order_id, shopify_order_number, payment_status, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'new', NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()) RETURNING *`,
        [orderNumber, company.id, subtotal.toFixed(2), tax.toFixed(2), total.toFixed(2), orderRequest.customerNotes || null, customerName, customerEmail, customerPhone, customerAddress, req.session.userId, shopifyOrderIdFromReq, shopifyOrderNumberFromReq, paymentStatusFromReq]
      );
      const order = orderResult.rows[0];

      for (const item of resolvedItems) {
        await client.query(
          `INSERT INTO order_lines (id, order_id, product_id, description_override, quantity, unit_price, discount, line_total)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, '0', $6)`,
          [order.id, item.productId || null, item.description || item.productName || "Item", item.quantity || 1, String(item.unitPrice || "0"), String(item.lineTotal || "0")]
        );
      }

      await client.query(
        `UPDATE customer_order_requests SET status = 'converted', converted_order_id = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3`,
        [order.id, req.session.userId, req.params.id]
      );

      // Copy attachments from order request to the new order
      const copyResult = await client.query(
        `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_type, file_size, storage_path, uploaded_by, uploaded_at, file_data)
         SELECT gen_random_uuid(), 'order', $1, file_name, file_type, file_size, storage_path, uploaded_by, uploaded_at, file_data
         FROM attachments WHERE entity_type = 'order_request' AND entity_id = $2`,
        [order.id, req.params.id]
      );
      console.log(`[CONVERT] Copied ${copyResult.rowCount} attachment(s) from order_request ${req.params.id} to order ${order.id}`);

      await client.query('COMMIT');

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

      res.status(201).json({
        id: order.id,
        orderNumber: order.order_number,
        companyId: order.company_id,
        status: order.status,
        total: order.total,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error("Convert order request error:", error);
      res.status(500).json({ message: "Failed to convert order request" });
    } finally {
      client.release();
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

  app.post("/api/orders/:id/recalculate-prices", requireEdit, async (req, res) => {
    try {
      const orderResult = await pool.query(
        `SELECT o.*, c.price_list_id FROM orders o LEFT JOIN companies c ON c.id = o.company_id WHERE o.id = $1`,
        [req.params.id]
      );
      if (orderResult.rows.length === 0) return res.status(404).json({ message: "Order not found" });
      const order = orderResult.rows[0];
      const items: any[] = order.order_items || [];

      // Build priceMap: company's main price list (or Standard fallback) + additional price lists
      const priceMap = new Map<string, number>();
      let effectivePl = order.price_list_id;
      if (!effectivePl) {
        const stdList = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) = 'standard' LIMIT 1`);
        if (stdList.rows.length > 0) effectivePl = stdList.rows[0].id;
      }
      const recalcPriceListIds: string[] = [];
      if (effectivePl) recalcPriceListIds.push(effectivePl);
      if (order.company_id) {
        const recalcAddl = await pool.query(
          `SELECT price_list_id FROM company_additional_price_lists WHERE company_id = $1`,
          [order.company_id]
        );
        for (const r of recalcAddl.rows) {
          if (!recalcPriceListIds.includes(r.price_list_id)) recalcPriceListIds.push(r.price_list_id);
        }
      }
      const recalcOrdered = [...recalcPriceListIds.slice(1), ...(recalcPriceListIds[0] ? [recalcPriceListIds[0]] : [])];
      for (const plId of recalcOrdered) {
        const plPrices = await pool.query(`SELECT product_id, filling, weight, unit_price FROM price_list_prices WHERE price_list_id = $1`, [plId]);
        for (const row of plPrices.rows) {
          const key = `${row.product_id}|${row.filling || ''}|${row.weight || ''}`;
          priceMap.set(key, parseFloat(row.unit_price));
          priceMap.set(row.product_id, parseFloat(row.unit_price));
        }
      }

      let updated = 0;
      const updatedItems = items.map((item: any) => {
        if (item.productId && (Number(item.unitPrice) === 0 || !item.unitPrice)) {
          const variantKey = `${item.productId}|${item.filling || ''}|${item.weight || ''}`;
          const newPrice = priceMap.get(variantKey) ?? priceMap.get(item.productId);
          if (newPrice && newPrice > 0) {
            const qty = item.quantity || 1;
            updated++;
            return { ...item, unitPrice: newPrice.toFixed(2), lineTotal: (Math.round(qty * newPrice * 100) / 100).toFixed(2) };
          }
        }
        return item;
      });

      const subtotal = updatedItems.reduce((sum: number, item: any) => sum + (Number(item.lineTotal) || 0), 0);
      const tax = Math.round(subtotal * 0.1 * 100) / 100;
      const total = Math.round((subtotal + tax) * 100) / 100;

      await pool.query(
        `UPDATE orders SET order_items = $1, subtotal = $2, tax = $3, total = $4, updated_at = NOW() WHERE id = $5`,
        [JSON.stringify(updatedItems), subtotal.toFixed(2), tax.toFixed(2), total.toFixed(2), req.params.id]
      );

      res.json({ message: `Prices recalculated — ${updated} item(s) updated`, updated });
    } catch (error) {
      console.error("Recalculate prices error:", error);
      res.status(500).json({ message: "Failed to recalculate prices" });
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
      const plResult = await pool.query(
        `SELECT name FROM price_lists WHERE id = $1 LIMIT 1`,
        [company.priceListId]
      );
      res.json({ ...safeCompany, priceListName: plResult.rows[0]?.name || null });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch company" });
    }
  });

  // Helper: parse recurring_items JSONB into multi-template format (migrates old flat-array format)
  function parseTemplates(raw: any, legacyWeeks?: number, legacyLastPlaced?: string | null): any[] {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [];
    if (arr.length === 0) return [];
    if (arr[0] && 'productId' in arr[0]) {
      return [{ id: 'default', name: 'Regular Order', intervalWeeks: legacyWeeks ?? 2, lastPlaced: legacyLastPlaced || null, items: arr }];
    }
    return arr;
  }

  app.get("/api/portal/recurring-items", requirePortalAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT recurring_items, recurring_interval_weeks, recurring_last_placed FROM portal_users WHERE id = $1`,
        [req.session.portalUserId]
      );
      const row = result.rows[0] || {};
      const templates = parseTemplates(row.recurring_items, row.recurring_interval_weeks, row.recurring_last_placed);
      res.json({ templates });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recurring items" });
    }
  });

  // Upsert a recurring template (create or update by id)
  app.put("/api/portal/recurring-items", requirePortalAuth, async (req, res) => {
    try {
      const { template } = req.body;
      if (!template || !Array.isArray(template.items)) return res.status(400).json({ message: "template with items required" });
      const result = await pool.query(
        `SELECT recurring_items, recurring_interval_weeks, recurring_last_placed FROM portal_users WHERE id = $1`,
        [req.session.portalUserId]
      );
      const row = result.rows[0] || {};
      let templates = parseTemplates(row.recurring_items, row.recurring_interval_weeks, row.recurring_last_placed);
      const id = template.id || crypto.randomUUID();
      const idx = templates.findIndex((t: any) => t.id === id);
      // Allow manually setting lastPlaced; fall back to existing value
      const existingLastPlaced = templates[idx]?.lastPlaced || null;
      const incomingLastPlaced = template.lastPlaced !== undefined ? template.lastPlaced : existingLastPlaced;
      const upserted = {
        id,
        name: template.name || 'Regular Order',
        intervalWeeks: template.intervalWeeks ?? 2,
        lastPlaced: incomingLastPlaced,
        items: template.items,
      };
      if (idx >= 0) templates[idx] = upserted;
      else templates.push(upserted);
      await pool.query(`UPDATE portal_users SET recurring_items = $1 WHERE id = $2`, [JSON.stringify(templates), req.session.portalUserId]);
      res.json({ success: true, template: upserted });
    } catch (error) {
      res.status(500).json({ message: "Failed to save recurring template" });
    }
  });

  // Delete a recurring template
  app.delete("/api/portal/recurring-items/:templateId", requirePortalAuth, async (req, res) => {
    try {
      const { templateId } = req.params;
      const result = await pool.query(
        `SELECT recurring_items, recurring_interval_weeks, recurring_last_placed FROM portal_users WHERE id = $1`,
        [req.session.portalUserId]
      );
      const row = result.rows[0] || {};
      let templates = parseTemplates(row.recurring_items, row.recurring_interval_weeks, row.recurring_last_placed);
      templates = templates.filter((t: any) => t.id !== templateId);
      await pool.query(`UPDATE portal_users SET recurring_items = $1 WHERE id = $2`, [JSON.stringify(templates), req.session.portalUserId]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete recurring template" });
    }
  });

  // Update interval for a specific template
  app.patch("/api/portal/recurring-interval", requirePortalAuth, async (req, res) => {
    try {
      const { templateId, intervalWeeks } = req.body;
      const weeks = parseInt(intervalWeeks);
      if (isNaN(weeks) || weeks < 1 || weeks > 52) return res.status(400).json({ message: "Invalid interval" });
      const result = await pool.query(
        `SELECT recurring_items, recurring_interval_weeks, recurring_last_placed FROM portal_users WHERE id = $1`,
        [req.session.portalUserId]
      );
      const row = result.rows[0] || {};
      let templates = parseTemplates(row.recurring_items, row.recurring_interval_weeks, row.recurring_last_placed);
      const idx = templates.findIndex((t: any) => t.id === templateId);
      if (idx >= 0) {
        templates[idx] = { ...templates[idx], intervalWeeks: weeks };
        await pool.query(`UPDATE portal_users SET recurring_items = $1 WHERE id = $2`, [JSON.stringify(templates), req.session.portalUserId]);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to save interval" });
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
        paymentStatus: r.payment_status,
        orderDate: r.order_date,
        subtotal: r.subtotal,
        tax: r.tax,
        total: r.total,
        customerNotes: r.customer_notes,
        customerName: r.customer_name,
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
        paymentStatus: r.payment_status,
        orderDate: r.order_date,
        requestedShipDate: r.requested_ship_date,
        subtotal: r.subtotal,
        tax: r.tax,
        total: r.total,
        customerNotes: r.customer_notes,
        customerName: r.customer_name,
        customerEmail: r.customer_email,
        customerPhone: r.customer_phone,
        customerAddress: r.customer_address || r.shipping_address,
        deliveryMethod: r.delivery_method,
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
      const companyId = req.session.portalCompanyId;
      if (!companyId) {
        return res.json([]);
      }

      const companyResult = await pool.query(`SELECT price_list_id FROM companies WHERE id = $1`, [companyId]);
      let priceListId = companyResult.rows[0]?.price_list_id;
      if (!priceListId) {
        const standardList = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) = 'standard' LIMIT 1`);
        if (standardList.rows.length > 0) {
          priceListId = standardList.rows[0].id;
        }
      }
      if (!priceListId) {
        return res.json([]);
      }

      const allHiddenCategories = [
        'CASES', '4 SEASONS CASE', 'CASSETTES CASES', 'CHANNELLED CASES',
        'GOLD PILLOW CASE', 'GOLD QUILT CASE', 'MATTRESS TOPPER CASE',
        'MEN JACKET', 'WOMAN JACKET', 'JACKETS',
        'WINTER', 'WINTER 80% DOWN',
        'CUSTOM INSERTS',
      ];
      const portalCatsResult = await pool.query(`SELECT portal_categories FROM companies WHERE id = $1`, [companyId]);
      const portalCategories = (portalCatsResult.rows[0]?.portal_categories || []) as string[];
      const hiddenCategories = allHiddenCategories.filter(
        cat => !portalCategories.map(pc => pc.toUpperCase()).includes(cat.toUpperCase())
      );
      const plPrices = await pool.query(
        `SELECT plp.product_id, plp.filling, plp.weight, plp.unit_price,
                p.id, p.sku, p.name, p.description, p.category
         FROM price_list_prices plp
         JOIN products p ON p.id = plp.product_id
         WHERE plp.price_list_id = $1 AND p.active = true
         AND (p.category IS NULL OR p.category NOT IN (${hiddenCategories.map((_, i) => `$${i + 2}`).join(', ')}))
         AND p.name != 'Freight'
         ORDER BY p.category, p.name, plp.filling, plp.weight`,
        [priceListId, ...hiddenCategories]
      );

      const productMap = new Map<string, any>();
      const variantMap = new Map<string, Array<{ filling: string; weight: string | null; unitPrice: string }>>();

      const categoryRenames: Record<string, string> = {
        'CUST INSERTS': 'CUSTOM INSERTS',
        'CUST INSERT': 'CUSTOM INSERTS',
      };
      if (portalCategories.map(c => c.toUpperCase()).includes('CASES')) {
        categoryRenames['CASES'] = 'RAW MATERIAL';
      }

      for (const row of plPrices.rows) {
        const displayCategory = categoryRenames[row.category] || row.category;
        if (!productMap.has(row.product_id)) {
          productMap.set(row.product_id, {
            id: row.product_id,
            sku: row.sku,
            name: row.name,
            description: row.description,
            category: displayCategory,
            unitPrice: "0",
          });
        }
        if (row.filling || row.weight) {
          if (!variantMap.has(row.product_id)) variantMap.set(row.product_id, []);
          variantMap.get(row.product_id)!.push({
            filling: row.filling || "",
            weight: row.weight,
            unitPrice: row.unit_price,
          });
        } else {
          productMap.get(row.product_id)!.unitPrice = row.unit_price;
        }
      }

      const companyPricesList = await storage.getCompanyPrices(companyId);
      const companyPriceMap = new Map<string, string>();
      for (const cp of companyPricesList) {
        companyPriceMap.set(cp.productId, cp.unitPrice);
      }
      const companyVariantResult = await pool.query(
        `SELECT product_id, filling, weight, unit_price FROM company_variant_prices WHERE company_id = $1 ORDER BY filling, weight`,
        [companyId]
      );
      const companyVariantMap = new Map<string, Array<{ filling: string; weight: string | null; unitPrice: string }>>();
      for (const vp of companyVariantResult.rows) {
        if (!companyVariantMap.has(vp.product_id)) companyVariantMap.set(vp.product_id, []);
        companyVariantMap.get(vp.product_id)!.push({ filling: vp.filling, weight: vp.weight, unitPrice: vp.unit_price });
      }

      // Load additional price lists for this company and merge their products in
      const additionalPlResult = await pool.query(
        `SELECT capl.price_list_id, pl.name as price_list_name
         FROM company_additional_price_lists capl
         JOIN price_lists pl ON pl.id = capl.price_list_id
         WHERE capl.company_id = $1`,
        [companyId]
      );
      for (const aplRow of additionalPlResult.rows) {
        const isHundredPlus = (aplRow.price_list_name || '').toLowerCase().includes('100 plus');
        const addlPrices = await pool.query(
          `SELECT plp.product_id, plp.filling, plp.weight, plp.unit_price,
                  p.id, p.sku, p.name, p.description, p.category
           FROM price_list_prices plp
           JOIN products p ON p.id = plp.product_id
           WHERE plp.price_list_id = $1 AND p.active = true
           AND p.name != 'Freight'
           ORDER BY p.category, p.name, plp.filling, plp.weight`,
          [aplRow.price_list_id]
        );
        for (const row of addlPrices.rows) {
          let displayCategory = categoryRenames[row.category] || row.category;
          // Products from a "100 Plus" additional list get their own category so they
          // appear in a separate "100 PLUS INSERTS" section with min-qty enforcement
          if (isHundredPlus) displayCategory = '100 PLUS INSERTS';
          if (!productMap.has(row.product_id)) {
            productMap.set(row.product_id, {
              id: row.product_id,
              sku: row.sku,
              name: row.name,
              description: row.description,
              category: displayCategory,
              unitPrice: "0",
            });
          } else {
            // Always update category for 100 Plus products so they move to their own section
            if (isHundredPlus) productMap.get(row.product_id)!.category = displayCategory;
          }
          if (row.filling || row.weight) {
            if (!variantMap.has(row.product_id)) variantMap.set(row.product_id, []);
            const existing = variantMap.get(row.product_id)!;
            const existingIdx = existing.findIndex(v => v.filling === (row.filling || "") && v.weight === row.weight);
            if (existingIdx >= 0) {
              // Additional price list overrides the main list price for matching variants
              existing[existingIdx].unitPrice = row.unit_price;
            } else {
              existing.push({ filling: row.filling || "", weight: row.weight, unitPrice: row.unit_price });
            }
          } else {
            // Additional price list overrides the main list flat price
            productMap.get(row.product_id)!.unitPrice = row.unit_price;
          }
        }
      }

      const isNonZeroPrice = (p: string | null | undefined) => !!p && p !== "0.00" && p !== "0";

      const products = Array.from(productMap.values()).map((product) => {
        let variants = companyVariantMap.get(product.id) || variantMap.get(product.id) || [];
        let effectiveUnitPrice = companyPriceMap.get(product.id) || product.unitPrice;
        if (!isNonZeroPrice(effectiveUnitPrice) && variants.length > 0) {
          const nonZero = variants.find((v: any) => isNonZeroPrice(v.unitPrice));
          if (nonZero) effectiveUnitPrice = nonZero.unitPrice;
        }
        return {
          id: product.id,
          sku: product.sku,
          name: product.name,
          description: product.description,
          category: product.category,
          unitPrice: effectiveUnitPrice,
          hasCustomPrice: companyPriceMap.has(product.id),
          variantPrices: variants,
        };
      });

      res.json(products);
    } catch (error) {
      console.error("Portal products error:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.post("/api/portal/orders", requirePortalAuth, async (req, res) => {
    try {
      const { items, customItems, customQuiltItems, customerNotes, customerName: submittedCustomerName, shippingAddress: deliveryAddress, customerOrderNumber, templateId } = req.body;
      const hasItems = items && Array.isArray(items) && items.length > 0;
      const hasCustomItems = customItems && Array.isArray(customItems) && customItems.length > 0;
      const hasCustomQuiltItems = customQuiltItems && Array.isArray(customQuiltItems) && customQuiltItems.length > 0;
      if (!hasItems && !hasCustomItems && !hasCustomQuiltItems) {
        return res.status(400).json({ message: "At least one item is required" });
      }
      const companyId = req.session.portalCompanyId!;
      const [portalUser] = await db.select().from(portalUsers).where(eq(portalUsers.id, req.session.portalUserId!));

      const companyResult = await pool.query(`SELECT legal_name, trading_name, price_list_id, shipping_address, billing_address, phone FROM companies WHERE id = $1`, [companyId]);
      const companyRow = companyResult.rows[0];
      const companyName = companyRow?.trading_name || companyRow?.legal_name || "Unknown";
      const companyPriceListId = companyRow?.price_list_id;
      const contactName = submittedCustomerName || portalUser?.name || "Portal Customer";
      const contactEmail = portalUser?.email || "";
      const resolvedShippingAddress = deliveryAddress || companyRow?.shipping_address || companyRow?.billing_address || null;
      const resolvedPhone = companyRow?.phone || null;

      // Build priceMap: company's main price list (or Standard fallback) + additional price lists
      const priceMap = new Map<string, number>();

      // Determine effective main price list (company's assigned, else Standard)
      let effectivePriceListId = companyPriceListId;
      if (!effectivePriceListId) {
        const stdList = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) = 'standard' LIMIT 1`);
        if (stdList.rows.length > 0) effectivePriceListId = stdList.rows[0].id;
      }

      // Load price list IDs to use: main + additional
      const priceListIds: string[] = [];
      if (effectivePriceListId) priceListIds.push(effectivePriceListId);
      const additionalPls = await pool.query(
        `SELECT price_list_id FROM company_additional_price_lists WHERE company_id = $1`,
        [companyId]
      );
      for (const r of additionalPls.rows) {
        if (!priceListIds.includes(r.price_list_id)) priceListIds.push(r.price_list_id);
      }

      // Load prices: additional lists first (lower priority), then main list (overrides)
      const orderedIds = [...priceListIds.slice(1), ...(priceListIds[0] ? [priceListIds[0]] : [])];
      for (const plId of orderedIds) {
        const priceRows = await pool.query(
          `SELECT product_id, filling, weight, unit_price FROM price_list_prices WHERE price_list_id = $1`,
          [plId]
        );
        for (const row of priceRows.rows) {
          const key = `${row.product_id}|${row.filling || ''}|${row.weight || ''}`;
          priceMap.set(key, parseFloat(row.unit_price));
          priceMap.set(row.product_id, parseFloat(row.unit_price));
        }
      }

      const orderItems: any[] = [];
      if (hasItems) {
        for (const item of items) {
          const prodResult = await pool.query("SELECT id, name, sku, unit_price FROM products WHERE id = $1 AND active = true", [item.productId]);
          if (prodResult.rows.length === 0) continue;
          const prod = prodResult.rows[0];
          const qty = Math.max(1, parseInt(item.quantity) || 1);
          const desc = item.filling ? `${prod.name} (${item.filling}${item.weight ? `, ${item.weight}` : ''})` : prod.name;
          const variantKey = `${prod.id}|${item.filling || ''}|${item.weight || ''}`;
          const unitPrice = priceMap.get(variantKey) ?? priceMap.get(prod.id) ?? parseFloat(prod.unit_price || "0");
          const lineTotal = Math.round(qty * unitPrice * 100) / 100;
          orderItems.push({
            productId: prod.id,
            productName: desc,
            sku: prod.sku,
            quantity: qty,
            unitPrice: unitPrice.toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            filling: item.filling || undefined,
            weight: item.weight || undefined,
          });
        }
      }
      if (hasCustomItems) {
        for (const ci of customItems) {
          const qty = Math.max(1, parseInt(ci.quantity) || 1);
          orderItems.push({
            productId: null,
            productName: `CUSTOM INSERT: ${ci.size}${ci.filling ? ` (${ci.filling})` : ''}${ci.weight ? ` [${ci.weight}]` : ''}`,
            sku: "",
            quantity: qty,
          });
        }
      }
      if (hasCustomQuiltItems) {
        for (const cq of customQuiltItems) {
          const qty = Math.max(1, parseInt(cq.quantity) || 1);
          orderItems.push({
            productId: null,
            productName: `CUSTOM QUILT: ${cq.description}`,
            sku: "",
            quantity: qty,
          });
        }
      }

      const notesWithPO = [
        customerOrderNumber ? `PO/Order #: ${customerOrderNumber}` : "",
        customerNotes || "",
      ].filter(Boolean).join("\n\n") || null;

      const orderRequest = await storage.createCustomerOrderRequest({
        companyName: companyName,
        contactName: contactName,
        contactEmail: contactEmail,
        contactPhone: resolvedPhone,
        shippingAddress: resolvedShippingAddress,
        customerNotes: notesWithPO,
        items: orderItems,
        status: "pending",
        convertedOrderId: null,
        reviewedBy: null,
      });

      // If this is a recurring order, stamp last-placed per-template
      if ((customerNotes || "").toLowerCase().includes("recurring order") && templateId) {
        const puResult = await pool.query(
          `SELECT recurring_items, recurring_interval_weeks, recurring_last_placed FROM portal_users WHERE id = $1`,
          [req.session.portalUserId]
        );
        const puRow = puResult.rows[0] || {};
        let tpls = parseTemplates(puRow.recurring_items, puRow.recurring_interval_weeks, puRow.recurring_last_placed);
        const tIdx = tpls.findIndex((t: any) => t.id === templateId);
        if (tIdx >= 0) {
          tpls[tIdx] = { ...tpls[tIdx], lastPlaced: new Date().toISOString() };
          await pool.query(`UPDATE portal_users SET recurring_items = $1 WHERE id = $2`, [JSON.stringify(tpls), req.session.portalUserId]);
        }
      }

      // Send email notification to staff
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
            const redirectUri = `${protocol}://${host}/api/outlook/callback`;

            const isRecurring = (notesWithPO || "").toLowerCase().includes("recurring order");
            const allUsers = await storage.getAllUsers();
            let emailSent = false;
            for (const user of allUsers) {
              if (emailSent) break;
              try {
                const accessToken = await refreshOutlookTokenIfNeeded(user.id, redirectUri);
                if (accessToken) {
                  const itemsList = orderItems.map((item: any) =>
                    `<tr>
                      <td style="padding:8px;border:1px solid #ddd;">${item.quantity}</td>
                      <td style="padding:8px;border:1px solid #ddd;">${item.productName}</td>
                      <td style="padding:8px;border:1px solid #ddd;">$${parseFloat(item.unitPrice || "0").toFixed(2)}</td>
                      <td style="padding:8px;border:1px solid #ddd;text-align:right;">$${parseFloat(item.lineTotal || "0").toFixed(2)}</td>
                    </tr>`
                  ).join("");

                  const subtotal = orderItems.reduce((s: number, i: any) => s + parseFloat(i.lineTotal || "0"), 0);
                  const recurringBanner = isRecurring
                    ? `<div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
                        <strong style="color:#92400e;">🔁 Recurring Order</strong>
                        <p style="margin:4px 0 0;color:#78350f;font-size:0.9em;">This order was placed from a recurring template. Please review and send to Purax (Milo) promptly.</p>
                       </div>`
                    : "";

                  const emailBody = `
                    ${recurringBanner}
                    <h2 style="color:#1e293b;">New Portal Order from ${companyName}</h2>
                    <p><strong>Contact:</strong> ${contactName}${contactEmail ? ` &lt;${contactEmail}&gt;` : ""}</p>
                    ${resolvedShippingAddress ? `<p><strong>Delivery Address:</strong> ${resolvedShippingAddress}</p>` : ""}
                    ${notesWithPO ? `<p><strong>Notes:</strong> ${notesWithPO.replace(/\n/g, "<br>")}</p>` : ""}
                    <h3>Items:</h3>
                    <table style="border-collapse:collapse;width:100%;">
                      <tr>
                        <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Qty</th>
                        <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Product</th>
                        <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Unit Price</th>
                        <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;text-align:right;">Total</th>
                      </tr>
                      ${itemsList}
                    </table>
                    <p style="margin-top:12px;text-align:right;font-size:1.1em;"><strong>Order Total: $${subtotal.toFixed(2)}</strong></p>
                    <p style="margin-top:16px;color:#64748b;font-size:0.9em;">Log in to the CRM to review and send this order to Purax (Milo).</p>
                  `;

                  const subject = isRecurring
                    ? `🔁 Recurring Order from ${companyName} — Action Required`
                    : `New Portal Order from ${companyName}`;

                  await sendEmail(accessToken, recipientEmails, subject, emailBody);
                  emailSent = true;
                  console.log(`[PORTAL-ORDER] Notification sent to ${recipientEmails.join(", ")} for ${isRecurring ? "recurring " : ""}order from ${companyName}`);
                }
              } catch (tokenErr) {
                console.error("[PORTAL-ORDER] Notification email token error:", tokenErr);
              }
            }
            if (!emailSent) {
              console.log(`[PORTAL-ORDER] No Outlook token available — notification not sent for order from ${companyName}`);
            }
          }
        }
      } catch (emailErr) {
        console.error("[PORTAL-ORDER] Failed to send notification email:", emailErr);
      }

      res.json({ success: true, id: orderRequest.id, message: "Your order has been submitted for review. We will process it shortly." });
    } catch (error) {
      console.error("Portal create order error:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  app.get("/api/portal/order-requests", requirePortalAuth, async (req, res) => {
    try {
      const companyId = req.session.portalCompanyId!;
      const companyResult = await pool.query(`SELECT legal_name, trading_name FROM companies WHERE id = $1`, [companyId]);
      const legalName = companyResult.rows[0]?.legal_name || "";
      const tradingName = companyResult.rows[0]?.trading_name || "";
      const result = await pool.query(`
        SELECT cor.id, cor.company_name, cor.contact_name, cor.items, cor.status, cor.customer_notes, cor.shipping_address, cor.created_at, cor.converted_order_id,
          COALESCE(att.attachment_count, 0) AS attachment_count
        FROM customer_order_requests cor
        LEFT JOIN (SELECT entity_id, COUNT(*)::int AS attachment_count FROM attachments WHERE entity_type = 'order_request' GROUP BY entity_id) att ON att.entity_id = cor.id::text
        WHERE cor.company_name = $1 OR ($2 != '' AND cor.company_name = $2)
        ORDER BY cor.created_at DESC
      `, [legalName, tradingName]);
      res.json(result.rows.map((r: any) => ({
        id: r.id,
        companyName: r.company_name,
        contactName: r.contact_name,
        items: r.items,
        status: r.status,
        customerNotes: r.customer_notes,
        shippingAddress: r.shipping_address,
        createdAt: r.created_at,
        convertedOrderId: r.converted_order_id,
        attachmentCount: parseInt(r.attachment_count) || 0,
      })));
    } catch (error) {
      console.error("Portal order requests error:", error);
      res.status(500).json({ message: "Failed to fetch order requests" });
    }
  });

  app.get("/api/portal/order-requests/:id", requirePortalAuth, async (req, res) => {
    try {
      const requestId = req.params.id;
      const companyId = req.session.portalCompanyId!;
      const companyResult = await pool.query(`SELECT legal_name, trading_name FROM companies WHERE id = $1`, [companyId]);
      const legalName = companyResult.rows[0]?.legal_name || "";
      const tradingName = companyResult.rows[0]?.trading_name || "";
      const result = await pool.query(
        `SELECT * FROM customer_order_requests WHERE id = $1 AND (company_name = $2 OR ($3 != '' AND company_name = $3))`,
        [requestId, legalName, tradingName]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Order request not found" });
      }
      const r = result.rows[0];
      res.json({
        id: r.id,
        companyName: r.company_name,
        contactName: r.contact_name,
        contactEmail: r.contact_email,
        contactPhone: r.contact_phone,
        items: r.items,
        status: r.status,
        customerNotes: r.customer_notes,
        shippingAddress: r.shipping_address,
        createdAt: r.created_at,
        convertedOrderId: r.converted_order_id,
      });
    } catch (error) {
      console.error("Portal get order request error:", error);
      res.status(500).json({ message: "Failed to fetch order request" });
    }
  });

  app.patch("/api/portal/order-requests/:id", requirePortalAuth, async (req, res) => {
    try {
      const requestId = req.params.id;
      const companyId = req.session.portalCompanyId!;
      const companyResult = await pool.query(`SELECT legal_name, trading_name, price_list_id FROM companies WHERE id = $1`, [companyId]);
      const legalName = companyResult.rows[0]?.legal_name || "";
      const tradingName = companyResult.rows[0]?.trading_name || "";
      const companyPriceListId = companyResult.rows[0]?.price_list_id;

      const existing = await pool.query(
        `SELECT * FROM customer_order_requests WHERE id = $1 AND (company_name = $2 OR ($3 != '' AND company_name = $3))`,
        [requestId, legalName, tradingName]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ message: "Order request not found" });
      }
      if (existing.rows[0].status !== "pending") {
        return res.status(400).json({ message: "This order has already been accepted and can no longer be edited" });
      }

      const { items, customItems, customQuiltItems, customerNotes, customerName: submittedCustomerName, shippingAddress: deliveryAddress, customerOrderNumber } = req.body;
      const hasItems = items && Array.isArray(items) && items.length > 0;
      const hasCustomItems = customItems && Array.isArray(customItems) && customItems.length > 0;
      const hasCustomQuiltItems = customQuiltItems && Array.isArray(customQuiltItems) && customQuiltItems.length > 0;
      if (!hasItems && !hasCustomItems && !hasCustomQuiltItems) {
        return res.status(400).json({ message: "At least one item is required" });
      }

      const [portalUser] = await db.select().from(portalUsers).where(eq(portalUsers.id, req.session.portalUserId!));
      const contactName = submittedCustomerName || portalUser?.name || existing.rows[0].contact_name;

      // Build priceMap: company's main price list (or Standard fallback) + additional price lists
      const priceMap = new Map<string, number>();
      let effectivePlId = companyPriceListId;
      if (!effectivePlId) {
        const stdList = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) = 'standard' LIMIT 1`);
        if (stdList.rows.length > 0) effectivePlId = stdList.rows[0].id;
      }
      const editPriceListIds: string[] = [];
      if (effectivePlId) editPriceListIds.push(effectivePlId);
      const editAdditionalPls = await pool.query(
        `SELECT price_list_id FROM company_additional_price_lists WHERE company_id = $1`,
        [companyId]
      );
      for (const r of editAdditionalPls.rows) {
        if (!editPriceListIds.includes(r.price_list_id)) editPriceListIds.push(r.price_list_id);
      }
      const editOrderedIds = [...editPriceListIds.slice(1), ...(editPriceListIds[0] ? [editPriceListIds[0]] : [])];
      for (const plId of editOrderedIds) {
        const priceRows = await pool.query(
          `SELECT product_id, filling, weight, unit_price FROM price_list_prices WHERE price_list_id = $1`,
          [plId]
        );
        for (const row of priceRows.rows) {
          const key = `${row.product_id}|${row.filling || ''}|${row.weight || ''}`;
          priceMap.set(key, parseFloat(row.unit_price));
          priceMap.set(row.product_id, parseFloat(row.unit_price));
        }
      }

      const orderItems: any[] = [];
      if (hasItems) {
        for (const item of items) {
          const prodResult = await pool.query("SELECT id, name, sku, unit_price FROM products WHERE id = $1 AND active = true", [item.productId]);
          if (prodResult.rows.length === 0) continue;
          const prod = prodResult.rows[0];
          const qty = Math.max(1, parseInt(item.quantity) || 1);
          const desc = item.filling ? `${prod.name} (${item.filling}${item.weight ? `, ${item.weight}` : ''})` : prod.name;
          const variantKey = `${prod.id}|${item.filling || ''}|${item.weight || ''}`;
          const unitPrice = priceMap.get(variantKey) ?? priceMap.get(prod.id) ?? parseFloat(prod.unit_price || "0");
          const lineTotal = Math.round(qty * unitPrice * 100) / 100;
          orderItems.push({
            productId: prod.id,
            productName: desc,
            sku: prod.sku,
            quantity: qty,
            unitPrice: unitPrice.toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            filling: item.filling || undefined,
            weight: item.weight || undefined,
          });
        }
      }
      if (hasCustomItems) {
        for (const ci of customItems) {
          const qty = Math.max(1, parseInt(ci.quantity) || 1);
          orderItems.push({
            productId: null,
            productName: `CUSTOM INSERT: ${ci.size}${ci.filling ? ` (${ci.filling})` : ''}${ci.weight ? ` [${ci.weight}]` : ''}`,
            sku: "",
            quantity: qty,
          });
        }
      }
      if (hasCustomQuiltItems) {
        for (const cq of customQuiltItems) {
          const qty = Math.max(1, parseInt(cq.quantity) || 1);
          orderItems.push({
            productId: null,
            productName: `CUSTOM QUILT: ${cq.description}`,
            sku: "",
            quantity: qty,
          });
        }
      }

      const notesWithPO = [
        customerOrderNumber ? `PO/Order #: ${customerOrderNumber}` : "",
        customerNotes || "",
      ].filter(Boolean).join("\n\n") || null;

      await pool.query(
        `UPDATE customer_order_requests SET items = $1, customer_notes = $2, contact_name = $3, shipping_address = $4 WHERE id = $5`,
        [JSON.stringify(orderItems), notesWithPO, contactName, deliveryAddress || existing.rows[0].shipping_address, requestId]
      );

      res.json({ success: true, message: "Order updated successfully" });
    } catch (error) {
      console.error("Portal update order request error:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  app.post("/api/portal/order-requests/:id/attachments", requirePortalAuth, async (req, res) => {
    try {
      const requestId = req.params.id;
      // Just verify the request exists — portal auth already confirms the user is legitimate
      const reqResult = await pool.query(
        `SELECT id FROM customer_order_requests WHERE id = $1`,
        [requestId]
      );
      if (reqResult.rows.length === 0) return res.status(404).json({ message: "Order request not found" });

      const contentType = req.headers["content-type"] || "";
      if (!contentType.includes("multipart/form-data")) {
        return res.status(400).json({ message: "Expected multipart/form-data" });
      }

      const busboy = await import("busboy");
      const path = await import("path");
      const fs = await import("fs");
      const bb = busboy.default({ headers: req.headers });
      const uploadsDir = path.default.join(process.cwd(), "uploads", "order-requests", requestId);
      await fs.promises.mkdir(uploadsDir, { recursive: true });

      const filePromises: Promise<any>[] = [];

      bb.on("file", (_fieldname: string, file: any, info: any) => {
        const { filename, mimeType } = info;
        const chunks: Buffer[] = [];
        let fileSize = 0;
        file.on("data", (data: Buffer) => { chunks.push(data); fileSize += data.length; });
        const filePromise = new Promise<any>((resolve, reject) => {
          file.on("end", () => {
            const fileData = Buffer.concat(chunks);
            resolve({ entityType: "order_request", entityId: requestId, fileName: filename, fileType: mimeType, fileSize, storagePath: `db://${requestId}/${filename}`, uploadedBy: null, fileData });
          });
          file.on("error", reject);
        });
        filePromises.push(filePromise);
      });

      bb.on("finish", async () => {
        try {
          const uploadedFiles = await Promise.all(filePromises);
          for (const f of uploadedFiles) {
            await pool.query(
              `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_type, file_size, storage_path, uploaded_by, uploaded_at, file_data)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
              [f.entityType, f.entityId, f.fileName, f.fileType, f.fileSize, f.storagePath, f.uploadedBy, f.fileData]
            );
          }
          const result = await storage.getAttachmentsByEntity("order_request", requestId);
          res.json(result);
        } catch (err) {
          console.error("Portal file write error:", err);
          res.status(500).json({ message: "Failed to save files" });
        }
      });

      bb.on("error", (err: any) => {
        console.error("Portal busboy error:", err);
        res.status(500).json({ message: "Upload processing error" });
      });

      req.pipe(bb);
    } catch (error) {
      console.error("Portal upload attachment error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/portal/order-requests/:id/attachments", requirePortalAuth, async (req, res) => {
    try {
      const result = await storage.getAttachmentsByEntity("order_request", req.params.id);
      res.json(result);
    } catch (error) {
      console.error("Portal get attachments error:", error);
      res.status(500).json({ message: "Failed to get attachments" });
    }
  });

  app.get("/api/portal/attachments/:id/download", requirePortalAuth, async (req, res) => {
    try {
      const [attachment] = await db.select().from(attachments).where(eq(attachments.id, req.params.id));
      if (!attachment) return res.status(404).json({ message: "Attachment not found" });
      const fs = await import("fs");
      if (!fs.existsSync(attachment.storagePath)) return res.status(404).json({ message: "File not found" });
      res.setHeader("Content-Type", attachment.fileType);
      res.setHeader("Content-Disposition", `attachment; filename="${attachment.fileName}"`);
      fs.createReadStream(attachment.storagePath).pipe(res);
    } catch (error) {
      console.error("Portal download attachment error:", error);
      res.status(500).json({ message: "Failed to download" });
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
      return res.json({ message: "Password updated" });
    } catch (error) {
      console.error("[PORTAL] Change password error:", error);
      if (!res.headersSent) {
        return res.status(500).json({ message: "Failed to update password. Please try again." });
      }
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
        SELECT id, order_number, status, order_date, total, customer_name, payment_status
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
          customerName: r.customer_name,
          paymentStatus: r.payment_status,
        })),
      });
    } catch (error) {
      console.error("Portal dashboard error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });

  // Portal notes - get
  app.get("/api/portal/notes", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.session.portalUserId!;
      const result = await pool.query(`SELECT notes FROM portal_users WHERE id = $1`, [userId]);
      const raw = result.rows[0]?.notes || null;
      let notes: any[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          notes = Array.isArray(parsed) ? parsed : [];
        } catch {
          // Legacy plain-text note — migrate it into the new format
          if (raw.trim()) {
            notes = [{ id: "legacy", content: raw.trim(), createdAt: new Date().toISOString() }];
          }
        }
      }
      res.json({ notes });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  // Portal notes - add a new note
  app.post("/api/portal/notes", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.session.portalUserId!;
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ message: "Note content required" });
      const result = await pool.query(`SELECT notes FROM portal_users WHERE id = $1`, [userId]);
      const raw = result.rows[0]?.notes || null;
      let notes: any[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          notes = Array.isArray(parsed) ? parsed : [];
        } catch { notes = []; }
      }
      const newNote = { id: crypto.randomUUID(), content: content.trim(), createdAt: new Date().toISOString() };
      notes.unshift(newNote);
      await pool.query(`UPDATE portal_users SET notes = $1 WHERE id = $2`, [JSON.stringify(notes), userId]);
      res.json({ note: newNote, notes });
    } catch (error) {
      res.status(500).json({ message: "Failed to save note" });
    }
  });

  // Portal notes - delete a note
  app.delete("/api/portal/notes/:noteId", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.session.portalUserId!;
      const { noteId } = req.params;
      const result = await pool.query(`SELECT notes FROM portal_users WHERE id = $1`, [userId]);
      const raw = result.rows[0]?.notes || null;
      let notes: any[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          notes = Array.isArray(parsed) ? parsed : [];
        } catch { notes = []; }
      }
      notes = notes.filter((n: any) => n.id !== noteId);
      await pool.query(`UPDATE portal_users SET notes = $1 WHERE id = $2`, [JSON.stringify(notes), userId]);
      res.json({ success: true, notes });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  // ============ PORTAL CATEGORY ORDER ============

  const DEFAULT_CATEGORY_ORDER = [
    'CUSTOM INSERTS', '15 % INSERTS', 'WALTER G INSERT', 'INSERTS', 'HIGHGATE INSERTS', '100 PLUS INSERTS',
    'WINTER 80% DOWN', '80% WINTER FILLED', '80% DUCK WINTER FILLED', '80% MID WARM FILLED',
    '50% DUCK WINTER FILLED', '50% MID WARM FILLED', '50% GOOSE DOWN', 'HUNGARIAN WINTER STRIP',
    'HUNGARIAN ALL SEASONS', 'HUNGARIAN LIGHT FILL', '4 SEASONS FILLED', '80% DUCK SUMMER FILLED',
    '80% GOOSE SUMMER FILLED', '80% GOOSE SUMMER', '80% DUCK COT FILLED', '80% GOOSE DOWN',
    '80% HUNGARIAN GOOSE', 'MATTRESS TOPPER FILLED', 'MATTRESS TOPPER', 'PIPED PILLOWS', 'PILLOW',
    'CHAMBER PILLOW', 'HUNGARIAN PILLOW', 'HUNGARIAN PILLOWS', 'HUNGARIAN', 'MICROSOFT', 'MICROSFT',
    'BLANKETS', 'JACKETS', 'CASES', 'BULK LOOSE FILLING', 'BULK', 'RAW MATERIAL',
  ];

  // Get portal category order for current portal user (user-specific, falls back to global default)
  app.get("/api/portal/category-order", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.session.portalUserId!;
      const userRow = await pool.query(`SELECT category_order FROM portal_users WHERE id = $1`, [userId]);
      const userOrder: string[] | null = userRow.rows[0]?.category_order;
      if (userOrder && Array.isArray(userOrder) && userOrder.length > 0) {
        return res.json({ order: userOrder, source: "user" });
      }
      const globalRow = await pool.query(`SELECT value FROM crm_settings WHERE key = 'portal_category_order' LIMIT 1`);
      if (globalRow.rows[0]?.value) {
        try {
          const parsed = JSON.parse(globalRow.rows[0].value);
          if (Array.isArray(parsed)) return res.json({ order: parsed, source: "global" });
        } catch {}
      }
      res.json({ order: DEFAULT_CATEGORY_ORDER, source: "default" });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch category order" });
    }
  });

  // Save portal category order for current portal user
  app.post("/api/portal/category-order", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.session.portalUserId!;
      const { order } = req.body;
      if (!Array.isArray(order)) return res.status(400).json({ message: "order must be an array" });
      await pool.query(`UPDATE portal_users SET category_order = $1 WHERE id = $2`, [JSON.stringify(order), userId]);
      res.json({ success: true, order });
    } catch (error) {
      res.status(500).json({ message: "Failed to save category order" });
    }
  });

  // Reset portal user's category order to global default
  app.delete("/api/portal/category-order", requirePortalAuth, async (req, res) => {
    try {
      const userId = req.session.portalUserId!;
      await pool.query(`UPDATE portal_users SET category_order = NULL WHERE id = $1`, [userId]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to reset category order" });
    }
  });

  // Get global default category order (admin)
  app.get("/api/admin/portal-category-order", requireAuth, async (req, res) => {
    try {
      const row = await pool.query(`SELECT value FROM crm_settings WHERE key = 'portal_category_order' LIMIT 1`);
      if (row.rows[0]?.value) {
        try {
          const parsed = JSON.parse(row.rows[0].value);
          if (Array.isArray(parsed)) return res.json({ order: parsed, source: "global" });
        } catch {}
      }
      res.json({ order: DEFAULT_CATEGORY_ORDER, source: "default" });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch global category order" });
    }
  });

  // Save global default category order (admin)
  app.post("/api/admin/portal-category-order", requireAdmin, async (req, res) => {
    try {
      const { order } = req.body;
      if (!Array.isArray(order)) return res.status(400).json({ message: "order must be an array" });
      const existing = await pool.query(`SELECT id FROM crm_settings WHERE key = 'portal_category_order' LIMIT 1`);
      if (existing.rows.length > 0) {
        await pool.query(`UPDATE crm_settings SET value = $1, updated_at = NOW() WHERE key = 'portal_category_order'`, [JSON.stringify(order)]);
      } else {
        await pool.query(`INSERT INTO crm_settings (id, key, value, created_at, updated_at) VALUES (gen_random_uuid(), 'portal_category_order', $1, NOW(), NOW())`, [JSON.stringify(order)]);
      }
      res.json({ success: true, order });
    } catch (error) {
      res.status(500).json({ message: "Failed to save global category order" });
    }
  });

  // ============ ADMIN: PORTAL USER MANAGEMENT ============

  app.get("/api/companies/:id/portal-users", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT pu.id, pu.company_id, pu.name, pu.email, pu.active, pu.created_at, pu.last_login
        FROM portal_users pu
        WHERE pu.company_id = $1
        ORDER BY pu.created_at DESC
      `, [req.params.id]);
      res.json(result.rows.map((r: any) => ({
        id: r.id,
        companyId: r.company_id,
        name: r.name,
        email: r.email,
        active: r.active,
        createdAt: r.created_at,
        lastLogin: r.last_login,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch portal users" });
    }
  });

  // Admin: delete a specific template for a company
  app.delete("/api/companies/:id/portal-recurring-items/:templateId", requireAdmin, async (req, res) => {
    try {
      const { id: companyId, templateId } = req.params;
      const result = await pool.query(
        `SELECT recurring_items, recurring_interval_weeks, recurring_last_placed FROM portal_users WHERE company_id = $1 LIMIT 1`,
        [companyId]
      );
      const row = result.rows[0] || {};
      let templates = parseTemplates(row.recurring_items, row.recurring_interval_weeks, row.recurring_last_placed);
      templates = templates.filter((t: any) => t.id !== templateId);
      await pool.query(`UPDATE portal_users SET recurring_items = $1 WHERE company_id = $2`, [JSON.stringify(templates), companyId]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // Admin: clear all recurring templates for a company
  app.delete("/api/companies/:id/portal-recurring-items", requireAdmin, async (req, res) => {
    try {
      await pool.query(`UPDATE portal_users SET recurring_items = '[]'::jsonb WHERE company_id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear recurring templates" });
    }
  });

  app.get("/api/companies/:id/portal-recurring-items", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT recurring_items, recurring_interval_weeks, recurring_last_placed FROM portal_users WHERE company_id = $1 LIMIT 1`,
        [req.params.id]
      );
      const row = result.rows[0] || {};
      const templates = parseTemplates(row.recurring_items, row.recurring_interval_weeks, row.recurring_last_placed);
      res.json({ templates });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recurring items" });
    }
  });

  app.put("/api/companies/:id/portal-recurring-items", requireAdmin, async (req, res) => {
    try {
      const { template } = req.body;
      if (!template || !Array.isArray(template.items)) return res.status(400).json({ message: "template with items required" });
      const result = await pool.query(
        `SELECT recurring_items, recurring_interval_weeks, recurring_last_placed FROM portal_users WHERE company_id = $1 LIMIT 1`,
        [req.params.id]
      );
      const row = result.rows[0] || {};
      let templates = parseTemplates(row.recurring_items, row.recurring_interval_weeks, row.recurring_last_placed);
      const id = template.id || crypto.randomUUID();
      const idx = templates.findIndex((t: any) => t.id === id);
      const upserted = { id, name: template.name || 'Regular Order', intervalWeeks: template.intervalWeeks ?? 2, lastPlaced: templates[idx]?.lastPlaced || null, items: template.items };
      if (idx >= 0) templates[idx] = upserted;
      else templates.push(upserted);
      await pool.query(`UPDATE portal_users SET recurring_items = $1 WHERE company_id = $2`, [JSON.stringify(templates), req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to save recurring items" });
    }
  });

  app.post("/api/companies/:id/portal-recurring-items/from-order/:orderId", requireAdmin, async (req, res) => {
    try {
      const { orderId, id: companyId } = req.params;
      const { templateName } = req.body;
      const orderResult = await pool.query(
        `SELECT ol.product_id, ol.product_name, ol.quantity, ol.filling, ol.weight, ol.unit_price, p.category
         FROM order_lines ol
         LEFT JOIN products p ON p.id = ol.product_id
         WHERE ol.order_id = $1
         ORDER BY ol.id`,
        [orderId]
      );
      const items = orderResult.rows.map((r: any) => ({
        productId: r.product_id,
        productName: r.product_name,
        category: r.category || "",
        filling: r.filling || undefined,
        weight: r.weight || undefined,
        unitPrice: r.unit_price,
        quantity: r.quantity,
      }));
      // Add as a new template (preserve existing ones)
      const result = await pool.query(
        `SELECT recurring_items, recurring_interval_weeks, recurring_last_placed FROM portal_users WHERE company_id = $1 LIMIT 1`,
        [companyId]
      );
      const row = result.rows[0] || {};
      let templates = parseTemplates(row.recurring_items, row.recurring_interval_weeks, row.recurring_last_placed);
      const newTemplate = { id: crypto.randomUUID(), name: templateName || 'Regular Order', intervalWeeks: 2, lastPlaced: null, items };
      templates.push(newTemplate);
      await pool.query(`UPDATE portal_users SET recurring_items = $1 WHERE company_id = $2`, [JSON.stringify(templates), companyId]);
      res.json({ success: true, itemCount: items.length });
    } catch (error) {
      res.status(500).json({ message: "Failed to copy order as recurring template" });
    }
  });

  app.get("/api/admin/portal-users", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT pu.id, pu.company_id, pu.contact_id, pu.name, pu.email, pu.active, pu.created_at, pu.last_login,
          COALESCE(co.trading_name, co.legal_name, '') as company_name, co.payment_terms,
          ct.first_name, ct.last_name
        FROM portal_users pu
        LEFT JOIN companies co ON co.id = pu.company_id
        LEFT JOIN contacts ct ON ct.id = pu.contact_id
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

  app.get("/api/admin/portal-users/export-csv", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT pu.name, pu.email,
          COALESCE(co.trading_name, co.legal_name, '') as company_name
        FROM portal_users pu
        LEFT JOIN companies co ON co.id = pu.company_id
        ORDER BY pu.name
      `);

      let csv = 'Name,Email (Login),Company\n';
      for (const row of result.rows) {
        const escapeCsv = (s: string) => '"' + s.replace(/"/g, '""') + '"';
        csv += [escapeCsv(row.name), escapeCsv(row.email), escapeCsv(row.company_name)].join(',') + '\n';
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="portal_accounts.csv"');
      res.send(csv);
    } catch (error) {
      res.status(500).json({ message: "Failed to export portal users" });
    }
  });

  app.patch("/api/admin/portal-users/:id", requireAdmin, async (req, res) => {
    try {
      const { active, password, email, name } = req.body;
      const updates: any = {};
      if (typeof active === "boolean") updates.active = active;
      if (password) updates.passwordHash = await bcrypt.hash(password, 10);
      if (email) {
        const trimmedEmail = email.toLowerCase().trim();
        const existing = await db.select().from(portalUsers).where(eq(portalUsers.email, trimmedEmail));
        if (existing.length > 0 && existing[0].id !== req.params.id) {
          return res.status(400).json({ message: "A portal user with this email already exists" });
        }
        updates.email = trimmedEmail;
      }
      if (name && typeof name === "string") updates.name = name.trim();
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

  app.get("/api/admin/portal-users/:id/profile", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const [user] = await pool.query(`
        SELECT pu.id, pu.company_id, pu.contact_id, pu.name, pu.email, pu.active, pu.created_at, pu.last_login,
          c.legal_name as company_name, c.trading_name, c.payment_terms, c.phone as company_phone,
          c.shipping_address, c.client_grade as grade
        FROM portal_users pu
        LEFT JOIN companies c ON c.id = pu.company_id
        WHERE pu.id = $1
      `, [userId]).then(r => r.rows);
      if (!user) return res.status(404).json({ message: "Portal user not found" });

      const orderStats = await pool.query(`
        SELECT 
          COUNT(*) as total_orders,
          COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')) as open_orders,
          COALESCE(SUM(CAST(total AS DECIMAL)), 0) as total_spent,
          MAX(order_date) as last_order_date
        FROM orders WHERE company_id = $1
      `, [user.company_id]);

      const invoiceStats = await pool.query(`
        SELECT 
          COUNT(*) as total_invoices,
          COUNT(*) FILTER (WHERE status IN ('sent', 'overdue')) as unpaid_invoices,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN CAST(total AS DECIMAL) ELSE 0 END), 0) as outstanding_amount
        FROM invoices WHERE company_id = $1
      `, [user.company_id]);

      const recentOrders = await pool.query(`
        SELECT id, order_number, order_date, status, payment_status, total
        FROM orders WHERE company_id = $1
        ORDER BY order_date DESC NULLS LAST
        LIMIT 5
      `, [user.company_id]);

      res.json({
        id: user.id,
        companyId: user.company_id,
        contactId: user.contact_id,
        name: user.name,
        email: user.email,
        active: user.active,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        companyName: user.company_name,
        tradingName: user.trading_name,
        paymentTerms: user.payment_terms,
        companyPhone: user.company_phone,
        shippingAddress: user.shipping_address,
        grade: user.grade,
        stats: {
          totalOrders: parseInt(orderStats.rows[0]?.total_orders || "0"),
          openOrders: parseInt(orderStats.rows[0]?.open_orders || "0"),
          totalSpent: parseFloat(orderStats.rows[0]?.total_spent || "0"),
          lastOrderDate: orderStats.rows[0]?.last_order_date,
          totalInvoices: parseInt(invoiceStats.rows[0]?.total_invoices || "0"),
          unpaidInvoices: parseInt(invoiceStats.rows[0]?.unpaid_invoices || "0"),
          outstandingAmount: parseFloat(invoiceStats.rows[0]?.outstanding_amount || "0"),
        },
        recentOrders: recentOrders.rows.map((r: any) => ({
          id: r.id,
          orderNumber: r.order_number,
          orderDate: r.order_date,
          status: r.status,
          paymentStatus: r.payment_status,
          total: r.total,
        })),
      });
    } catch (error) {
      console.error("Get portal user profile error:", error);
      res.status(500).json({ message: "Failed to fetch portal user profile" });
    }
  });

  // ============ CSV INVOICE IMPORT ============

  app.post("/api/admin/import-invoices-csv", requireAdmin, async (req, res) => {
    try {
      const contentType = req.headers["content-type"] || "";
      if (!contentType.includes("multipart/form-data")) {
        return res.status(400).json({ message: "Expected multipart/form-data" });
      }

      const busboy = await import("busboy");
      const bb = busboy.default({ headers: req.headers });
      let csvText = "";

      await new Promise<void>((resolve, reject) => {
        bb.on("file", (_fieldname: string, file: any) => {
          const chunks: Buffer[] = [];
          file.on("data", (d: Buffer) => chunks.push(d));
          file.on("end", () => { csvText = Buffer.concat(chunks).toString("utf-8"); });
          file.on("error", reject);
        });
        bb.on("finish", resolve);
        bb.on("error", reject);
        req.pipe(bb);
      });

      if (!csvText.trim()) {
        return res.status(400).json({ message: "Empty CSV file" });
      }

      // Simple CSV parser that handles quoted fields
      function parseCSV(text: string): string[][] {
        const rows: string[][] = [];
        const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          const cells: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
              else { inQuotes = !inQuotes; }
            } else if (ch === ',' && !inQuotes) {
              cells.push(current.trim());
              current = "";
            } else {
              current += ch;
            }
          }
          cells.push(current.trim());
          rows.push(cells);
        }
        return rows;
      }

      function normalizeKey(s: string): string {
        return s.toLowerCase().replace(/[^a-z0-9]/g, "");
      }

      function detectColumn(headers: string[], candidates: string[]): number {
        const normHeaders = headers.map(normalizeKey);
        for (const c of candidates) {
          const idx = normHeaders.indexOf(normalizeKey(c));
          if (idx !== -1) return idx;
        }
        return -1;
      }

      const rows = parseCSV(csvText);
      if (rows.length < 2) {
        return res.status(400).json({ message: "CSV must have a header row and at least one data row" });
      }

      const headers = rows[0];
      const dataRows = rows.slice(1);

      // Xero exports ContactName; also handle other common naming conventions
      const colInvoiceNum = detectColumn(headers, ["InvoiceNumber", "Invoice Number", "Invoice No", "Invoice #", "Inv No", "InvNo", "Invoice"]);
      const colCompany = detectColumn(headers, ["ContactName", "Contact Name", "Company", "Customer", "Client", "To", "Company Name", "Customer Name", "Contact"]);
      const colIssueDate = detectColumn(headers, ["InvoiceDate", "Invoice Date", "Date", "Issue Date", "IssueDate"]);
      const colDueDate = detectColumn(headers, ["DueDate", "Due Date", "Due", "Payment Due", "PaymentDue"]);
      const colTotal = detectColumn(headers, ["Total", "Amount", "Total Amount", "Invoice Total", "Gross", "TotalAmount", "InvoiceTotal"]);
      const colSubtotal = detectColumn(headers, ["Subtotal", "Sub Total", "Net", "Net Amount", "NetAmount", "SubTotal"]);
      const colTax = detectColumn(headers, ["TaxTotal", "Tax Total", "Tax", "GST", "Tax Amount", "VAT", "TaxAmount"]);
      const colStatus = detectColumn(headers, ["Status", "Payment Status", "PaymentStatus"]);
      const colBalance = detectColumn(headers, ["InvoiceAmountDue", "Invoice Amount Due", "Balance Due", "Balance", "Amount Due", "Outstanding", "BalanceDue", "AmountDue"]);

      if (colInvoiceNum === -1) {
        return res.status(400).json({ message: "Could not find an Invoice Number column. Ensure your CSV has a column named 'InvoiceNumber' or 'Invoice Number'." });
      }
      if (colCompany === -1) {
        return res.status(400).json({ message: "Could not find a Company/Customer column. Ensure your CSV has a column named 'ContactName', 'Company', or 'Customer'." });
      }

      // Load all companies for matching
      const allCompanies = await pool.query(`SELECT id, legal_name, trading_name FROM companies`);
      const companyByName = new Map<string, string>();
      for (const c of allCompanies.rows) {
        if (c.trading_name) companyByName.set(c.trading_name.toLowerCase().trim(), c.id);
        companyByName.set(c.legal_name.toLowerCase().trim(), c.id);
      }

      function findCompany(name: string): string | null {
        const n = name.toLowerCase().trim();
        if (companyByName.has(n)) return companyByName.get(n)!;
        // Try partial match — name contains key or key contains name
        for (const [k, v] of companyByName.entries()) {
          if (k.includes(n) || n.includes(k)) return v;
        }
        // Try stripping /COD, /cod suffixes that appear in Xero contact names
        const stripped = n.replace(/\/cod$/i, "").replace(/\s+t\/as\s+.*/i, "").trim();
        if (stripped !== n) {
          if (companyByName.has(stripped)) return companyByName.get(stripped)!;
          for (const [k, v] of companyByName.entries()) {
            if (k.includes(stripped) || stripped.includes(k)) return v;
          }
        }
        return null;
      }

      function mapStatus(s: string): string {
        const n = s.toLowerCase().trim();
        if (n === "paid") return "paid";
        if (n === "overdue") return "overdue";
        if (["void", "cancelled", "canceled"].includes(n)) return "void";
        if (n === "draft") return "draft";
        return "sent"; // "awaiting payment", "sent", "viewed", "unsent" etc.
      }

      function parseAmount(s: string): string {
        if (!s) return "0.00";
        const num = parseFloat(s.replace(/[^0-9.\-]/g, ""));
        return isNaN(num) ? "0.00" : num.toFixed(2);
      }

      // Xero exports dates as DD/MM/YYYY — handle both formats
      function parseDate(s: string): Date | null {
        if (!s || !s.trim()) return null;
        const clean = s.trim();
        // Try DD/MM/YYYY or D/M/YYYY
        const dmyMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmyMatch) {
          const [, d, m, y] = dmyMatch;
          const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
          return isNaN(date.getTime()) ? null : date;
        }
        // Fall back to JS native parsing (handles ISO etc.)
        const d = new Date(clean);
        return isNaN(d.getTime()) ? null : d;
      }

      // Group rows by InvoiceNumber — Xero exports one row per line item
      // We only want one invoice record per invoice number
      const invoiceMap = new Map<string, { companyName: string; row: string[] }>();
      for (const row of dataRows) {
        if (row.every(c => !c)) continue;
        const invNum = row[colInvoiceNum]?.trim();
        if (!invNum) continue;
        // Keep only the first occurrence (subsequent rows are additional line items)
        if (!invoiceMap.has(invNum)) {
          invoiceMap.set(invNum, { companyName: row[colCompany]?.trim() || "", row });
        }
      }

      let imported = 0;
      let skipped = 0;
      const duplicateInvoiceNumbers: string[] = [];
      const unmatchedMap = new Map<string, string[]>(); // company name -> invoice numbers
      const errors: string[] = [];

      for (const [invoiceNumber, { companyName, row }] of invoiceMap.entries()) {
        if (!companyName) { skipped++; continue; }

        const companyId = findCompany(companyName);
        if (!companyId) {
          const existing = unmatchedMap.get(companyName) || [];
          existing.push(invoiceNumber);
          unmatchedMap.set(companyName, existing);
          skipped++;
          continue;
        }

        // Check for duplicate
        const existing = await pool.query(`SELECT id FROM invoices WHERE invoice_number = $1`, [invoiceNumber]);
        if (existing.rows.length > 0) { duplicateInvoiceNumbers.push(invoiceNumber); continue; }

        const total = colTotal !== -1 ? parseAmount(row[colTotal]) : "0.00";
        const subtotal = colSubtotal !== -1 ? parseAmount(row[colSubtotal]) : total;
        const tax = colTax !== -1 ? parseAmount(row[colTax]) : "0.00";
        const balanceDue = colBalance !== -1 ? parseAmount(row[colBalance]) : total;
        const status = colStatus !== -1 ? mapStatus(row[colStatus] || "") : "sent";
        const issueDate = colIssueDate !== -1 ? (parseDate(row[colIssueDate]) || new Date()) : new Date();
        const dueDate = colDueDate !== -1 ? parseDate(row[colDueDate]) : null;

        try {
          await pool.query(
            `INSERT INTO invoices (id, invoice_number, company_id, status, issue_date, due_date, subtotal, tax, total, balance_due, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [invoiceNumber, companyId, status, issueDate, dueDate, subtotal, tax, total, balanceDue]
          );
          imported++;
        } catch (e: any) {
          errors.push(`${invoiceNumber}: ${e.message}`);
        }
      }

      const unmatchedDetails = Array.from(unmatchedMap.entries()).map(([company, invoices]) => ({ company, invoices }));
      res.json({
        imported,
        skipped,
        skippedDuplicates: duplicateInvoiceNumbers.length,
        duplicateInvoiceNumbers,
        unmatched: unmatchedDetails.map(u => u.company),
        unmatchedDetails,
        errors,
        total: invoiceMap.size,
      });
    } catch (error: any) {
      console.error("CSV invoice import error:", error);
      res.status(500).json({ message: error.message || "Failed to import invoices" });
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

  // ==================== CRM TASKS ROUTES ====================
  app.get("/api/crm/tasks", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT t.*, u.name as assigned_to_name, c.trading_name as company_name
        FROM crm_tasks t
        LEFT JOIN users u ON u.id = t.assigned_to
        LEFT JOIN companies c ON c.id = t.company_id
        ORDER BY t.created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.post("/api/crm/tasks", requireEdit, async (req, res) => {
    try {
      const { title, description, status, priority, dueDate, assignedTo, companyId, contactId, dealId, completedAt } = req.body;
      const result = await pool.query(
        `INSERT INTO crm_tasks (id, title, description, status, priority, due_date, assigned_to, company_id, contact_id, deal_id, created_by, completed_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING *`,
        [title, description || null, status || 'todo', priority || 'medium', dueDate || null, assignedTo || null, companyId || null, contactId || null, dealId || null, req.session.userId, completedAt || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  app.patch("/api/crm/tasks/:id", requireEdit, async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, status, priority, dueDate, assignedTo, companyId, contactId, dealId, completedAt } = req.body;
      const result = await pool.query(
        `UPDATE crm_tasks SET title = COALESCE($1, title), description = COALESCE($2, description), status = COALESCE($3, status), priority = COALESCE($4, priority), due_date = $5, assigned_to = $6, company_id = $7, contact_id = $8, deal_id = $9, completed_at = $10
         WHERE id = $11 RETURNING *`,
        [title, description, status, priority, dueDate !== undefined ? dueDate : null, assignedTo !== undefined ? assignedTo : null, companyId !== undefined ? companyId : null, contactId !== undefined ? contactId : null, dealId !== undefined ? dealId : null, completedAt !== undefined ? completedAt : null, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  app.delete("/api/crm/tasks/:id", requireEdit, async (req, res) => {
    try {
      const result = await pool.query("DELETE FROM crm_tasks WHERE id = $1 RETURNING id", [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json({ message: "Task deleted" });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // ==================== CRM TICKETS ROUTES ====================
  app.get("/api/crm/tickets", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT t.*, c.trading_name as company_name, u.name as assigned_to_name, u2.name as created_by_name
        FROM crm_tickets t
        LEFT JOIN companies c ON c.id = t.company_id
        LEFT JOIN users u ON u.id = t.assigned_to
        LEFT JOIN users u2 ON u2.id = t.created_by
        ORDER BY t.created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  app.post("/api/crm/tickets", requireEdit, async (req, res) => {
    try {
      const { subject, description, status, priority, category, companyId, contactId, assignedTo } = req.body;
      const countResult = await pool.query("SELECT COUNT(*) as cnt FROM crm_tickets");
      const ticketNumber = "TKT-" + (parseInt(countResult.rows[0].cnt) + 1);
      const result = await pool.query(
        `INSERT INTO crm_tickets (id, ticket_number, subject, description, status, priority, category, company_id, contact_id, assigned_to, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING *`,
        [ticketNumber, subject, description || null, status || 'open', priority || 'medium', category || 'general', companyId || null, contactId || null, assignedTo || null, req.session.userId]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating ticket:", error);
      res.status(500).json({ message: "Failed to create ticket" });
    }
  });

  app.patch("/api/crm/tickets/:id", requireEdit, async (req, res) => {
    try {
      const { id } = req.params;
      const { subject, description, status, priority, category, companyId, contactId, assignedTo, resolvedAt } = req.body;
      const result = await pool.query(
        `UPDATE crm_tickets SET subject = COALESCE($1, subject), description = COALESCE($2, description), status = COALESCE($3, status), priority = COALESCE($4, priority), category = COALESCE($5, category), company_id = $6, contact_id = $7, assigned_to = $8, resolved_at = $9, updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [subject, description, status, priority, category, companyId !== undefined ? companyId : null, contactId !== undefined ? contactId : null, assignedTo !== undefined ? assignedTo : null, resolvedAt !== undefined ? resolvedAt : null, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Ticket not found" });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating ticket:", error);
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  app.delete("/api/crm/tickets/:id", requireEdit, async (req, res) => {
    try {
      const result = await pool.query("DELETE FROM crm_tickets WHERE id = $1 RETURNING id", [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Ticket not found" });
      }
      res.json({ message: "Ticket deleted" });
    } catch (error) {
      console.error("Error deleting ticket:", error);
      res.status(500).json({ message: "Failed to delete ticket" });
    }
  });

  // ==================== CRM CALLS ROUTES ====================
  app.get("/api/crm/calls", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT cl.*, c.trading_name as company_name, ct.first_name || ' ' || ct.last_name as contact_name, u.name as called_by_name
        FROM crm_calls cl
        LEFT JOIN companies c ON c.id = cl.company_id
        LEFT JOIN contacts ct ON ct.id = cl.contact_id
        LEFT JOIN users u ON u.id = cl.called_by
        ORDER BY cl.called_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching calls:", error);
      res.status(500).json({ message: "Failed to fetch calls" });
    }
  });

  app.post("/api/crm/calls", requireEdit, async (req, res) => {
    try {
      const { direction, status, companyId, contactId, dealId, duration, notes, outcome, calledAt } = req.body;
      const result = await pool.query(
        `INSERT INTO crm_calls (id, direction, status, company_id, contact_id, deal_id, duration, notes, outcome, called_by, called_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING *`,
        [direction || 'outbound', status || 'completed', companyId || null, contactId || null, dealId || null, duration || null, notes || null, outcome || null, req.session.userId, calledAt || new Date()]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating call:", error);
      res.status(500).json({ message: "Failed to create call" });
    }
  });

  app.delete("/api/crm/calls/:id", requireEdit, async (req, res) => {
    try {
      const result = await pool.query("DELETE FROM crm_calls WHERE id = $1 RETURNING id", [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Call not found" });
      }
      res.json({ message: "Call deleted" });
    } catch (error) {
      console.error("Error deleting call:", error);
      res.status(500).json({ message: "Failed to delete call" });
    }
  });

  // ==================== CRM MESSAGE TEMPLATES ROUTES ====================
  app.get("/api/crm/message-templates", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT mt.*, u.name as created_by_name
        FROM crm_message_templates mt
        LEFT JOIN users u ON u.id = mt.created_by
        ORDER BY mt.created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching message templates:", error);
      res.status(500).json({ message: "Failed to fetch message templates" });
    }
  });

  app.post("/api/crm/message-templates", requireEdit, async (req, res) => {
    try {
      const { name, subject, body, category } = req.body;
      const result = await pool.query(
        `INSERT INTO crm_message_templates (id, name, subject, body, category, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [name, subject || null, body, category || 'general', req.session.userId]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating message template:", error);
      res.status(500).json({ message: "Failed to create message template" });
    }
  });

  app.patch("/api/crm/message-templates/:id", requireEdit, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, subject, body, category } = req.body;
      const result = await pool.query(
        `UPDATE crm_message_templates SET name = COALESCE($1, name), subject = COALESCE($2, subject), body = COALESCE($3, body), category = COALESCE($4, category), updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [name, subject, body, category, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Message template not found" });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating message template:", error);
      res.status(500).json({ message: "Failed to update message template" });
    }
  });

  app.delete("/api/crm/message-templates/:id", requireEdit, async (req, res) => {
    try {
      const result = await pool.query("DELETE FROM crm_message_templates WHERE id = $1 RETURNING id", [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Message template not found" });
      }
      res.json({ message: "Message template deleted" });
    } catch (error) {
      console.error("Error deleting message template:", error);
      res.status(500).json({ message: "Failed to delete message template" });
    }
  });

  // ==================== CRM SNIPPETS ROUTES ====================
  app.get("/api/crm/snippets", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT s.*, u.name as created_by_name
        FROM crm_snippets s
        LEFT JOIN users u ON u.id = s.created_by
        ORDER BY s.created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching snippets:", error);
      res.status(500).json({ message: "Failed to fetch snippets" });
    }
  });

  app.post("/api/crm/snippets", requireEdit, async (req, res) => {
    try {
      const { shortcut, content, category } = req.body;
      const result = await pool.query(
        `INSERT INTO crm_snippets (id, shortcut, content, category, created_by, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
         RETURNING *`,
        [shortcut, content, category || 'general', req.session.userId]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating snippet:", error);
      res.status(500).json({ message: "Failed to create snippet" });
    }
  });

  app.patch("/api/crm/snippets/:id", requireEdit, async (req, res) => {
    try {
      const { id } = req.params;
      const { shortcut, content, category } = req.body;
      const result = await pool.query(
        `UPDATE crm_snippets SET shortcut = COALESCE($1, shortcut), content = COALESCE($2, content), category = COALESCE($3, category)
         WHERE id = $4 RETURNING *`,
        [shortcut, content, category, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Snippet not found" });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating snippet:", error);
      res.status(500).json({ message: "Failed to update snippet" });
    }
  });

  app.delete("/api/crm/snippets/:id", requireEdit, async (req, res) => {
    try {
      const result = await pool.query("DELETE FROM crm_snippets WHERE id = $1 RETURNING id", [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Snippet not found" });
      }
      res.json({ message: "Snippet deleted" });
    } catch (error) {
      console.error("Error deleting snippet:", error);
      res.status(500).json({ message: "Failed to delete snippet" });
    }
  });

  // ==================== SHOPIFY INTEGRATION ====================

  // Helper to get Shopify config from crm_settings
  async function getShopifyConfig() {
    const keys = ["shopify_store_domain", "shopify_api_token", "shopify_webhook_secret", "shopify_client_id", "shopify_client_secret"];
    const rows = await db.select().from(crmSettings).where(inArray(crmSettings.key, keys));
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return {
      storeDomain: map["shopify_store_domain"] || "",
      apiToken: map["shopify_api_token"] || "",
      webhookSecret: map["shopify_webhook_secret"] || "",
      clientId: map["shopify_client_id"] || "",
      clientSecret: map["shopify_client_secret"] || "",
    };
  }

  // Upsert a crm_setting value
  async function upsertSetting(key: string, value: string) {
    await db.insert(crmSettings).values({ key, value }).onConflictDoUpdate({
      target: crmSettings.key,
      set: { value, updatedAt: new Date() },
    });
  }

  // GET shopify config (masks tokens)
  app.get("/api/admin/shopify-config", requireAdmin, async (req, res) => {
    try {
      const config = await getShopifyConfig();
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      res.json({
        storeDomain: config.storeDomain,
        apiToken: config.apiToken ? "••••••••" + config.apiToken.slice(-4) : "",
        webhookSecret: config.webhookSecret ? "••••••••" + config.webhookSecret.slice(-4) : "",
        clientId: config.clientId || "",
        clientSecret: config.clientSecret ? "••••••••" + config.clientSecret.slice(-4) : "",
        webhookUrl: `${protocol}://${host}/api/webhooks/shopify/orders/created`,
        oauthCallbackUrl: `${protocol}://${host}/api/shopify/oauth/callback`,
        isConnected: !!(config.storeDomain && config.apiToken),
        hasOAuthCredentials: !!(config.clientId && config.clientSecret),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get Shopify config" });
    }
  });

  // PUT shopify config
  app.put("/api/admin/shopify-config", requireAdmin, async (req, res) => {
    try {
      const { storeDomain, apiToken, webhookSecret, clientId, clientSecret } = req.body;
      if (storeDomain !== undefined) await upsertSetting("shopify_store_domain", storeDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""));
      if (apiToken && !apiToken.startsWith("••••")) await upsertSetting("shopify_api_token", apiToken.trim());
      if (webhookSecret && !webhookSecret.startsWith("••••")) await upsertSetting("shopify_webhook_secret", webhookSecret.trim());
      if (clientId !== undefined) await upsertSetting("shopify_client_id", clientId.trim());
      if (clientSecret && !clientSecret.startsWith("••••")) await upsertSetting("shopify_client_secret", clientSecret.trim());
      res.json({ message: "Shopify configuration saved" });
    } catch (error) {
      console.error("Save Shopify config error:", error);
      res.status(500).json({ message: "Failed to save configuration" });
    }
  });

  // GET start Shopify OAuth — redirects to Shopify authorization page
  app.get("/api/shopify/oauth/start", requireAdmin, async (req, res) => {
    try {
      const config = await getShopifyConfig();
      if (!config.storeDomain || !config.clientId) {
        return res.redirect("/admin?tab=integrations&shopify_error=missing_config#shopify-config");
      }
      const crypto = await import("crypto");
      const state = crypto.randomBytes(16).toString("hex");
      (req.session as any).shopifyOAuthState = state;
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/shopify/oauth/callback`;
      const scopes = "read_orders,write_orders,write_fulfillments,read_analytics";
      const authUrl = `https://${config.storeDomain}/admin/oauth/authorize?client_id=${config.clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
      res.redirect(authUrl);
    } catch (error: any) {
      console.error("[SHOPIFY OAuth] Start error:", error);
      res.redirect("/admin?tab=integrations&shopify_error=start_failed#shopify-config");
    }
  });

  // GET Shopify OAuth callback — exchanges code for access token
  app.get("/api/shopify/oauth/callback", async (req, res) => {
    try {
      const { code, state, hmac, shop } = req.query as Record<string, string>;
      const storedState = (req.session as any).shopifyOAuthState;

      if (!state || state !== storedState) {
        return res.redirect("/admin?tab=integrations&shopify_error=invalid_state#shopify-config");
      }
      delete (req.session as any).shopifyOAuthState;

      const config = await getShopifyConfig();
      if (!config.clientId || !config.clientSecret) {
        return res.redirect("/admin?tab=integrations&shopify_error=missing_credentials#shopify-config");
      }

      // Verify HMAC
      if (hmac) {
        const crypto = await import("crypto");
        const params = Object.entries(req.query as Record<string, string>)
          .filter(([k]) => k !== "hmac")
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join("&");
        const digest = crypto.createHmac("sha256", config.clientSecret).update(params).digest("hex");
        if (digest !== hmac) {
          return res.redirect("/admin?tab=integrations&shopify_error=hmac_failed#shopify-config");
        }
      }

      // Exchange code for token
      const tokenRes = await fetch(`https://${shop || config.storeDomain}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("[SHOPIFY OAuth] Token exchange failed:", err);
        return res.redirect("/admin?tab=integrations&shopify_error=token_exchange#shopify-config");
      }

      const tokenData = await tokenRes.json() as { access_token: string; scope: string };
      await upsertSetting("shopify_api_token", tokenData.access_token);
      if (shop) await upsertSetting("shopify_store_domain", shop.replace(/^https?:\/\//, "").replace(/\/$/, ""));

      console.log(`[SHOPIFY OAuth] Successfully connected. Scopes: ${tokenData.scope}`);
      res.redirect("/admin?tab=integrations&shopify_success=1#shopify-config");
    } catch (error: any) {
      console.error("[SHOPIFY OAuth] Callback error:", error);
      res.redirect("/admin?tab=integrations&shopify_error=callback_failed#shopify-config");
    }
  });

  // DELETE shopify OAuth token (disconnect)
  app.delete("/api/admin/shopify-config/disconnect", requireAdmin, async (req, res) => {
    try {
      await upsertSetting("shopify_api_token", "");
      res.json({ message: "Shopify disconnected" });
    } catch (error) {
      res.status(500).json({ message: "Failed to disconnect" });
    }
  });

  // POST test Shopify connection
  app.post("/api/admin/shopify-config/test", requireAdmin, async (req, res) => {
    try {
      const config = await getShopifyConfig();
      if (!config.storeDomain || !config.apiToken) {
        return res.status(400).json({ message: "Store domain and API token are required" });
      }
      const testRes = await fetch(`https://${config.storeDomain}/admin/api/2024-01/shop.json`, {
        headers: { "X-Shopify-Access-Token": config.apiToken },
      });
      if (!testRes.ok) {
        const body = await testRes.text();
        return res.status(400).json({ message: `Shopify API error: ${testRes.status} — check your credentials`, detail: body });
      }
      const data = await testRes.json() as any;
      res.json({ message: `Connected to ${data.shop?.name || config.storeDomain} successfully` });
    } catch (error: any) {
      res.status(500).json({ message: `Connection failed: ${error.message}` });
    }
  });

  // POST public Shopify webhook — orders/created
  app.post("/api/webhooks/shopify/orders/created", async (req, res) => {
    try {
      const config = await getShopifyConfig();

      // Verify HMAC signature if webhook secret is configured
      if (config.webhookSecret) {
        const shopifyHmac = req.headers["x-shopify-hmac-sha256"] as string;
        if (!shopifyHmac) return res.status(401).json({ message: "Missing HMAC header" });
        const crypto = await import("crypto");
        const rawBuf = req.rawBody;
        if (!rawBuf) {
          console.warn("[SHOPIFY] No rawBody available for HMAC verification");
          return res.status(400).json({ message: "No raw body" });
        }
        const digest = crypto.createHmac("sha256", config.webhookSecret).update(rawBuf).digest("base64");
        if (digest !== shopifyHmac) {
          console.warn("[SHOPIFY] Webhook HMAC verification failed");
          return res.status(401).json({ message: "HMAC verification failed" });
        }
      }

      // Body is already parsed by global express.json middleware
      const payload = req.body as any;
      const shopifyOrderId = String(payload.id);
      const shopifyOrderNumber = payload.name || `#${payload.order_number}`;

      console.log(`[SHOPIFY] Received order webhook: ${shopifyOrderNumber} (id=${shopifyOrderId})`);

      // Deduplicate — skip if already imported as order or pending request
      const existingOrder = await pool.query(
        `SELECT id FROM orders WHERE shopify_order_id = $1 LIMIT 1`,
        [shopifyOrderId]
      );
      if (existingOrder.rows.length > 0) {
        console.log(`[SHOPIFY] Order ${shopifyOrderNumber} already in orders, skipping`);
        return res.json({ message: "Order already imported" });
      }
      const existingReq = await pool.query(
        `SELECT id FROM customer_order_requests WHERE shopify_order_id = $1 LIMIT 1`,
        [shopifyOrderId]
      );
      if (existingReq.rows.length > 0) {
        console.log(`[SHOPIFY] Order ${shopifyOrderNumber} already in order requests, skipping`);
        return res.json({ message: "Order already in requests" });
      }

      // Map Shopify customer/address
      const customer = payload.customer || {};
      const shipping = payload.shipping_address || payload.billing_address || {};
      const customerName = shipping.name || `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Shopify Customer";
      const customerEmail = customer.email || payload.email || "shopify@puradown.com.au";
      const customerPhone = shipping.phone || customer.phone || null;
      const customerAddress = [
        shipping.address1, shipping.address2, shipping.city,
        shipping.province, shipping.zip, shipping.country
      ].filter(Boolean).join("\n") || null;

      // Get the configured Shopify company name
      const allCompanies = await storage.getAllCompanies();
      const configuredCompanyId = await storage.getSetting("shopify_company_id");
      let shopifyCompany = configuredCompanyId
        ? allCompanies.find((c) => c.id === configuredCompanyId)
        : null;
      if (!shopifyCompany) {
        shopifyCompany = allCompanies.find((c) =>
          (c.legalName || "").toLowerCase().includes("puradown") ||
          (c.tradingName || "").toLowerCase().includes("puradown")
        ) || null;
      }
      const companyName = shopifyCompany
        ? (shopifyCompany.tradingName || shopifyCompany.legalName)
        : "PURADOWN WEBSITE SALES";

      // Financial
      const subtotal = parseFloat(payload.subtotal_price || "0");
      const total = parseFloat(payload.total_price || "0");
      const paymentStatus = payload.financial_status === "paid" ? "paid" : "unpaid";

      // Customer notes — only store the Shopify order number (clean and minimal for Milo)
      const noteLines: string[] = [`Shopify Order ${shopifyOrderNumber}`];
      if (payload.note) noteLines.push(payload.note);

      // Map Shopify line items to order request items format
      const lineItems = payload.line_items || [];
      const items: any[] = [];
      for (const item of lineItems) {
        const itemName = [item.title, item.variant_title].filter(Boolean).join(" — ");
        const unitPrice = parseFloat(item.price || "0");
        const qty = item.quantity || 1;
        const lineTotal = unitPrice * qty;

        let productId: string | null = null;
        if (item.sku) {
          const productRes = await pool.query(`SELECT id FROM products WHERE sku = $1 LIMIT 1`, [item.sku]);
          if (productRes.rows.length > 0) productId = productRes.rows[0].id;
        }

        items.push({
          productId,
          productName: itemName,
          sku: item.sku || null,
          quantity: qty,
          unitPrice,
          lineTotal,
        });
      }

      // Create Order Request (pending review) instead of order directly
      const reqRes = await pool.query(
        `INSERT INTO customer_order_requests 
          (id, company_name, contact_name, contact_email, contact_phone, shipping_address, customer_notes, items, status, shopify_order_id, shopify_order_number, payment_status, subtotal, total_amount, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12, NOW())
         RETURNING id`,
        [companyName, customerName, customerEmail, customerPhone, customerAddress,
          noteLines.join("\n"), JSON.stringify(items),
          shopifyOrderId, shopifyOrderNumber, paymentStatus,
          subtotal.toFixed(2), total.toFixed(2)]
      );

      console.log(`[SHOPIFY] Created order request from Shopify ${shopifyOrderNumber} (req id=${reqRes.rows[0].id})`);
      res.status(201).json({ message: "Order request created", requestId: reqRes.rows[0].id });
    } catch (error: any) {
      console.error("[SHOPIFY] Webhook error:", error);
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  // POST fulfill an order in Shopify (CRM → Shopify)
  app.post("/api/orders/:id/fulfill-shopify", requireEdit, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (!(order as any).shopifyOrderId) return res.status(400).json({ message: "This order is not linked to a Shopify order" });

      const config = await getShopifyConfig();
      if (!config.storeDomain || !config.apiToken) {
        return res.status(400).json({ message: "Shopify is not configured. Set up the integration in Admin Settings." });
      }

      const shopifyOrderId = (order as any).shopifyOrderId;

      // Get fulfillment orders from Shopify
      const foRes = await fetch(
        `https://${config.storeDomain}/admin/api/2024-01/orders/${shopifyOrderId}/fulfillment_orders.json`,
        { headers: { "X-Shopify-Access-Token": config.apiToken } }
      );
      if (!foRes.ok) {
        const body = await foRes.text();
        return res.status(400).json({ message: `Shopify API error: ${foRes.status}`, detail: body });
      }
      const foData = await foRes.json() as any;
      const openFOs = (foData.fulfillment_orders || []).filter((fo: any) => fo.status === "open");

      if (openFOs.length === 0) {
        return res.status(400).json({ message: "No open fulfillment orders found in Shopify — may already be fulfilled" });
      }

      // Create fulfillment
      const fulfillRes = await fetch(
        `https://${config.storeDomain}/admin/api/2024-01/fulfillments.json`,
        {
          method: "POST",
          headers: { "X-Shopify-Access-Token": config.apiToken, "Content-Type": "application/json" },
          body: JSON.stringify({
            fulfillment: {
              line_items_by_fulfillment_order: openFOs.map((fo: any) => ({ fulfillment_order_id: fo.id })),
              notify_customer: req.body.notifyCustomer ?? true,
            },
          }),
        }
      );

      if (!fulfillRes.ok) {
        const body = await fulfillRes.text();
        return res.status(400).json({ message: `Shopify fulfillment error: ${fulfillRes.status}`, detail: body });
      }
      const fulfillData = await fulfillRes.json() as any;
      const fulfillmentId = String(fulfillData.fulfillment?.id || "");

      // Save fulfillment ID to order
      await pool.query(
        `UPDATE orders SET shopify_fulfillment_id = $1, updated_at = NOW() WHERE id = $2`,
        [fulfillmentId, order.id]
      );

      await storage.createActivity({
        entityType: "order",
        entityId: order.id,
        activityType: "system",
        content: `Shopify fulfillment created (Fulfillment ID: ${fulfillmentId})`,
        createdBy: req.session.userId,
      });

      console.log(`[SHOPIFY] Fulfilled order ${order.orderNumber} in Shopify (fulfillment_id=${fulfillmentId})`);
      res.json({ message: "Order fulfilled in Shopify", fulfillmentId });
    } catch (error: any) {
      console.error("[SHOPIFY] Fulfill error:", error);
      res.status(500).json({ message: "Failed to fulfill order in Shopify" });
    }
  });

  registerChatRoutes(app);

  return httpServer;
}
