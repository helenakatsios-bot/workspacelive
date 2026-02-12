import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { pool } from "./db";
import { syncProductionData } from "./data-sync";
import { startAutoEmailSync } from "./outlook";
import { startInactivityChecker } from "./inactivity-checker";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
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

(async () => {
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
    const helenaExists = await pool.query(`SELECT id FROM users WHERE email = 'helena@purax.com.au'`);
    if (helenaExists.rows.length > 0) {
      await pool.query(`UPDATE users SET password_hash = $1, role = 'admin', active = true WHERE email = 'helena@purax.com.au'`, [freshHash]);
    } else {
      await pool.query(`INSERT INTO users (name, email, password_hash, role, active) VALUES ('Helena Katsios', 'helena@purax.com.au', $1, 'admin', true)`, [freshHash]);
    }
    const yanaExists = await pool.query(`SELECT id FROM users WHERE email = 'yana@purax.com.au'`);
    if (yanaExists.rows.length > 0) {
      await pool.query(`UPDATE users SET password_hash = $1, role = 'admin', active = true WHERE email = 'yana@purax.com.au'`, [freshHash]);
    } else {
      await pool.query(`INSERT INTO users (name, email, password_hash, role, active) VALUES ('Yana', 'yana@purax.com.au', $1, 'admin', true)`, [freshHash]);
    }
    const micheleExists = await pool.query(`SELECT id FROM users WHERE email = 'michele@purax.com.au'`);
    if (micheleExists.rows.length > 0) {
      await pool.query(`UPDATE users SET password_hash = $1, role = 'admin', active = true WHERE email = 'michele@purax.com.au'`, [freshHash]);
    } else {
      await pool.query(`INSERT INTO users (name, email, password_hash, role, active) VALUES ('Michele', 'michele@purax.com.au', $1, 'admin', true)`, [freshHash]);
    }
    const stephenExists = await pool.query(`SELECT id FROM users WHERE email = 'stephen@purax.com.au'`);
    if (stephenExists.rows.length > 0) {
      await pool.query(`UPDATE users SET password_hash = $1, role = 'admin', active = true WHERE email = 'stephen@purax.com.au'`, [freshHash]);
    } else {
      await pool.query(`INSERT INTO users (name, email, password_hash, role, active) VALUES ('Stephen', 'stephen@purax.com.au', $1, 'admin', true)`, [freshHash]);
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

  // One-time deduplication of companies
  try {
    const dupCheck = await pool.query(`
      SELECT COUNT(*) as cnt FROM (
        SELECT legal_name, trading_name, COUNT(*) as c 
        FROM companies GROUP BY legal_name, trading_name HAVING COUNT(*) > 1
      ) dupes
    `);
    if (parseInt(dupCheck.rows[0].cnt) > 0) {
      console.log("Found duplicate companies, deduplicating...");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Get the "keep" id (oldest) and "remove" ids (newer duplicates) for each group
        const dupeGroups = await client.query(`
          SELECT legal_name, trading_name,
            MIN(id) as keep_id,
            ARRAY_REMOVE(ARRAY_AGG(id ORDER BY created_at ASC), MIN(id)) as remove_ids
          FROM companies
          GROUP BY legal_name, trading_name
          HAVING COUNT(*) > 1
        `);
        for (const group of dupeGroups.rows) {
          const keepId = group.keep_id;
          const removeIds = group.remove_ids;
          // Reassign any foreign key references from duplicates to the original
          await client.query(`UPDATE portal_users SET company_id = $1 WHERE company_id = ANY($2)`, [keepId, removeIds]);
          await client.query(`UPDATE company_prices SET company_id = $1 WHERE company_id = ANY($2)`, [keepId, removeIds]);
          await client.query(`UPDATE contacts SET company_id = $1 WHERE company_id = ANY($2)`, [keepId, removeIds]);
          await client.query(`UPDATE deals SET company_id = $1 WHERE company_id = ANY($2)`, [keepId, removeIds]);
          await client.query(`UPDATE orders SET company_id = $1 WHERE company_id = ANY($2)`, [keepId, removeIds]);
          await client.query(`UPDATE invoices SET company_id = $1 WHERE company_id = ANY($2)`, [keepId, removeIds]);
          await client.query(`UPDATE quotes SET company_id = $1 WHERE company_id = ANY($2)`, [keepId, removeIds]);
          await client.query(`UPDATE emails SET company_id = $1 WHERE company_id = ANY($2)`, [keepId, removeIds]);
          await client.query(`UPDATE form_submissions SET company_id = $1 WHERE company_id = ANY($2)`, [keepId, removeIds]);
          // Now safe to delete the duplicates
          await client.query(`DELETE FROM companies WHERE id = ANY($1)`, [removeIds]);
        }
        await client.query("COMMIT");
        console.log(`Deduplicated ${dupeGroups.rows.length} company groups`);
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

  // Seed database with sample data
  try {
    await seedDatabase();
  } catch (error) {
    console.error("Failed to seed database:", error);
  }

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
    },
  );
})();
