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

  // Import all price lists from CSV (each checks if already imported)
  try {
    await importStandardPriceList();
  } catch (error) {
    console.error("Standard price list import error:", error);
  }

  const otherImports = [
    { name: "Interiors", fn: importInteriorsPriceList },
    { name: "Poulos", fn: importPoulosPriceList },
    { name: "Frontline", fn: importFrontlinePriceList },
    { name: "Hotel Luxury Collection", fn: importHotelLuxuryPriceList },
    { name: "The Bedroom", fn: importBedroomPriceList },
    { name: "Sage & Claire", fn: importSageClairePriceList },
    { name: "L&M", fn: importLMPriceList },
    { name: "Space Craft", fn: importSpaceCraftPriceList },
    { name: "Walter G", fn: importWalterGPriceList },
    { name: "Castle & Things", fn: importCastlePriceList },
  ];

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
    const stripFix = await pool.query("UPDATE products SET category = 'HUNGARIAN PILLOW' WHERE category = 'STRIP PILLOW'");
    if (stripFix.rowCount && stripFix.rowCount > 0) {
      console.log(`Renamed ${stripFix.rowCount} STRIP PILLOW products to HUNGARIAN PILLOW`);
    }
    const quiltNameFix = await pool.query("UPDATE products SET name = REPLACE(name, ' - HUNGARIAN STRIPPED QUILT', ' - HUNGARIAN') WHERE name LIKE '% - HUNGARIAN STRIPPED QUILT'");
    if (quiltNameFix.rowCount && quiltNameFix.rowCount > 0) {
      console.log(`Updated ${quiltNameFix.rowCount} product names from HUNGARIAN STRIPPED QUILT to HUNGARIAN`);
    }

    // Ensure HUNGARIAN LIGHT FILL products exist (10 quilts)
    const hungarianLiteSkus = [
      { sku: 'HUNGARIAN LITE - 01', name: 'SINGLE - 80% HUNGARIAN G/DOWN ALL SEASONS CASS. 510GRMS', price: '121.00' },
      { sku: 'HUNGARIAN LITE - 02', name: 'DOUBLE - 80% HUNGARIAN G/DOWN ALL SEASONS CASS. 610GRMS', price: '142.00' },
      { sku: 'HUNGARIAN LITE - 03', name: 'QUEEN - 80% HUNGARIAN G/DOWN ALL SEASONS CASS. 720GRM', price: '170.00' },
      { sku: 'HUNGARIAN LITE - 04', name: 'KING - 80% HUNGARIAN G/DOWN ALL SEASONS CASS. 820GRMS', price: '186.00' },
      { sku: 'HUNGARIAN LITE - 05', name: 'SUPER KING - 80% HUNGARIAN G/DOWN ALL SEAS. CASS. 1050GRMS', price: '273.00' },
      { sku: 'HUNGARIAN LITE - 06', name: 'SINGLE - 80% HUNGARIAN G/DOWN WARM CASSETTE 600GRMS', price: '159.00' },
      { sku: 'HUNGARIAN LITE - 07', name: 'DOUBLE - 80% HUNGARIAN G/DOWN WARM CASSETTE 750GRMS', price: '183.00' },
      { sku: 'HUNGARIAN LITE - 08', name: 'QUEEN - 80% HUNGARIAN G/DOWN WARM CASSETTE 850GRM', price: '216.50' },
      { sku: 'HUNGARIAN LITE - 09', name: 'KING - 80% HUNGARIAN G/DOWN WARM CASSETTE 950GRMS', price: '232.00' },
      { sku: 'HUNGARIAN LITE - 10', name: 'SUPER KING - 80% HUNGARIAN G/DOWN WARM CASSETTE 1300GRMS', price: '314.00' },
    ];
    const standardPL = await pool.query("SELECT id FROM price_lists WHERE LOWER(name) = 'standard' LIMIT 1");
    if (standardPL.rows.length > 0) {
      const standardPLId = standardPL.rows[0].id;
      for (const item of hungarianLiteSkus) {
        const existsProd = await pool.query("SELECT id FROM products WHERE sku = $1", [item.sku]);
        let productId: string;
        if (existsProd.rows.length === 0) {
          const ins = await pool.query(
            "INSERT INTO products (id, sku, name, category, unit_price, active) VALUES (gen_random_uuid(), $1, $2, 'HUNGARIAN LIGHT FILL', $3, true) RETURNING id",
            [item.sku, item.name, item.price]
          );
          productId = ins.rows[0].id;
          console.log(`Created HUNGARIAN LIGHT FILL product: ${item.sku}`);
        } else {
          productId = existsProd.rows[0].id;
          await pool.query("UPDATE products SET category = 'HUNGARIAN LIGHT FILL', active = true WHERE id = $1", [productId]);
        }
        // Fix any existing entries that wrongly have filling set
        await pool.query(
          "UPDATE price_list_prices SET filling = NULL WHERE price_list_id = $1 AND product_id = $2 AND filling IS NOT NULL",
          [standardPLId, productId]
        );
        const existsPrice = await pool.query(
          "SELECT 1 FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2 LIMIT 1",
          [standardPLId, productId]
        );
        if (existsPrice.rows.length === 0) {
          await pool.query(
            "INSERT INTO price_list_prices (id, price_list_id, product_id, filling, weight, unit_price) VALUES (gen_random_uuid(), $1, $2, NULL, NULL, $3)",
            [standardPLId, productId, item.price]
          );
          console.log(`Added Standard price for ${item.sku}: $${item.price}`);
        }
      }
    }

    // Ensure FREIGHT, DROP SHIP FEE, SHOPIFY FEE exist in MISC category
    const miscProducts = ['FREIGHT', 'DROP SHIP FEE', 'SHOPIFY FEE'];
    for (const name of miscProducts) {
      const exists = await pool.query("SELECT id FROM products WHERE name = $1", [name]);
      if (exists.rows.length === 0) {
        await pool.query(
          "INSERT INTO products (id, sku, name, category, unit_price, active) VALUES (gen_random_uuid(), $1, $2, 'MISC', '0.00', true)",
          [name.toLowerCase().replace(/\s+/g, '_'), name]
        );
        console.log(`Created MISC product: ${name}`);
      } else {
        await pool.query("UPDATE products SET category = 'MISC' WHERE name = $1 AND category != 'MISC'", [name]);
      }
    }

    // Ensure JACKETS products exist for all price lists
    const jacketNames = [
      'EXTRA LARGE - MEN JACKET', 'LARGE - MEN JACKET', 'MEDIUM - MEN JACKET', 'SMALL - MEN JACKET',
      'EXTRA LARGE - WOMAN JACKET', 'LARGE - WOMAN JACKET', 'MEDIUM - WOMAN JACKET', 'SMALL - WOMAN JACKET'
    ];
    const jacketCheck = await pool.query("SELECT COUNT(*) as cnt FROM products WHERE category = 'JACKETS'");
    if (parseInt(jacketCheck.rows[0].cnt) < 8) {
      // Ensure at least the base PFH jacket products exist
      for (let i = 0; i < jacketNames.length; i++) {
        const sku = `PFH${438 + i}`;
        const existsJ = await pool.query("SELECT id FROM products WHERE sku = $1", [sku]);
        if (existsJ.rows.length === 0) {
          await pool.query(
            "INSERT INTO products (id, sku, name, category, unit_price, active) VALUES (gen_random_uuid(), $1, $2, 'JACKETS', '0.00', true) ON CONFLICT (sku) DO NOTHING",
            [sku, jacketNames[i]]
          );
        } else {
          await pool.query("UPDATE products SET category = 'JACKETS' WHERE sku = $1", [sku]);
        }
      }
      console.log("Ensured JACKETS category products exist");
    }

    // Ensure MISC, JACKETS, and BLANKETS products are in all price lists
    const priceLists = await pool.query("SELECT id, name FROM price_lists WHERE name != 'Hotel Luxury Collection'");
    const categoryProducts = await pool.query("SELECT id FROM products WHERE category IN ('MISC', 'JACKETS', 'BLANKETS')");
    for (const pl of priceLists.rows) {
      for (const prod of categoryProducts.rows) {
        const exists = await pool.query(
          "SELECT 1 FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2 LIMIT 1",
          [pl.id, prod.id]
        );
        if (exists.rows.length === 0) {
          await pool.query(
            "INSERT INTO price_list_prices (id, price_list_id, product_id, filling, weight, unit_price) VALUES (gen_random_uuid(), $1, $2, NULL, NULL, '0.00')",
            [pl.id, prod.id]
          );
        }
      }
    }
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

    console.log("Category normalization complete");
  } catch (error) {
    console.error("Category normalization error:", error);
  }

  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS portal_categories text[]`);
    await pool.query(`ALTER TABLE attachments ADD COLUMN IF NOT EXISTS file_data bytea`);
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

    const pillowProducts = [
      { sku: 'PFH-STDPILLOW', name: 'STANDARD PILLOW', category: 'MICROSOFT', defaultPrice: '15.00' },
      { sku: 'PFH-QNPILLOW', name: 'QUEEN PILLOW', category: 'MICROSOFT', defaultPrice: '22.00' },
      { sku: 'PFH-KGPILLOW', name: 'KING PILLOW', category: 'MICROSOFT', defaultPrice: '29.00' },
    ];
    const interiorsPrices: Record<string, string> = { 'PFH-STDPILLOW': '18.00', 'PFH-QNPILLOW': '27.00', 'PFH-KGPILLOW': '31.00' };
    const standardPrices: Record<string, string> = { 'PFH-STDPILLOW': '15.00', 'PFH-QNPILLOW': '22.00', 'PFH-KGPILLOW': '29.00' };
    const standardResult = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) = 'standard' LIMIT 1`);
    const standardId = standardResult.rows[0]?.id;

    for (const pp of pillowProducts) {
      const existing = await pool.query(`SELECT id FROM products WHERE sku = $1 LIMIT 1`, [pp.sku]);
      let productId: string;
      if (existing.rows.length === 0) {
        const ins = await pool.query(
          `INSERT INTO products (id, sku, name, category, active, unit_price) VALUES (gen_random_uuid(), $1, $2, $3, true, $4) RETURNING id`,
          [pp.sku, pp.name, pp.category, pp.defaultPrice]
        );
        productId = ins.rows[0].id;
      } else {
        productId = existing.rows[0].id;
        await pool.query(`UPDATE products SET category = $1 WHERE id = $2`, [pp.category, productId]);
      }
      if (interiorsResult.rows.length > 0) {
        const intId = interiorsResult.rows[0].id;
        const existsInt = await pool.query(`SELECT id FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2 LIMIT 1`, [intId, productId]);
        if (existsInt.rows.length === 0) {
          await pool.query(`INSERT INTO price_list_prices (id, price_list_id, product_id, unit_price) VALUES (gen_random_uuid(), $1, $2, $3)`, [intId, productId, interiorsPrices[pp.sku]]);
        }
      }
      if (standardId) {
        const existsStd = await pool.query(`SELECT id FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2 LIMIT 1`, [standardId, productId]);
        if (existsStd.rows.length === 0) {
          await pool.query(`INSERT INTO price_list_prices (id, price_list_id, product_id, unit_price) VALUES (gen_random_uuid(), $1, $2, $3)`, [standardId, productId, standardPrices[pp.sku]]);
        }
      }
    }
    console.log("Pillow products and prices ensured");
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

  // Add "Custom Inserts" as additional price list to all companies on Interiors or Standard
  try {
    const customInsertsResult = await pool.query(`SELECT id FROM price_lists WHERE name ILIKE 'custom inserts' LIMIT 1`);
    if (customInsertsResult.rows.length === 0) {
      console.log("Custom Inserts price list not found — skipping bulk assignment");
    } else {
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

  // Add '35x55 100% duck feather' to all CUSTOM INSERTS price lists
  try {
    const productName = "35x55 100% duck feather";
    const productSku = "CI-35X55-DF";
    const productPrice = 14.50;

    // Ensure product exists
    let existingProduct = await pool.query(
      `SELECT id FROM products WHERE UPPER(name) = UPPER($1) LIMIT 1`,
      [productName]
    );
    let productId: string;
    if (existingProduct.rows.length === 0) {
      const ins = await pool.query(
        `INSERT INTO products (id, sku, name, category, unit_price, active)
         VALUES (gen_random_uuid(), $1, $2, 'CUSTOM INSERTS', $3, true)
         ON CONFLICT (sku) DO NOTHING
         RETURNING id`,
        [productSku, productName, productPrice]
      );
      if (ins.rows.length > 0) {
        productId = ins.rows[0].id;
        console.log(`Created product: ${productName} (${productId})`);
      } else {
        // SKU conflict — fetch existing
        const ex = await pool.query(`SELECT id FROM products WHERE sku = $1`, [productSku]);
        productId = ex.rows[0]?.id;
      }
    } else {
      productId = existingProduct.rows[0].id;
    }

    if (productId!) {
      // Add to every price list that has any CUSTOM INSERTS product
      const priceLists = await pool.query(
        `SELECT DISTINCT plp.price_list_id FROM price_list_prices plp
         JOIN products p ON p.id = plp.product_id
         WHERE UPPER(p.category) = 'CUSTOM INSERTS'`
      );
      let added = 0;
      for (const row of priceLists.rows) {
        const plId = row.price_list_id;
        const exists = await pool.query(
          `SELECT 1 FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2 LIMIT 1`,
          [plId, productId]
        );
        if (exists.rows.length === 0) {
          await pool.query(
            `INSERT INTO price_list_prices (id, price_list_id, product_id, unit_price)
             VALUES (gen_random_uuid(), $1, $2, $3)`,
            [plId, productId, productPrice]
          );
          added++;
        }
      }
      if (added > 0) console.log(`Added ${productName} to ${added} price list(s)`);
    }
  } catch (err: any) {
    console.error("35x55 product migration error:", err.message);
  }

  // Add 3 Hungarian Goose Pillow products to Hotel Luxury Collection price list
  try {
    const hlcResult = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) LIKE '%hotel luxury%' LIMIT 1`);
    const hlcId = hlcResult.rows[0]?.id;
    if (hlcId) {
      const newPillows = [
        { sku: "HLC-HUNG-STD", name: "STANDARD HUNGARIAN GOOSE PILLOW STRIP", price: 112.00 },
        { sku: "HLC-HUNG-QN",  name: "QUEEN HUNGARIAN GOOSE PILLOW",           price: 117.00 },
        { sku: "HLC-HUNG-KG",  name: "KING HUNGARIAN GOOSE PILLOW",            price: 125.00 },
      ];
      for (const pillow of newPillows) {
        // Find by name first (most reliable), then SKU
        let pidRes = await pool.query(
          `SELECT id FROM products WHERE UPPER(name) = UPPER($1) LIMIT 1`,
          [pillow.name]
        );
        let pid: string;
        if (pidRes.rows.length === 0) {
          // Generate a safe SKU — use ours but fall back to a random suffix if it conflicts
          let sku = pillow.sku;
          const skuCheck = await pool.query(`SELECT 1 FROM products WHERE sku = $1`, [sku]);
          if (skuCheck.rows.length > 0) sku = `${sku}-${Date.now()}`;
          const ins = await pool.query(
            `INSERT INTO products (id, sku, name, category, unit_price, active)
             VALUES (gen_random_uuid(), $1, $2, 'PILLOW', $3, true) RETURNING id`,
            [sku, pillow.name, pillow.price]
          );
          pid = ins.rows[0].id;
          console.log(`[HLC-PILLOWS] Created product: ${pillow.name} (SKU: ${sku})`);
        } else {
          pid = pidRes.rows[0].id;
          console.log(`[HLC-PILLOWS] Product already exists: ${pillow.name}`);
        }
        // Add to Hotel Luxury Collection if not already there
        const exists = await pool.query(
          `SELECT 1 FROM price_list_prices WHERE price_list_id = $1 AND product_id = $2 LIMIT 1`,
          [hlcId, pid]
        );
        if (exists.rows.length === 0) {
          await pool.query(
            `INSERT INTO price_list_prices (id, price_list_id, product_id, unit_price)
             VALUES (gen_random_uuid(), $1, $2, $3)`,
            [hlcId, pid, pillow.price]
          );
          console.log(`[HLC-PILLOWS] Added "${pillow.name}" $${pillow.price} to Hotel Luxury Collection`);
        } else {
          console.log(`[HLC-PILLOWS] "${pillow.name}" already in Hotel Luxury Collection`);
        }
      }
    } else {
      console.error("[HLC-PILLOWS] Hotel Luxury Collection price list NOT FOUND in DB");
    }
  } catch (err: any) {
    console.error("Hungarian Goose Pillow migration error:", err.message);
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


  // ===== JENNIFER BUTTON PRICE LIST MIGRATION (always re-imports from CSV) =====
  try {
    const jbResult = await pool.query(
      `SELECT c.id, c.price_list_id FROM companies c
       JOIN portal_users pu ON pu.company_id = c.id
       WHERE pu.email = 'jennifer@jenniferbutton.com.au' LIMIT 1`
    );
    if (jbResult.rows.length > 0 && jbResult.rows[0].price_list_id) {
      const jbPriceListId = jbResult.rows[0].price_list_id;
      const csvPath = path.join(process.cwd(), "server/data/jennifer_button_prices.csv");
      if (!fs.existsSync(csvPath)) {
        console.log("[JB-PRICES] CSV file not found, skipping");
      } else {
        const csvText = fs.readFileSync(csvPath, "utf8");
        const csvLines = csvText.split("\n").filter(l => l.trim());
        const csvRowCount = csvLines.length - 1; // minus header

        // Check if already imported this exact CSV version (match by row count)
        const existingCount = await pool.query(
          `SELECT COUNT(*) FROM price_list_prices WHERE price_list_id = $1`,
          [jbPriceListId]
        );
        const currentCount = parseInt(existingCount.rows[0].count);
        if (currentCount === csvRowCount) {
          console.log(`[JB-PRICES] Already up to date (${currentCount} prices) — skipping`);
        } else {
          console.log(`[JB-PRICES] Reimporting JB price list (DB has ${currentCount}, CSV has ${csvRowCount} rows)...`);

          // Clear existing prices
          await pool.query(`DELETE FROM price_list_prices WHERE price_list_id = $1`, [jbPriceListId]);

          // Parse headers
          const headers = csvLines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
          const nameIdx = headers.findIndex(h => h === "product name" || h === "product" || h === "name");
          const fillingIdx = headers.findIndex(h => h === "filling");
          const weightIdx = headers.findIndex(h => h === "weight");
          const priceIdx = headers.findIndex(h => h.includes("price") && !h.includes("product"));

          // JB CSV names that differ from DB product names
          const JB_NAME_MAP: Record<string, string> = {
            'SINGLE - HUNGARIAN STRIPPED QUILT': 'SINGLE - HUNGARIAN',
            'DOUBLE - HUNGARIAN STRIPPED QUILT': 'DOUBLE - HUNGARIAN',
            'QUEEN - HUNGARIAN STRIPPED QUILT': 'QUEEN - HUNGARIAN',
            'KING - HUNGARIAN STRIPPED QUILT': 'KING - HUNGARIAN',
            'SUPER KING - HUNGARIAN STRIPPED QUILT': 'SUPER KING - HUNGARIAN',
          };

          // Load all products for exact name matching (take first match per name)
          const allProds = await pool.query("SELECT id, name FROM products WHERE active = true ORDER BY id");
          const productByName = new Map<string, string>();
          for (const p of allProds.rows) {
            const key = p.name.toUpperCase().trim();
            if (!productByName.has(key)) productByName.set(key, p.id);
          }

          let imported = 0, skipped = 0;
          for (let i = 1; i < csvLines.length; i++) {
            const parts = csvLines[i].split(",").map((p: string) => p.replace(/"/g, "").trim());
            const productName = nameIdx >= 0 ? (parts[nameIdx] || "") : "";
            const filling = fillingIdx >= 0 ? (parts[fillingIdx] || null) : null;
            const weight = weightIdx >= 0 ? (parts[weightIdx] || null) : null;
            const priceRaw = priceIdx >= 0 ? parts[priceIdx].replace(/[^0-9.]/g, "") : "";
            const price = parseFloat(priceRaw);

            if (!productName || isNaN(price) || price <= 0) { skipped++; continue; }

            // Try exact name, then JB name map fallback
            const upperName = productName.toUpperCase().trim();
            const mappedName = (JB_NAME_MAP[upperName] || upperName).toUpperCase().trim();
            const productId = productByName.get(upperName) || productByName.get(mappedName);
            if (!productId) { skipped++; continue; }

            try {
              await pool.query(
                `INSERT INTO price_list_prices (id, price_list_id, product_id, filling, weight, unit_price)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
                [jbPriceListId, productId, filling || null, weight || null, price.toFixed(2)]
              );
              imported++;
            } catch (e: any) {
              skipped++;
            }
          }
          console.log(`[JB-PRICES] Done: imported ${imported}, skipped ${skipped} (no matching product)`);
        }
      }
    }
  } catch (err: any) {
    console.error("[JB-PRICES] Migration error:", err.message);
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
