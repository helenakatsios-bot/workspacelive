import express, { type Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { pool } from "./db";
import { syncProductionData } from "./data-sync";
import { startAutoEmailSync, backfillEmailCompanyLinks } from "./outlook";
import { startInactivityChecker } from "./inactivity-checker";
import { startAutoXeroInvoiceSync } from "./xero";
import { importPuradownPrices } from "./import-puradown-prices";
import { seedPriceLists } from "./seed-price-lists";
import { importStandardPriceList } from "./import-standard-pricelist";
import { importInteriorsPriceList } from "./import-interiors-pricelist";
import { importPoulosPriceList } from "./import-poulos-pricelist";
import { importFrontlinePriceList } from "./import-frontline-pricelist";
import { importHotelLuxuryPriceList } from "./import-hotelluxury-pricelist";
import { importBedroomPriceList } from "./import-bedroom-pricelist";
import { importSageClairePriceList } from "./import-sageclaire-pricelist";
import { importLMPriceList } from "./import-lm-pricelist";
import { importSpaceCraftPriceList } from "./import-spacecraft-pricelist";
import { importWalterGPriceList } from "./import-walterg-pricelist";
import { importCastlePriceList } from "./import-castle-pricelist";
import { importAllPriceLists } from "./import-all-price-lists";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: Buffer;
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

  // Remove duplicate price lists (same name created by concurrent imports) — keep the one with most prices
  try {
    const dupNames = await pool.query(
      `SELECT name FROM price_lists GROUP BY name HAVING COUNT(*) > 1`
    );
    for (const { name } of dupNames.rows) {
      const lists = await pool.query(
        `SELECT pl.id, COUNT(plp.id) as cnt
         FROM price_lists pl
         LEFT JOIN price_list_prices plp ON plp.price_list_id = pl.id
         WHERE pl.name = $1
         GROUP BY pl.id
         ORDER BY COUNT(plp.id) DESC, pl.created_at ASC`,
        [name]
      );
      const toDelete = lists.rows.slice(1).map((r: any) => r.id);
      for (const id of toDelete) {
        await pool.query(`DELETE FROM price_lists WHERE id = $1`, [id]);
        console.log(`Dedup: removed extra price list "${name}" id=${id}`);
      }
    }
  } catch (error) {
    console.error("Price list dedup error:", error);
  }

  // One-time cleanup: remove old pre-imported price lists that are now superseded
  try {
    // Exact name cleanup only — do NOT use case-insensitive match to avoid deleting correctly-named lists
    const oldNames = [
      "EXTRA FIRM FILL AS FIRM PRICE",
      "EXTRA FIRM FILL AS FIRM PRICE ",
      "HOTEL LUXURY HUNGARIAN PILLOW",
      "JENNIFER BUTTON",
      "L&M",
      "eco down under",
      "eco down under ",
    ];
    for (const pattern of oldNames) {
      const found = await pool.query(
        "SELECT id, name FROM price_lists WHERE name = $1",
        [pattern]
      );
      for (const row of found.rows) {
        await pool.query("UPDATE companies SET price_list_id = NULL WHERE price_list_id = $1", [row.id]);
        await pool.query("DELETE FROM price_list_prices WHERE price_list_id = $1", [row.id]);
        await pool.query("DELETE FROM price_lists WHERE id = $1", [row.id]);
        console.log(`Removed old price list: "${row.name}"`);
      }
    }
  } catch (error) {
    console.error("Old price list cleanup error:", error);
  }

  // Purge products with SKU-like category names (corrupt data from bad Poulos import)
  // Bad categories: starts with "MW" or "HLC", or equals "INSERT" or "PILLOW" (without S)
  try {
    const badCatCheck = await pool.query(`
      SELECT COUNT(*) as bad FROM products
      WHERE category ~ '^MW' OR category ~ '^HLC' OR category = 'INSERT' OR category = 'PILLOW'
    `);
    const badCount = parseInt(badCatCheck.rows[0].bad);
    if (badCount > 0) {
      console.log(`Poulos cleanup: found ${badCount} products with corrupt category names — purging`);
      // Remove all price_list_prices that reference these bad products
      await pool.query(`
        DELETE FROM price_list_prices WHERE product_id IN (
          SELECT id FROM products
          WHERE category ~ '^MW' OR category ~ '^HLC' OR category = 'INSERT' OR category = 'PILLOW'
        )
      `);
      // Remove the bad products themselves
      const del = await pool.query(`
        DELETE FROM products
        WHERE category ~ '^MW' OR category ~ '^HLC' OR category = 'INSERT' OR category = 'PILLOW'
        RETURNING id
      `);
      console.log(`Poulos cleanup: deleted ${del.rowCount} products — Poulos will be re-imported from CSV`);
    } else {
      console.log("Poulos cleanup: no corrupt products found");
    }
  } catch (error) {
    console.error("Poulos cleanup error:", error);
  }

  // Fix CUSTINNERS-25 SKU conflict: if 40x100cm still holds that SKU and 39x79cm doesn't exist,
  // free the slot and clear Custom Inserts prices so the import below creates 39x79cm correctly.
  try {
    const conflict = await pool.query(
      `SELECT 1 FROM products WHERE sku = 'CUSTINNERS - 25' AND name = '40 x 100cm duck feather' LIMIT 1`
    );
    const missing = await pool.query(
      `SELECT 1 FROM products WHERE name = '39 x 79cm duck feather' LIMIT 1`
    );
    if (conflict.rows.length > 0 && missing.rows.length === 0) {
      await pool.query(`UPDATE products SET sku = 'CUSTINNERS - 25B' WHERE sku = 'CUSTINNERS - 25' AND name = '40 x 100cm duck feather'`);
      await pool.query(`DELETE FROM price_list_prices WHERE price_list_id = (SELECT id FROM price_lists WHERE name = 'Custom Inserts')`);
      console.log("Fixed CUSTINNERS-25 SKU conflict; Custom Inserts will re-import with 39 x 79cm");
    }
  } catch (err: any) {
    console.error("CUSTINNERS-25 fix error:", err.message);
  }

  // Import all 18 price lists from CSV files (idempotent - skips if already imported)
  try {
    await importAllPriceLists();
  } catch (error) {
    console.error("Price list import error:", error);
  }

  // Product sync disabled - user managing products manually
  // try {
  //   await syncProductionData();
  // } catch (error) {
  //   console.error("Data sync error:", error);
  // }

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

  // ONE-TIME PRICE WIPE (March 2026) — clears all price_list_prices so admin can re-upload clean data
  try {
    const wipeFlag = await pool.query(`SELECT value FROM crm_settings WHERE key = 'prices_wiped_2026_03_05' LIMIT 1`);
    if (wipeFlag.rows.length === 0) {
      const wipeResult = await pool.query(`DELETE FROM price_list_prices`);
      await pool.query(`INSERT INTO crm_settings (key, value) VALUES ('prices_wiped_2026_03_05', 'true') ON CONFLICT (key) DO NOTHING`);
      console.log(`[PRICE-WIPE] Wiped ${wipeResult.rowCount} price entries. Price lists are now empty for manual re-upload.`);
    }
  } catch (err: any) {
    console.error("[PRICE-WIPE] Error:", err.message);
  }

  // ONE-TIME PRODUCT WIPE (March 2026) — clears all products so admin can re-upload a clean catalog
  try {
    const prodWipeFlag = await pool.query(`SELECT value FROM crm_settings WHERE key = 'products_wiped_2026_03_05' LIMIT 1`);
    if (prodWipeFlag.rows.length === 0) {
      // NULL out product references in order_lines and quote_lines (no ON DELETE CASCADE)
      await pool.query(`UPDATE order_lines SET product_id = NULL WHERE product_id IS NOT NULL`);
      await pool.query(`UPDATE quote_lines SET product_id = NULL WHERE product_id IS NOT NULL`);
      // Delete all products (cascades to price_list_prices, company_prices, variant_prices)
      const prodResult = await pool.query(`DELETE FROM products`);
      await pool.query(`INSERT INTO crm_settings (key, value) VALUES ('products_wiped_2026_03_05', 'true') ON CONFLICT (key) DO NOTHING`);
      console.log(`[PRODUCT-WIPE] Wiped ${prodResult.rowCount} products. Products table is now empty for manual re-upload.`);
    }
  } catch (err: any) {
    console.error("[PRODUCT-WIPE] Error:", err.message);
  }

  // CSV auto-imports removed — prices are managed manually via admin UI
  const otherImports: { name: string; fn: () => Promise<void> }[] = [];
  for (const { name, fn } of otherImports) {
    try {
      await fn();
    } catch (error) {
      console.error(`${name} price list import error:`, error);
    }
  }

  try {
    const luxeResult = await pool.query("SELECT id FROM companies WHERE LOWER(legal_name) = 'luxe bedding' LIMIT 1");
    const vinodResult = await pool.query("SELECT id FROM companies WHERE LOWER(legal_name) = 'vinod' LIMIT 1");
    if (luxeResult.rows.length > 0 && vinodResult.rows.length > 0) {
      const luxeId = luxeResult.rows[0].id;
      const vinodId = vinodResult.rows[0].id;
      const orderCheck = await pool.query("SELECT COUNT(*) as cnt FROM orders WHERE company_id = $1", [luxeId]);
      if (parseInt(orderCheck.rows[0].cnt) > 0) {
        await pool.query("UPDATE orders SET company_id = $1 WHERE company_id = $2", [vinodId, luxeId]);
        await pool.query("UPDATE invoices SET company_id = $1 WHERE company_id = $2", [vinodId, luxeId]);
        await pool.query("UPDATE emails SET company_id = $1 WHERE company_id = $2", [vinodId, luxeId]);
        console.log("Merged luxe bedding records into VINOD");
      }
    }
  } catch (error) {
    console.error("Luxe bedding merge error:", error);
  }

  try {
    const excludeLists = ['Sage & Claire', 'L&M', 'Space Craft', 'Walter G'];
    const priceUpdates = [
      { filling: '100% Feather', weight: 'Normal', oldPrice: '12.00', newPrice: '12.65' },
      { filling: '100% Feather', weight: 'Firm Fill', oldPrice: '12.60', newPrice: '13.25' },
      { filling: '100% Feather', weight: 'Extra Firm Fill', oldPrice: '13.20', newPrice: '13.85' },
    ];
    for (const u of priceUpdates) {
      await pool.query(
        `UPDATE price_list_prices plp SET unit_price = $1, updated_at = NOW()
         FROM products p, price_lists pl
         WHERE plp.product_id = p.id AND plp.price_list_id = pl.id
         AND p.name = '55X55CM' AND plp.filling = $2 AND plp.weight = $3
         AND plp.unit_price = $4 AND pl.name != ALL($5)`,
        [u.newPrice, u.filling, u.weight, u.oldPrice, excludeLists]
      );
    }
  } catch (error) {
    console.error("55x55 price update error:", error);
  }

  try {
    const batchId = 'ad75ca3b-98cf-4552-9c7e-3b187b63b926';
    const harveyId = '6c26b605-8d6d-44c9-8e40-7a917c7fd572';
    const emailCheck = await pool.query("SELECT COUNT(*) as cnt FROM emails WHERE company_id = $1", [batchId]);
    if (parseInt(emailCheck.rows[0].cnt) > 0) {
      await pool.query("UPDATE orders SET company_id = $1 WHERE company_id = $2", [harveyId, batchId]);
      await pool.query("UPDATE invoices SET company_id = $1 WHERE company_id = $2", [harveyId, batchId]);
      await pool.query("UPDATE emails SET company_id = $1 WHERE company_id = $2", [harveyId, batchId]);
      console.log("Merged BATCH records into CHARMELA/HARVEY NORMAN");
    }
  } catch (error) {
    console.error("BATCH merge error:", error);
  }

  // Normalize product categories: merge SILVER/KHAKI BLANKET into BLANKETS, rename JACKETS category
  try {
    const blanketFix = await pool.query("UPDATE products SET category = 'BLANKETS' WHERE category IN ('SILVER BLANKET', 'KHAKI BLANKET', 'BLANKET')");
    if (blanketFix.rowCount && blanketFix.rowCount > 0) {
      console.log(`Normalized ${blanketFix.rowCount} blanket products into BLANKETS category`);
    }
    const quiltFix = await pool.query("UPDATE products SET category = 'HUNGARIAN WINTER STRIP' WHERE category IN ('STRIPPED QUILT', 'HUNGARIAN')");
    if (quiltFix.rowCount && quiltFix.rowCount > 0) {
      console.log(`Renamed ${quiltFix.rowCount} products to HUNGARIAN WINTER STRIP`);
    }
    await pool.query("UPDATE products SET category = 'HUNGARIAN ALL SEASONS' WHERE category IN ('HUNGARIAN LIGHT FILL', 'HUNGARIAN LIGHT')");
    const stripFix = await pool.query("UPDATE products SET category = 'HUNGARIAN PILLOW' WHERE category = 'STRIP PILLOW'");
    if (stripFix.rowCount && stripFix.rowCount > 0) {
      console.log(`Renamed ${stripFix.rowCount} STRIP PILLOW products to HUNGARIAN PILLOW`);
    }
    const quiltNameFix = await pool.query("UPDATE products SET name = REPLACE(name, ' - HUNGARIAN STRIPPED QUILT', ' - HUNGARIAN') WHERE name LIKE '% - HUNGARIAN STRIPPED QUILT'");
    if (quiltNameFix.rowCount && quiltNameFix.rowCount > 0) {
      console.log(`Updated ${quiltNameFix.rowCount} product names from HUNGARIAN STRIPPED QUILT to HUNGARIAN`);
    }
    // Product auto-creation removed — managed via manual price upload
    // Normalize dimension-based product names to proper size names
    const nameUpdates: [string, string][] = [
      // PIPED PILLOWS: dimension → size
      ['45X70CM - PIPED PILLOWS', 'STANDARD - PIPED PILLOWS'],
      ['50X80CM - PIPED PILLOWS', 'QUEEN - PIPED PILLOWS'],
      ['50X90CM - PIPED PILLOWS', 'KING - PIPED PILLOWS'],
      ['65 X 65CM - PIPED PILLOWS', 'EURO - PIPED PILLOWS'],
      // CHAMBER PILLOW: dimension → proper name
      ['45X70CM 80 - CHAMBER PILLOW', 'STANDARD PILLOW - 80 DUCK DOWN CHAMBER PILLOW'],
      ['45X70CM 50 - CHAMBER PILLOW', 'STANDARD PILLOW - 50 DUCK DOWN CHAMBER PILLOW'],
      ['50X90CM 80 - CHAMBER PILLOW', 'KING PILLOW - 80 DUCK DOWN CHAMBER PILLOW'],
      ['50X90CM 50 - CHAMBER PILLOW', 'KING PILLOW - 50 DUCK DOWN CHAMBER PILLOW'],
      ['45X70CM - (48X73CM) 80 - CHAMBER PILLOW', 'STANDARD PILLOW - 80 DUCK DOWN CHAMBER PILLOW'],
      ['45X70CM - (48X73CM) 50 - CHAMBER PILLOW', 'STANDARD PILLOW - 50 DUCK DOWN CHAMBER PILLOW'],
      ['50X90CM - (53X93CM) 80 - CHAMBER PILLOW', 'KING PILLOW - 80 DUCK DOWN CHAMBER PILLOW'],
      ['50X90CM - (53X93CM) 50 - CHAMBER PILLOW', 'KING PILLOW - 50 DUCK DOWN CHAMBER PILLOW'],
      // STRIP PILLOW / HUNGARIAN PILLOW: dimension → proper name
      ['45X70CM - STRIP PILLOW', 'STANDARD PILLOW - 80% HUNGARIAN PILLOW'],
      ['50X90CM - STRIP PILLOW', 'KING PILLOW - 80% HUNGARIAN PILLOW'],
      ['45X70CM - HUNGARIAN PILLOW', 'STANDARD PILLOW - 80% HUNGARIAN PILLOW'],
      ['50X90CM - HUNGARIAN PILLOW', 'KING PILLOW - 80% HUNGARIAN PILLOW'],
      // MATTRESS TOPPER FILLED: strip dimensions
      ['DOUBLE 184X214CM - MATTRESS TOPPER FILLED', 'DOUBLE - MATTRESS TOPPER FILLED'],
      ['SINGLE 140X214CM - MATTRESS TOPPER FILLED', 'SINGLE - MATTRESS TOPPER FILLED'],
      // MICROSOFT: strip dimensions
      ['DOUBLE 184X214CM - MICROSOFT', 'DOUBLE - MICROSOFT'],
      ['KING 244X214CM - MICROSOFT', 'KING - MICROSOFT'],
      ['QUEEN 214X214CM - MICROSOFT', 'QUEEN - MICROSOFT'],
      ['SINGLE 140X214CM - MICROSOFT', 'SINGLE - MICROSOFT'],
    ];
    let nameFixCount = 0;
    for (const [oldName, newName] of nameUpdates) {
      const result = await pool.query("UPDATE products SET name = $1 WHERE name = $2", [newName, oldName]);
      if (result.rowCount && result.rowCount > 0) nameFixCount += result.rowCount;
    }
    if (nameFixCount > 0) {
      console.log(`Normalized ${nameFixCount} dimension-based product names to proper size names`);
    }

    // Ensure Silver Blanket products exist in every price list that has Khaki Blankets
    const khakiResult = await pool.query(`
      SELECT plp.price_list_id, p.id as khaki_product_id, p.name as khaki_name, plp.unit_price
      FROM price_list_prices plp
      JOIN products p ON p.id = plp.product_id
      WHERE plp.filling = 'Khaki Blanket' AND p.category = 'BLANKETS'
    `);
    let silverAdded = 0;
    for (const row of khakiResult.rows) {
      const silverName = (row.khaki_name as string).replace('KHAKI BLANKET', 'SILVER BLANKET');
      // Check if Silver already exists in this price list (by name match via product)
      const existsResult = await pool.query(`
        SELECT plp.id FROM price_list_prices plp
        JOIN products p ON p.id = plp.product_id
        WHERE plp.price_list_id = $1 AND plp.filling = 'Silver Blanket'
        AND p.name = $2 AND p.category = 'BLANKETS'
      `, [row.price_list_id, silverName]);
      if (existsResult.rows.length > 0) continue;
      // Find or create the Silver product
      let silverProductId: string | null = null;
      const findProduct = await pool.query(
        `SELECT id FROM products WHERE name = $1 AND category = 'BLANKETS'`,
        [silverName]
      );
      if (findProduct.rows.length > 0) {
        silverProductId = findProduct.rows[0].id;
      } else {
        // Create the Silver product with a unique SKU
        const skuMax = await pool.query(`
          SELECT COALESCE(MAX(CAST(SUBSTRING(sku FROM 4) AS INTEGER)), 456) as maxnum
          FROM products WHERE sku ~ '^PFH[0-9]+$'
        `);
        const newSku = `PFH${(skuMax.rows[0].maxnum as number) + 1}`;
        const createResult = await pool.query(
          `INSERT INTO products (name, sku, category, unit_price, active)
           VALUES ($1, $2, 'BLANKETS', $3, true)
           ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [silverName, newSku, row.unit_price]
        );
        silverProductId = createResult.rows[0]?.id || null;
      }
      if (silverProductId) {
        await pool.query(
          `INSERT INTO price_list_prices (price_list_id, product_id, filling, weight, unit_price)
           VALUES ($1, $2, 'Silver Blanket', '', $3)
           ON CONFLICT DO NOTHING`,
          [row.price_list_id, silverProductId, row.unit_price]
        );
        silverAdded++;
      }
    }
    if (silverAdded > 0) console.log(`Silver Blanket: added ${silverAdded} missing variants across price lists`);

    console.log("Category normalization complete");
  } catch (error) {
    console.error("Category normalization error:", error);
  }

  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS portal_categories text[]`);
    await pool.query(`ALTER TABLE attachments ADD COLUMN IF NOT EXISTS file_data bytea`);
    await pool.query(`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS recurring_items JSONB`);
    await pool.query(`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE customer_order_requests ADD COLUMN IF NOT EXISTS shopify_order_id text`);
    await pool.query(`ALTER TABLE customer_order_requests ADD COLUMN IF NOT EXISTS shopify_order_number text`);
    await pool.query(`ALTER TABLE customer_order_requests ADD COLUMN IF NOT EXISTS payment_status text`);
    await pool.query(`ALTER TABLE customer_order_requests ADD COLUMN IF NOT EXISTS subtotal text`);
    await pool.query(`ALTER TABLE customer_order_requests ADD COLUMN IF NOT EXISTS total_amount text`);
    const interiorsResult = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) = 'interiors' LIMIT 1`);
    if (interiorsResult.rows.length > 0) {
      const interiorsId = interiorsResult.rows[0].id;
      await pool.query(
        `UPDATE companies SET portal_categories = $1, price_list_id = COALESCE(price_list_id, $2)
         WHERE (LOWER(legal_name) = 'dyne' OR LOWER(legal_name) LIKE 'dyne manu%')
         AND (portal_categories IS NULL OR portal_categories = '{}')`,
        [['CASES'], interiorsId]
      );
    }
  } catch (error) {
    console.error("Portal categories column error:", error);
  }

  // Create portal users for all companies that don't have one
  try {
    const bcrypt = await import("bcryptjs");
    const allCompanies = await pool.query(`SELECT id, legal_name, trading_name FROM companies`);
    const existingPortal = await pool.query(`SELECT DISTINCT company_id FROM portal_users`);
    const existingIds = new Set(existingPortal.rows.map((r: any) => r.company_id));
    const missing = allCompanies.rows.filter((c: any) => !existingIds.has(c.id));
    if (missing.length > 0) {
      const defaultHash = await bcrypt.default.hash('purax2026', 10);
      let created = 0;
      for (const company of missing) {
        const name = company.trading_name || company.legal_name;
        const emailBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
        const email = emailBase + '@portal.purax.com.au';
        const emailCheck = await pool.query('SELECT id FROM portal_users WHERE email = $1', [email]);
        if (emailCheck.rows.length > 0) continue;
        await pool.query(
          'INSERT INTO portal_users (id, company_id, name, email, password_hash, active, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, true, NOW())',
          [company.id, name, email, defaultHash]
        );
        created++;
      }
      console.log(`Created ${created} portal users for companies without accounts`);
    } else {
      console.log("All companies already have portal users");
    }
  } catch (error) {
    console.error("Bulk portal user creation error:", error);
  }

  try {
    console.log("Running email-to-company backfill...");
    const emailsUpdated = await backfillEmailCompanyLinks();
    console.log(`Email backfill complete: ${emailsUpdated} emails linked to companies`);
  } catch (error) {
    console.error("Email backfill error:", error);
  }

  // Ensure company_additional_price_lists table exists with unique constraint
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS company_additional_price_lists (
      id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id varchar(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      price_list_id varchar(36) NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
      created_at timestamp NOT NULL DEFAULT NOW()
    )`);
    // Add unique constraint if missing (handles tables created before constraint was defined)
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'capl_company_pricelist_unique'
          AND conrelid = 'company_additional_price_lists'::regclass
        ) THEN
          ALTER TABLE company_additional_price_lists
          ADD CONSTRAINT capl_company_pricelist_unique UNIQUE (company_id, price_list_id);
        END IF;
      END $$;
    `);
  } catch (err: any) {
    console.error("company_additional_price_lists table error:", err.message);
  }

  // Fix 50X110CM 100% Feather prices in 5 price lists (Normal=$50, Firm Fill=$50.60, Extra Firm Fill=$51.80)
  try {
    const targetLists = await pool.query(`
      SELECT id FROM price_lists WHERE name IN ('Standard', 'Interiors', 'Poulos', 'Frontline', 'Hotel Luxury Collection')
    `);
    if (targetLists.rows.length > 0) {
      const targetIds = targetLists.rows.map((r: any) => r.id);
      const corrections = [
        { weight: 'Normal',          price: '50.00' },
        { weight: 'Firm Fill',       price: '50.60' },
        { weight: 'Extra Firm Fill', price: '51.80' },
      ];
      let fixCount = 0;
      for (const { weight, price } of corrections) {
        const res = await pool.query(`
          UPDATE price_list_prices plp
          SET unit_price = $1, updated_at = NOW()
          FROM products p
          WHERE plp.product_id = p.id
            AND p.name ILIKE '%50%110%'
            AND p.category ILIKE '%insert%'
            AND plp.filling ILIKE '%100% feather%'
            AND plp.weight = $2
            AND plp.price_list_id = ANY($3::varchar[])
            AND plp.unit_price != $1
        `, [price, weight, targetIds]);
        if (res.rowCount && res.rowCount > 0) fixCount += res.rowCount;
      }
      if (fixCount > 0) console.log(`Fixed ${fixCount} 50X110CM 100% Feather price entries across 5 price lists`);
    }
  } catch (err: any) {
    console.error("50X110CM price fix error:", err.message);
  }

  // Fix 50X110CM prices across ALL fillings in 6 price lists (Standard, Interiors, Poulos, Frontline, Hotel Luxury Collection, Dyne)
  try {
    const targetLists2 = await pool.query(`
      SELECT id FROM price_lists WHERE name IN ('Standard', 'Interiors', 'Poulos', 'Frontline', 'Hotel Luxury Collection', 'Dyne')
    `);
    if (targetLists2.rows.length > 0) {
      const targetIds2 = targetLists2.rows.map((r: any) => r.id);
      const allCorrections = [
        { filling: '100% Feather',         weight: 'Normal',          price: '50.00'  },
        { filling: '100% Feather',         weight: 'Firm Fill',       price: '50.60'  },
        { filling: '100% Feather',         weight: 'Extra Firm Fill', price: '51.80'  },
        { filling: 'Duck Feather - Foam',  weight: 'Normal',          price: '50.00'  },
        { filling: 'Duck Feather - Foam',  weight: 'Firm Fill',       price: '50.60'  },
        { filling: 'Duck Feather - Foam',  weight: 'Extra Firm Fill', price: '51.20'  },
        { filling: 'Duck Feather - Fibre', weight: 'Normal',          price: '50.00'  },
        { filling: 'Duck Feather - Fibre', weight: 'Firm Fill',       price: '50.60'  },
        { filling: 'Duck Feather - Fibre', weight: 'Extra Firm Fill', price: '51.20'  },
        { filling: '100% Polyester',       weight: 'Normal',          price: '46.00'  },
        { filling: '100% Polyester',       weight: 'Firm Fill',       price: '46.60'  },
        { filling: '100% Polyester',       weight: 'Extra Firm Fill', price: '47.20'  },
        { filling: '30% Down 70% Feather', weight: 'Normal',          price: '95.00'  },
        { filling: '30% Down 70% Feather', weight: 'Firm Fill',       price: '96.00'  },
        { filling: '30% Down 70% Feather', weight: 'Extra Firm Fill', price: '96.60'  },
        { filling: '50% Down 50% Feather', weight: 'Normal',          price: '113.25' },
        { filling: '50% Down 50% Feather', weight: 'Firm Fill',       price: '114.25' },
        { filling: '50% Down 50% Feather', weight: 'Extra Firm Fill', price: '114.85' },
        { filling: '80% Down 20% Feather', weight: 'Normal',          price: '136.25' },
        { filling: '80% Down 20% Feather', weight: 'Firm Fill',       price: '137.25' },
        { filling: '80% Down 20% Feather', weight: 'Extra Firm Fill', price: '137.85' },
      ];
      let fixCount2 = 0;
      for (const { filling, weight, price } of allCorrections) {
        const res = await pool.query(`
          UPDATE price_list_prices plp
          SET unit_price = $1, updated_at = NOW()
          FROM products p
          WHERE plp.product_id = p.id
            AND p.name ILIKE '%50%110%'
            AND p.category ILIKE '%insert%'
            AND plp.filling = $2
            AND plp.weight = $3
            AND plp.price_list_id = ANY($4::varchar[])
            AND plp.unit_price != $1
        `, [price, filling, weight, targetIds2]);
        if (res.rowCount && res.rowCount > 0) fixCount2 += res.rowCount;
      }
      if (fixCount2 > 0) console.log(`Fixed ${fixCount2} 50X110CM price entries across all fillings and 6 price lists`);
      else console.log(`50X110CM prices already correct across all 6 price lists`);
    }
  } catch (err: any) {
    console.error("50X110CM full price fix error:", err.message);
  }

  // Fix 35X80CM duck feather custom insert prices (corrected to 17.65/18.25/18.85)
  try {
    const custInsertsPl = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) ILIKE '%custom insert%' LIMIT 1`);
    if (custInsertsPl.rows.length > 0) {
      const plId = custInsertsPl.rows[0].id;
      const fixes = [
        { weight: "Normal", price: "17.65" },
        { weight: "Firm Fill", price: "18.25" },
        { weight: "Extra Firm Fill", price: "18.85" },
      ];
      let fixCount = 0;
      for (const { weight, price } of fixes) {
        const r = await pool.query(
          `UPDATE price_list_prices SET unit_price = $1 WHERE price_list_id = $2 AND sku = 'CUSTINNERS - 19' AND weight = $3 AND unit_price != $1`,
          [price, plId, weight]
        );
        fixCount += r.rowCount ?? 0;
      }
      if (fixCount > 0) console.log(`Fixed ${fixCount} 35X80CM custom insert price entries`);
      else console.log(`35X80CM custom insert prices already correct`);
    }
  } catch (err: any) {
    console.error("35X80CM price fix error:", err.message);
  }

  // COMER & KING: assign Interiors as main price list, COMER & KING list as additional
  try {
    const comerKingComp = await pool.query(`SELECT id FROM companies WHERE trading_name ILIKE '%COMER%KING%' OR legal_name ILIKE '%COMER%KING%' LIMIT 1`);
    const interiorsPlResult = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) = 'interiors' LIMIT 1`);
    const comerKingPlResult = await pool.query(`SELECT id FROM price_lists WHERE name ILIKE 'COMER%KING' OR name ILIKE 'COMER & KING' LIMIT 1`);
    if (comerKingComp.rows.length > 0 && interiorsPlResult.rows.length > 0) {
      const compId = comerKingComp.rows[0].id;
      const interiorsId = interiorsPlResult.rows[0].id;
      await pool.query(`UPDATE companies SET price_list_id = $1 WHERE id = $2 AND (price_list_id IS NULL OR price_list_id != $1)`, [interiorsId, compId]);
      if (comerKingPlResult.rows.length > 0) {
        const ckPlId = comerKingPlResult.rows[0].id;
        const ckExists = await pool.query(`SELECT id FROM company_additional_price_lists WHERE company_id = $1 AND price_list_id = $2`, [compId, ckPlId]);
        if (ckExists.rows.length === 0) {
          await pool.query(`INSERT INTO company_additional_price_lists (company_id, price_list_id) VALUES ($1, $2)`, [compId, ckPlId]);
        }
        console.log(`COMER & KING: main=Interiors, additional=COMER & KING price list`);
      }
    }
  } catch (err: any) {
    console.error("COMER & KING price list assignment error:", err.message);
  }

  // Ensure "100 Plus Inserts" price list exists with 9 correct entries, and is assigned to Decor Lux
  try {
    let hundredPlusId: string | null = null;
    const existingList = await pool.query(`SELECT id FROM price_lists WHERE name = '100 Plus Inserts' LIMIT 1`);
    if (existingList.rows.length === 0) {
      const created = await pool.query(
        `INSERT INTO price_lists (id, name, description, created_at) VALUES (gen_random_uuid(), '100 Plus Inserts', '100 Plus Inserts pricing - minimum order 100 units', NOW()) RETURNING id`
      );
      hundredPlusId = created.rows[0].id;
      console.log(`100 Plus Inserts: created price list with id ${hundredPlusId}`);
    } else {
      hundredPlusId = existingList.rows[0].id;
    }

    // Remove any HIGHGATE INSERTS products from this list
    const removed = await pool.query(
      `DELETE FROM price_list_prices WHERE price_list_id = $1 AND product_id IN (SELECT id FROM products WHERE category = 'HIGHGATE INSERTS')`,
      [hundredPlusId]
    );
    if (removed.rowCount && removed.rowCount > 0) {
      console.log(`100 Plus Inserts: removed ${removed.rowCount} Highgate Insert entries`);
    }

    // Remove old INTERIOR-xx SKU duplicates from this list (replaced by PLUS1-PLUS24)
    const oldRemoved = await pool.query(
      `DELETE FROM price_list_prices WHERE price_list_id = $1 AND product_id IN (SELECT id FROM products WHERE sku ILIKE 'INTERIOR -%')`,
      [hundredPlusId]
    );
    if (oldRemoved.rowCount && oldRemoved.rowCount > 0) {
      console.log(`100 Plus Inserts: removed ${oldRemoved.rowCount} old INTERIOR-xx duplicate entries`);
    }

    // Ensure all 24 standard 100 Plus Inserts prices exist (upsert approach — safe to re-run)
    const hundredPlusItems: Array<{ name: string; sku: string; filling: string; weight: string; price: number }> = [
      { name: '40X40CM', sku: 'PLUS1',  filling: '100% Feather', weight: 'Normal',         price: 8.80 },
      { name: '40X40CM', sku: 'PLUS2',  filling: '100% Feather', weight: 'Firm Fill',       price: 9.40 },
      { name: '40X40CM', sku: 'PLUS3',  filling: '100% Feather', weight: 'Extra Firm Fill', price: 10.00 },
      { name: '45X45CM', sku: 'PLUS4',  filling: '100% Feather', weight: 'Normal',         price: 10.00 },
      { name: '45X45CM', sku: 'PLUS5',  filling: '100% Feather', weight: 'Firm Fill',       price: 10.60 },
      { name: '45X45CM', sku: 'PLUS6',  filling: '100% Feather', weight: 'Extra Firm Fill', price: 11.20 },
      { name: '50X30CM', sku: 'PLUS7',  filling: '100% Feather', weight: 'Normal',         price: 12.80 },
      { name: '50X30CM', sku: 'PLUS8',  filling: '100% Feather', weight: 'Firm Fill',       price: 13.40 },
      { name: '50X30CM', sku: 'PLUS9',  filling: '100% Feather', weight: 'Extra Firm Fill', price: 14.00 },
      { name: '50X50CM', sku: 'PLUS10', filling: '100% Feather', weight: 'Normal',         price: 11.00 },
      { name: '50X50CM', sku: 'PLUS11', filling: '100% Feather', weight: 'Firm Fill',       price: 11.60 },
      { name: '50X50CM', sku: 'PLUS12', filling: '100% Feather', weight: 'Extra Firm Fill', price: 12.20 },
      { name: '55X55CM', sku: 'PLUS13', filling: '100% Feather', weight: 'Normal',         price: 12.00 },
      { name: '55X55CM', sku: 'PLUS14', filling: '100% Feather', weight: 'Firm Fill',       price: 12.60 },
      { name: '55X55CM', sku: 'PLUS15', filling: '100% Feather', weight: 'Extra Firm Fill', price: 13.20 },
      { name: '60X40CM', sku: 'PLUS16', filling: '100% Feather', weight: 'Normal',         price: 15.00 },
      { name: '60X40CM', sku: 'PLUS17', filling: '100% Feather', weight: 'Firm Fill',       price: 15.60 },
      { name: '60X40CM', sku: 'PLUS18', filling: '100% Feather', weight: 'Extra Firm Fill', price: 16.20 },
      { name: '60X60CM', sku: 'PLUS19', filling: '100% Feather', weight: 'Normal',         price: 14.50 },
      { name: '60X60CM', sku: 'PLUS20', filling: '100% Feather', weight: 'Firm Fill',       price: 15.10 },
      { name: '60X60CM', sku: 'PLUS21', filling: '100% Feather', weight: 'Extra Firm Fill', price: 15.70 },
      { name: '65X65CM', sku: 'PLUS22', filling: '100% Feather', weight: 'Normal',         price: 21.00 },
      { name: '65X65CM', sku: 'PLUS23', filling: '100% Feather', weight: 'Firm Fill',       price: 21.60 },
      { name: '65X65CM', sku: 'PLUS24', filling: '100% Feather', weight: 'Extra Firm Fill', price: 22.20 },
    ];
    let hpInserted = 0;
    for (const item of hundredPlusItems) {
      // Find or create product by SKU
      let productId: string | null = null;
      const bySku = await pool.query(`SELECT id FROM products WHERE sku = $1 LIMIT 1`, [item.sku]);
      if (bySku.rows.length > 0) {
        productId = bySku.rows[0].id;
      } else {
        const byName = await pool.query(
          `SELECT id FROM products WHERE UPPER(name) = $1 AND UPPER(COALESCE(category,'')) = '100 PLUS INSERTS' LIMIT 1`,
          [item.name.toUpperCase()]
        );
        if (byName.rows.length > 0) {
          productId = byName.rows[0].id;
        } else {
          const created = await pool.query(
            `INSERT INTO products (id, sku, name, category, unit_price, active) VALUES (gen_random_uuid(), $1, $2, '100 PLUS INSERTS', $3, true) RETURNING id`,
            [item.sku, item.name, item.price.toFixed(2)]
          );
          productId = created.rows[0].id;
        }
      }
      // Upsert price entry
      const existing = await pool.query(
        `SELECT id FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2 AND COALESCE(filling,'') = $3 AND COALESCE(weight,'') = $4`,
        [hundredPlusId, productId, item.filling, item.weight]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO price_list_prices (id, price_list_id, product_id, sku, filling, weight, unit_price) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
          [hundredPlusId, productId, item.sku, item.filling, item.weight, item.price.toFixed(2)]
        );
        hpInserted++;
      }
    }
    if (hpInserted > 0) console.log(`100 Plus Inserts: inserted ${hpInserted} new price entries`);

    // Ensure Decor Lux has Interiors as main price list and "100 Plus Inserts" as an additional list
    const decorLux = await pool.query(`SELECT id, price_list_id FROM companies WHERE trading_name ILIKE '%DECOR LUX%' OR legal_name ILIKE '%DECOR LUX%' LIMIT 1`);
    if (decorLux.rows.length > 0) {
      const dlId = decorLux.rows[0].id;
      // Set main price list to Interiors
      const interiorsResult = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) = 'interiors' LIMIT 1`);
      if (interiorsResult.rows.length > 0) {
        const interiorsId = interiorsResult.rows[0].id;
        if (decorLux.rows[0].price_list_id !== interiorsId) {
          await pool.query(`UPDATE companies SET price_list_id = $1 WHERE id = $2`, [interiorsId, dlId]);
          console.log(`Decor Lux: restored Interiors as main price list`);
        }
        // Ensure "100 Plus Inserts" is an additional price list (not the main)
        const alreadyAdditional = await pool.query(
          `SELECT id FROM company_additional_price_lists WHERE company_id = $1 AND price_list_id = $2`,
          [dlId, hundredPlusId]
        );
        if (alreadyAdditional.rows.length === 0) {
          await pool.query(
            `INSERT INTO company_additional_price_lists (company_id, price_list_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [dlId, hundredPlusId]
          );
          console.log(`Decor Lux: added 100 Plus Inserts as additional price list`);
        }
      }
    }
  } catch (err: any) {
    console.error("100 Plus Inserts setup error:", err.message);
  }

  // GLOBAL RULE: Remove ANY product whose name or category references "HIGHGATE" from every price list except "Highgate Inserts"
  try {
    const highgateList = await pool.query(`SELECT id FROM price_lists WHERE name ILIKE 'highgate inserts' LIMIT 1`);
    const highgateListId: string | null = highgateList.rows[0]?.id || null;

    // Remove by product category (case-insensitive)
    const byCat = await pool.query(
      `DELETE FROM price_list_prices
       WHERE product_id IN (SELECT id FROM products WHERE UPPER(COALESCE(category,'')) LIKE '%HIGHGATE%')
       AND ($1::text IS NULL OR price_list_id::text != $1::text)`,
      [highgateListId]
    );

    // Also remove by product SKU pattern (HG1–HG14)
    const bySku = await pool.query(
      `DELETE FROM price_list_prices
       WHERE product_id IN (SELECT id FROM products WHERE sku ~ '^HG[0-9]+$')
       AND ($1::text IS NULL OR price_list_id::text != $1::text)`,
      [highgateListId]
    );

    const total = (byCat.rowCount || 0) + (bySku.rowCount || 0);
    if (total > 0) {
      console.log(`GLOBAL GUARD: Removed ${total} Highgate entries from non-Highgate price lists (${byCat.rowCount} by category, ${bySku.rowCount} by SKU)`);
    }
  } catch (err: any) {
    console.error("HIGHGATE INSERTS global guard error:", err.message);
  }

  // Ensure Walter G's 4 INSERTS products are in his price list at correct prices + correct category
  try {
    const wgResult = await pool.query(`SELECT id FROM price_lists WHERE name = 'Walter G' LIMIT 1`);
    if (wgResult.rows.length > 0) {
      const wgId = wgResult.rows[0].id;
      const walterGInserts = [
        { sku: 'WALTER19', name: '30X45CM', price: 9.45 },
        { sku: 'WALTER20', name: '35X55CM', price: 10.00 },
        { sku: 'WALTER21', name: '50X50CM', price: 11.00 },
        { sku: 'WALTER22', name: '55X55CM', price: 13.10 },
      ];
      for (const item of walterGInserts) {
        // Find product by SKU
        let prod = await pool.query(`SELECT id, category FROM products WHERE sku = $1 LIMIT 1`, [item.sku]);
        let productId: string;
        if (prod.rows.length > 0) {
          productId = prod.rows[0].id;
          // Fix category if it's "INSERT" instead of "INSERTS"
          if (prod.rows[0].category !== 'INSERTS') {
            await pool.query(`UPDATE products SET category = 'INSERTS' WHERE id = $1`, [productId]);
            console.log(`Walter G: fixed category for ${item.sku} (was ${prod.rows[0].category})`);
          }
        } else {
          // Create the product if it doesn't exist
          const newProd = await pool.query(
            `INSERT INTO products (id, sku, name, category, unit_price, active)
             VALUES (gen_random_uuid(), $1, $2, 'INSERTS', $3, true) RETURNING id`,
            [item.sku, item.name, item.price.toFixed(2)]
          );
          productId = newProd.rows[0].id;
          console.log(`Walter G: created product ${item.sku}`);
        }
        // Add to price list if not already there
        const existing = await pool.query(
          `SELECT id FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2`,
          [wgId, productId]
        );
        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO price_list_prices (id, price_list_id, product_id, filling, unit_price)
             VALUES (gen_random_uuid(), $1, $2, '100% Feather', $3)`,
            [wgId, productId, item.price.toFixed(2)]
          );
          console.log(`Walter G: added ${item.sku} to price list at $${item.price}`);
        }
      }
    }
  } catch (err: any) {
    console.error("Walter G INSERTS migration error:", err.message);
  }

  // Assign Pearls Manchester price list to both Pearls Manchester companies
  try {
    const pearlsPlResult = await pool.query(`SELECT id FROM price_lists WHERE name ILIKE 'pearls manchester' LIMIT 1`);
    if (pearlsPlResult.rows.length > 0) {
      const pearlsPlId = pearlsPlResult.rows[0].id;
      const pearlsComps = await pool.query(`SELECT id FROM companies WHERE trading_name ILIKE '%pearls manchester%' OR legal_name ILIKE '%pearls manchester%'`);
      let assigned = 0;
      for (const comp of pearlsComps.rows) {
        const updated = await pool.query(
          `UPDATE companies SET price_list_id = $1 WHERE id = $2 AND (price_list_id IS NULL OR price_list_id != $1) RETURNING id`,
          [pearlsPlId, comp.id]
        );
        if (updated.rowCount && updated.rowCount > 0) assigned++;
      }
      if (assigned > 0) console.log(`Pearls Manchester: assigned price list to ${assigned} companies`);
    }
  } catch (err: any) {
    console.error("Pearls Manchester price list assignment error:", err.message);
  }

  // Ensure "Custom Inserts" price list exists, then assign it to Standard/Interiors companies
  try {
    let customInsertsResult = await pool.query(`SELECT id FROM price_lists WHERE name ILIKE 'custom inserts' LIMIT 1`);
    if (customInsertsResult.rows.length === 0) {
      console.log("Custom Inserts price list not found — creating it now");
      await pool.query(`INSERT INTO price_lists (id, name, created_at) VALUES (gen_random_uuid(), 'Custom Inserts', NOW())`);
      customInsertsResult = await pool.query(`SELECT id FROM price_lists WHERE name ILIKE 'custom inserts' LIMIT 1`);
      console.log(`Custom Inserts price list created with id ${customInsertsResult.rows[0]?.id}`);
    }
    if (customInsertsResult.rows.length > 0) {
      const customInsertsId = customInsertsResult.rows[0].id;
      // Get all companies whose main price list is Interiors or Standard
      const companiesResult = await pool.query(`
        SELECT c.id FROM companies c
        JOIN price_lists pl ON pl.id = c.price_list_id
        WHERE pl.name IN ('Interiors', 'Standard')
      `);
      let added = 0;
      for (const row of companiesResult.rows) {
        const already = await pool.query(
          `SELECT 1 FROM company_additional_price_lists WHERE company_id = $1 AND price_list_id = $2`,
          [row.id, customInsertsId]
        );
        if (already.rows.length === 0) {
          await pool.query(
            `INSERT INTO company_additional_price_lists (company_id, price_list_id) VALUES ($1, $2)`,
            [row.id, customInsertsId]
          );
          added++;
        }
      }
      console.log(`Custom Inserts assigned to ${added} new companies (${companiesResult.rows.length} total on Interiors/Standard)`);
    }
  } catch (err: any) {
    console.error("Custom Inserts bulk assignment error:", err.message);
  }

  // Rename product category 'BULK' → 'BULK LOOSE FILLING' in products table
  try {
    const r1 = await pool.query(`UPDATE products SET category = 'BULK LOOSE FILLING' WHERE UPPER(TRIM(category)) = 'BULK'`);
    if (r1.rowCount && r1.rowCount > 0) console.log(`Renamed BULK → BULK LOOSE FILLING: ${r1.rowCount} products`);
  } catch (err: any) {
    console.error("BULK rename error:", err.message);
  }

  // Rename 'CUST INSERTS' / 'CUST INSERT' → 'CUSTOM INSERTS' in products table
  try {
    const r2 = await pool.query(`UPDATE products SET category = 'CUSTOM INSERTS' WHERE UPPER(TRIM(category)) IN ('CUST INSERTS', 'CUST INSERT', 'CUSTOM INSERT')`);
    if (r2.rowCount && r2.rowCount > 0) console.log(`Renamed CUST INSERTS → CUSTOM INSERTS: ${r2.rowCount} products`);
  } catch (err: any) {
    console.error("CUST INSERTS rename error:", err.message);
  }

  // Strip non-ASCII/non-printable characters from product names (e.g. † dagger from Pearls Manchester CSV)
  try {
    const dirtyProds = await pool.query(`
      SELECT id, name FROM products
      WHERE octet_length(name) > length(name) OR name LIKE '%†%'
    `);
    let cleanedCount = 0;
    for (const row of dirtyProds.rows) {
      const cleaned = row.name.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned !== row.name) {
        await pool.query(`UPDATE products SET name = $1 WHERE id = $2`, [cleaned, row.id]);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) console.log(`Cleaned non-ASCII chars from ${cleanedCount} product names`);
    // Also fix any product names where a space is missing before a dash (e.g. "DOWN- " → "DOWN - ")
    const spaceFix = await pool.query(`
      UPDATE products SET name = regexp_replace(name, '([A-Za-z0-9%])- ', '\\1 - ', 'g')
      WHERE name ~ '[A-Za-z0-9%]- '
    `);
    if (spaceFix.rowCount && spaceFix.rowCount > 0) console.log(`Fixed missing spaces before dashes in ${spaceFix.rowCount} product names`);
  } catch (err: any) {
    console.error("Product name cleanup error:", err.message);
  }

  // Add Xero invoice columns to orders table if not present
  try {
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS xero_invoice_id TEXT,
        ADD COLUMN IF NOT EXISTS xero_invoice_status TEXT,
        ADD COLUMN IF NOT EXISTS xero_online_url TEXT
    `);
  } catch (err: any) {
    console.error("Xero columns migration error:", err.message);
  }



  // Fix orders that are clearly done but still show stale status in the portal
  // Covers: (1) Xero invoice status AUTHORISED/PAID, (2) orders imported from Xero historically,
  // (3) orders with a linked Xero invoice ID, (4) orders sent to Purax >14 days ago
  try {
    const staleOrders = await pool.query(`
      UPDATE orders SET status = 'completed', updated_at = NOW()
      WHERE status NOT IN ('completed', 'cancelled')
        AND (
          xero_invoice_status IN ('AUTHORISED', 'PAID')
          OR xero_invoice_id IS NOT NULL
          OR internal_notes ILIKE '%Imported from Xero invoice%'
          OR (purax_sync_status = 'sent' AND purax_synced_at < NOW() - INTERVAL '14 days')
        )
      RETURNING id, order_number
    `);
    if (staleOrders.rowCount && staleOrders.rowCount > 0) {
      const ids = staleOrders.rows.map((r: any) => r.id);
      await pool.query(`
        UPDATE customer_order_requests SET status = 'completed'
        WHERE converted_order_id = ANY($1::varchar[]) AND status != 'completed'
      `, [ids]);
      console.log(`Portal status fix: marked ${staleOrders.rowCount} orders as completed`);
    } else {
      console.log("Portal status fix: all orders already have correct status");
    }
  } catch (err: any) {
    console.error("Portal status fix error:", err.message);
  }

  // Fix Hungarian pillow product names: remove " - " format for clean single-option display
  try {
    await pool.query(`
      UPDATE products SET name =
        CASE
          WHEN name = 'STANDARD PILLOW - 80% HUNGARIAN PILLOW' THEN 'STANDARD 80% HUNGARIAN PILLOW'
          WHEN name = 'KING PILLOW - 80% HUNGARIAN PILLOW'     THEN 'KING 80% HUNGARIAN PILLOW'
          WHEN name = 'QUEEN PILLOW - 80% HUNGARIAN PILLOW'    THEN 'QUEEN 80% HUNGARIAN PILLOW'
        END
      WHERE name IN (
        'STANDARD PILLOW - 80% HUNGARIAN PILLOW',
        'KING PILLOW - 80% HUNGARIAN PILLOW',
        'QUEEN PILLOW - 80% HUNGARIAN PILLOW'
      ) AND category = 'HUNGARIAN PILLOW'
    `);
  } catch (err: any) {
    console.error("Hungarian pillow fix error:", err.message);
  }

  // Fix chamber pillow product names to use clear, consistent naming
  try {
    const chamberFix = await pool.query(`
      UPDATE products SET name =
        CASE
          WHEN name = 'STANDARD PILLOW - 80 DUCK DOWN CHAMBER PILLOW' THEN 'STANDARD CHAMBER PILLOW - 80% DUCK DOWN'
          WHEN name = 'STANDARD PILLOW - 50 DUCK DOWN CHAMBER PILLOW' THEN 'STANDARD CHAMBER PILLOW - 50% DUCK DOWN'
          WHEN name = 'KING PILLOW - 80 DUCK DOWN CHAMBER PILLOW'     THEN 'KING 80% CHAMBER PILLOW'
          WHEN name = 'KING PILLOW - 50 DUCK DOWN CHAMBER PILLOW'     THEN 'KING 50% CHAMBER PILLOW'
        END
      WHERE name IN (
        'STANDARD PILLOW - 80 DUCK DOWN CHAMBER PILLOW',
        'STANDARD PILLOW - 50 DUCK DOWN CHAMBER PILLOW',
        'KING PILLOW - 80 DUCK DOWN CHAMBER PILLOW',
        'KING PILLOW - 50 DUCK DOWN CHAMBER PILLOW'
      ) AND category = 'CHAMBER PILLOW'
    `);
    if (chamberFix.rowCount && chamberFix.rowCount > 0) {
      console.log(`Chamber pillow fix: renamed ${chamberFix.rowCount} products`);
    }
  } catch (err: any) {
    console.error("Chamber pillow fix error:", err.message);
  }

  // Fix pillow product names: rename any remaining "30% GOOSE DOWN PILLOW" to "80% GOOSE DOWN PILLOW"
  // (applies to all price lists except Hotel Luxury Collection which has its own naming)
  try {
    const pillowFix = await pool.query(`
      UPDATE products
      SET name = REGEXP_REPLACE(name, '30% GOOSE DOWN PILLOW', '80% GOOSE DOWN PILLOW', 'gi')
      WHERE name ILIKE '%30% GOOSE DOWN PILLOW%'
        AND category NOT IN ('MICROSOFT')
        AND id NOT IN (
          SELECT DISTINCT p.id FROM products p
          JOIN price_list_prices plp ON plp.product_id = p.id
          JOIN price_lists pl ON pl.id = plp.price_list_id
          WHERE pl.name ILIKE '%hotel%luxury%'
        )
      RETURNING id, name
    `);
    if (pillowFix.rowCount && pillowFix.rowCount > 0) {
      console.log(`Pillow name fix: renamed ${pillowFix.rowCount} products to 80% GOOSE DOWN PILLOW`);
    }
  } catch (err: any) {
    console.error("Pillow name fix error:", err.message);
  }

  // Backfill payment status: mark orders as paid where their linked Xero invoice is paid
  try {
    const backfill = await pool.query(`
      UPDATE orders SET payment_status = 'paid'
      WHERE payment_status = 'unpaid'
      AND (
        (xero_invoice_id IS NOT NULL AND xero_invoice_id IN (
          SELECT xero_invoice_id FROM invoices WHERE status = 'paid' AND xero_invoice_id IS NOT NULL
        ))
        OR id IN (
          SELECT order_id FROM invoices WHERE status = 'paid' AND order_id IS NOT NULL
        )
      )
    `);
    if (backfill.rowCount && backfill.rowCount > 0) {
      console.log(`Payment status backfill: marked ${backfill.rowCount} orders as paid from Xero invoices`);
    }
  } catch (err: any) {
    console.error("Payment status backfill error:", err.message);
  }

  // --- SHEERTEX PRICE LIST FIX ---
  // Fix category names and ensure all 16 SHEER products are in the list with correct categories.
  try {
    const sheertexPL = await pool.query(`SELECT id, name FROM price_lists WHERE name ILIKE '%sheer%' LIMIT 1`);
    if (sheertexPL.rows.length > 0) {
      const sheertexId = sheertexPL.rows[0].id;
      console.log(`[Sheertex] Found price list: "${sheertexPL.rows[0].name}" (${sheertexId})`);

      // Step 1: Fix category names on all products currently in the Sheertex price list
      const categoryFixes: Record<string, string> = {
        '4 SEASONS FILLED':     '4 SEASONS DUCK FILLED',
        'FOUR SEASONS FILLED':  '4 SEASONS DUCK FILLED',
        '50% DUCK WINTER FILLED': '50% DUCK MID WARM FILLED',
        '50% MID WARM FILLED':  '50% DUCK MID WARM FILLED',
        '80% HUNGARIAN GOOSE':  '80% GOOSE MID WARM FILLED',
        '80% MID WARM FILLED':  '80% GOOSE MID WARM FILLED',
        'HIGHGATE INSERTS':     'INSERTS',
        'INSERT':               'INSERTS',
      };
      const existingProds = await pool.query(
        `SELECT DISTINCT p.id, p.category FROM price_list_prices plp
         JOIN products p ON p.id = plp.product_id
         WHERE plp.price_list_id = $1`, [sheertexId]
      );
      let fixCount = 0;
      for (const row of existingProds.rows) {
        const newCat = categoryFixes[row.category] || categoryFixes[(row.category || '').toUpperCase()];
        if (newCat) {
          await pool.query(`UPDATE products SET category = $1 WHERE id = $2`, [newCat, row.id]);
          fixCount++;
        }
      }
      if (fixCount > 0) console.log(`[Sheertex] Fixed ${fixCount} product categories`);

      // Step 2: Ensure SHEER1 (50X50CM INSERT) exists in the list
      // Find or create a product with sku=SHEER1 / category=INSERTS
      let sheer1Id: string | null = null;
      const bySkuRes = await pool.query(`SELECT id FROM products WHERE sku = 'SHEER1' LIMIT 1`);
      if (bySkuRes.rows.length > 0) {
        sheer1Id = bySkuRes.rows[0].id;
        await pool.query(`UPDATE products SET category = 'INSERTS', name = '50X50CM' WHERE id = $1`, [sheer1Id]);
      } else {
        // Look for any 50X50CM product in Sheertex price list
        const byName = await pool.query(
          `SELECT p.id FROM products p
           JOIN price_list_prices plp ON plp.product_id = p.id
           WHERE plp.price_list_id = $1 AND UPPER(p.name) = '50X50CM' LIMIT 1`, [sheertexId]
        );
        if (byName.rows.length > 0) {
          sheer1Id = byName.rows[0].id;
          await pool.query(`UPDATE products SET category = 'INSERTS', sku = 'SHEER1' WHERE id = $1`, [sheer1Id]);
          console.log(`[Sheertex] Fixed existing 50X50CM product → INSERTS category`);
        } else {
          // Create fresh SHEER1 product
          const newProd = await pool.query(
            `INSERT INTO products (id, sku, name, category, unit_price, active)
             VALUES (gen_random_uuid(), 'SHEER1', '50X50CM', 'INSERTS', '11.00', true) RETURNING id`
          );
          sheer1Id = newProd.rows[0].id;
          console.log(`[Sheertex] Created SHEER1 (50X50CM, INSERTS)`);
        }
      }
      // Add SHEER1 to Sheertex if not already there
      const sheer1Exists = await pool.query(
        `SELECT id FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2 LIMIT 1`,
        [sheertexId, sheer1Id]
      );
      if (sheer1Exists.rows.length === 0) {
        await pool.query(
          `INSERT INTO price_list_prices (id, price_list_id, product_id, filling, weight, unit_price)
           VALUES (gen_random_uuid(), $1, $2, '100% Feather', 'Normal', '11.00')`,
          [sheertexId, sheer1Id]
        );
        console.log(`[Sheertex] Added SHEER1 (50X50CM INSERT $11.00) to price list`);
      }

      // Remove any HIGHGATE INSERTS products still lingering in Sheertex
      const removed = await pool.query(
        `DELETE FROM price_list_prices WHERE price_list_id = $1
         AND product_id IN (SELECT id FROM products WHERE UPPER(COALESCE(category,'')) LIKE '%HIGHGATE%')`,
        [sheertexId]
      );
      if ((removed.rowCount || 0) > 0) console.log(`[Sheertex] Removed ${removed.rowCount} stale Highgate entry(ies)`);

      const finalCount = await pool.query(`SELECT COUNT(*) FROM price_list_prices WHERE price_list_id = $1`, [sheertexId]);
      console.log(`[Sheertex] Done. Total entries: ${finalCount.rows[0].count}`);
    } else {
      console.log(`[Sheertex] Price list not found — skipping`);
    }
  } catch (err: any) {
    console.error("[Sheertex fix] Error:", err.message);
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
