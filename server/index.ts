import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { pool } from "./db";
import { syncProductionData } from "./data-sync";
import { startAutoEmailSync } from "./outlook";
import { startInactivityChecker } from "./inactivity-checker";
import { startAutoXeroInvoiceSync } from "./xero";
import { importPuradownPrices } from "./import-puradown-prices";
import { seedPriceLists } from "./seed-price-lists";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function runStartupTasks() {
  // One-time cleanup: remove demo data, keep only purax accounts
  try {
    const demoCheck = await pool.query(`SELECT COUNT(*) as cnt FROM companies WHERE legal_name ILIKE '%Acme%' OR legal_name ILIKE '%BuildRight%'`);
    if (parseInt(demoCheck.rows[0].cnt) > 0) {
      console.log("Cleaning demo data...");
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
      console.log("Demo data cleaned successfully");
    }
  } catch (error) {
    console.error("Demo cleanup error:", error);
  }

  // Ensure Helena and Yana accounts exist with correct passwords
  try {
    const bcrypt = await import("bcryptjs");
    const freshHash = await bcrypt.default.hash("admin123", 10);
    const accounts = [
      { name: "Helena Katsios", email: "helena@purax.com.au" },
      { name: "Yana", email: "yana@purax.com.au" },
      { name: "Michele", email: "michele@purax.com.au" },
      { name: "Stephen", email: "stephen@purax.com.au" },
    ];
    for (const acct of accounts) {
      const exists = await pool.query(`SELECT id FROM users WHERE email = $1`, [acct.email]);
      if (exists.rows.length > 0) {
        await pool.query(`UPDATE users SET password_hash = $1, role = 'admin', active = true WHERE email = $2`, [freshHash, acct.email]);
      } else {
        await pool.query(`INSERT INTO users (name, email, password_hash, role, active) VALUES ($1, $2, $3, 'admin', true)`, [acct.name, acct.email, freshHash]);
      }
    }
    console.log("Admin accounts synced successfully");
  } catch (error) {
    console.error("Account sync error:", error);
  }

  // Sync production data (products + companies)
  try {
    await syncProductionData();
  } catch (error) {
    console.error("Data sync error:", error);
  }

  // One-time deduplication of companies using bulk SQL
  try {
    const dupCheck = await pool.query(`
      SELECT COUNT(*) as cnt FROM (
        SELECT legal_name, trading_name, COUNT(*) as c 
        FROM companies GROUP BY legal_name, trading_name HAVING COUNT(*) > 1
      ) dupes
    `);
    if (parseInt(dupCheck.rows[0].cnt) > 0) {
      console.log("Found duplicate companies, deduplicating with bulk SQL...");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Create temp table mapping duplicate IDs to the ID we want to keep
        await client.query(`
          CREATE TEMP TABLE dedup_map AS
          SELECT id as dupe_id,
            FIRST_VALUE(id) OVER (PARTITION BY legal_name, trading_name ORDER BY created_at ASC) as keep_id
          FROM companies
          WHERE (legal_name, COALESCE(trading_name, '')) IN (
            SELECT legal_name, COALESCE(trading_name, '')
            FROM companies GROUP BY legal_name, COALESCE(trading_name, '') HAVING COUNT(*) > 1
          )
        `);
        // Only keep rows where dupe_id != keep_id (those are the ones to remove)
        await client.query(`DELETE FROM dedup_map WHERE dupe_id = keep_id`);
        const countRes = await client.query(`SELECT COUNT(*) as cnt FROM dedup_map`);
        console.log(`Found ${countRes.rows[0].cnt} duplicate company records to remove`);
        // Bulk reassign all foreign keys
        const fkTables = ['portal_users', 'company_prices', 'contacts', 'deals', 'orders', 'invoices', 'quotes', 'emails', 'form_submissions'];
        for (const table of fkTables) {
          await client.query(`
            UPDATE ${table} SET company_id = dm.keep_id
            FROM dedup_map dm WHERE ${table}.company_id = dm.dupe_id
          `);
        }
        // Delete all duplicates
        await client.query(`DELETE FROM companies WHERE id IN (SELECT dupe_id FROM dedup_map)`);
        await client.query(`DROP TABLE dedup_map`);
        await client.query("COMMIT");
        console.log(`Deduplication complete`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Dedup transaction failed:", err);
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error("Dedup error:", error);
  }

  // Auto-import contacts from HubSpot CSV if contacts table is empty
  try {
    const contactCount = await pool.query("SELECT COUNT(*) as cnt FROM contacts");
    if (parseInt(contactCount.rows[0].cnt) === 0) {
      console.log("Contacts table is empty, running HubSpot import...");
      const fs = await import("fs");
      const pathMod = await import("path");
      const csvPaths = [
        pathMod.default.join(process.cwd(), "attached_assets/hubspot-crm-exports-all-contacts-2026-02-10_1770680837777.csv"),
        pathMod.default.join(__dirname, "../attached_assets/hubspot-crm-exports-all-contacts-2026-02-10_1770680837777.csv"),
      ];
      let csvContent = "";
      for (const p of csvPaths) {
        if (fs.default.existsSync(p)) {
          csvContent = fs.default.readFileSync(p, "utf-8");
          break;
        }
      }
      if (csvContent) {
        const allCompanies = (await pool.query("SELECT id, legal_name, trading_name FROM companies")).rows;
        const normalizeForMatch = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(ptyltd|ptylimited|pty|ltd|limited|cod|inc|corp|au|com|net)/g, "");
        const lines = csvContent.split("\n").filter((l: string) => l.trim());
        let imported = 0;
        const existingEmails = new Set<string>();
        const genericDomains = ["gmail", "hotmail", "yahoo", "outlook", "bigpond", "live", "icloud", "y7mail", "ozemail", "iinet", "westnet", "optusnet", "tpg", "netspace", "aapt", "me", "rocketmail"];

        const parseCsvLine = (line: string) => {
          const fields: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === "," && !inQuotes) { fields.push(current.trim()); current = ""; }
            else current += char;
          }
          fields.push(current.trim());
          return fields;
        };

        for (let i = 1; i < lines.length; i++) {
          const fields = parseCsvLine(lines[i]);
          if (fields.length < 4) continue;
          const email = fields[3] || "";
          const firstName = fields[1] || "";
          const lastName = fields[2] || "";
          const phone = fields[4] || "";
          const associatedCompany = fields[11] || "";
          if (!email || existingEmails.has(email.toLowerCase())) continue;

          let matchedCompanyId: string | null = null;
          const emailDomain = email.split("@")[1] || "";
          const domainBase = emailDomain.split(".")[0];

          if (domainBase && !genericDomains.includes(domainBase.toLowerCase())) {
            const normalizedDomain = normalizeForMatch(domainBase);
            for (const company of allCompanies) {
              const nLegal = normalizeForMatch(company.legal_name);
              const nTrading = company.trading_name ? normalizeForMatch(company.trading_name) : "";
              if (nLegal.includes(normalizedDomain) || normalizedDomain.includes(nLegal) ||
                  (nTrading && (nTrading.includes(normalizedDomain) || normalizedDomain.includes(nTrading)))) {
                matchedCompanyId = company.id;
                break;
              }
            }
          }

          if (!matchedCompanyId && associatedCompany) {
            const normalizedAssoc = normalizeForMatch(associatedCompany);
            for (const company of allCompanies) {
              const nLegal = normalizeForMatch(company.legal_name);
              const nTrading = company.trading_name ? normalizeForMatch(company.trading_name) : "";
              if (nLegal === normalizedAssoc || nTrading === normalizedAssoc) {
                matchedCompanyId = company.id;
                break;
              }
            }
          }

          if (matchedCompanyId) {
            try {
              await pool.query(
                `INSERT INTO contacts (company_id, first_name, last_name, email, phone) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                [matchedCompanyId, firstName || email.split("@")[0], lastName || "", email, phone || null]
              );
              imported++;
              existingEmails.add(email.toLowerCase());
            } catch (err: any) {
              // skip individual errors
            }
          }
        }
        console.log(`Imported ${imported} contacts from HubSpot CSV`);
      } else {
        console.log("HubSpot CSV not found, skipping contact import");
      }
    }
  } catch (error) {
    console.error("Contact import error:", error);
  }

  // Seed database with sample data
  try {
    await seedDatabase();
  } catch (error) {
    console.error("Failed to seed database:", error);
  }

  // Import Puradown variant prices from CSV
  try {
    await importPuradownPrices();
  } catch (error) {
    console.error("Puradown price import error:", error);
  }

  // Seed price lists from CSV files
  try {
    await seedPriceLists();
  } catch (error) {
    console.error("Price list seeding error:", error);
  }

  console.log("All startup tasks completed");
}

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      const redirectUri = "https://puraxfeatherholdingscrm.replit.app/api/outlook/callback";
      startAutoEmailSync(redirectUri, 5);
      startInactivityChecker(redirectUri);
      startAutoXeroInvoiceSync(15);

      // Run all startup database tasks in the background after port is open
      runStartupTasks().catch(err => console.error("Startup tasks error:", err));
    },
  );
})();
