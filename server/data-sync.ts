import { pool } from "./db";
import fs from "fs";
import path from "path";

function loadJsonData(filename: string): any[] | null {
  const bundledPath = path.join(__dirname, "data", filename);
  const devPath = path.join(process.cwd(), "server", "data", filename);

  if (fs.existsSync(bundledPath)) {
    return JSON.parse(fs.readFileSync(bundledPath, "utf-8"));
  } else if (fs.existsSync(devPath)) {
    return JSON.parse(fs.readFileSync(devPath, "utf-8"));
  }
  console.warn(`Data file ${filename} not found`);
  return null;
}

export async function syncProductionData() {
  // Clean up legacy "DUCK" references in product names/categories/descriptions
  const duckCleanup = await pool.query(
    `UPDATE products SET
      name = REPLACE(name, 'DUCK ', ''),
      category = REPLACE(category, 'DUCK ', ''),
      description = REPLACE(description, 'DUCK ', '')
    WHERE name LIKE '%DUCK %' OR category LIKE '%DUCK %' OR description LIKE '%DUCK %'`
  );
  if (duckCleanup.rowCount && duckCleanup.rowCount > 0) {
    console.log(`Cleaned up DUCK references from ${duckCleanup.rowCount} products`);
  }

  const productCount = await pool.query("SELECT COUNT(*) as cnt FROM products");
  const companyCount = await pool.query("SELECT COUNT(*) as cnt FROM companies");

  const currentProducts = parseInt(productCount.rows[0].cnt);
  const currentCompanies = parseInt(companyCount.rows[0].cnt);

  if (currentProducts >= 100 && currentCompanies >= 100) {
    console.log(`Data already synced: ${currentProducts} products, ${currentCompanies} companies`);
    return;
  }

  if (currentProducts < 100) {
    const productsData = loadJsonData("products.json");
    if (!productsData || productsData.length === 0) {
      console.warn("No products data file found, skipping product sync");
    } else {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM order_lines");
        await client.query("DELETE FROM quote_lines");
        await client.query("DELETE FROM products");

        for (const p of productsData) {
          await client.query(
            `INSERT INTO products (name, sku, category, description, unit_price, cost_price, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (sku) DO NOTHING`,
            [p.name, p.sku, p.category, p.description, p.unit_price || "0", p.cost_price || "0", p.active !== false]
          );
        }

        await client.query("COMMIT");
        console.log(`Synced ${productsData.length} products successfully`);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("Product sync failed, rolled back:", error);
      } finally {
        client.release();
      }
    }
  }

  if (currentCompanies < 100) {
    const companiesData = loadJsonData("companies.json");
    if (!companiesData || companiesData.length === 0) {
      console.warn("No companies data file found, skipping company sync");
    } else {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM order_lines");
        await client.query("DELETE FROM quote_lines");
        await client.query("DELETE FROM activities");
        await client.query("DELETE FROM audit_logs");
        await client.query("DELETE FROM attachments");
        await client.query("DELETE FROM invoices");
        await client.query("DELETE FROM orders");
        await client.query("DELETE FROM quotes");
        await client.query("DELETE FROM deals");
        await client.query("DELETE FROM contacts");
        await client.query("DELETE FROM emails");
        await client.query("DELETE FROM customer_order_requests");
        await client.query("DELETE FROM companies");

        for (const c of companiesData) {
          await client.query(
            `INSERT INTO companies (legal_name, trading_name, abn, billing_address, shipping_address, payment_terms, credit_status, tags, internal_notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              c.legal_name, c.trading_name, c.abn, c.billing_address, c.shipping_address,
              c.payment_terms || "Net 30", c.credit_status || "active",
              c.tags || null, c.internal_notes || null
            ]
          );
        }

        await client.query("COMMIT");
        console.log(`Synced ${companiesData.length} companies successfully`);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("Company sync failed, rolled back:", error);
      } finally {
        client.release();
      }
    }
  }
}