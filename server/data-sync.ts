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

  // Sync base prices for 80% WINTER FILLED products (Duck=base, Goose=higher)
  const priceUpdates = [
    { name: 'SINGLE - 80% WINTER FILLED', price: '105.00' },
    { name: 'DOUBLE - 80% WINTER FILLED', price: '120.00' },
    { name: 'QUEEN - 80% WINTER FILLED', price: '140.00' },
    { name: 'KING - 80% WINTER FILLED', price: '160.00' },
    { name: 'SUPER KING - 80% WINTER FILLED', price: '230.00' },
  ];
  for (const pu of priceUpdates) {
    await pool.query(
      `UPDATE products SET unit_price = $1 WHERE name = $2 AND (unit_price = '0' OR unit_price = '0.00' OR unit_price IS NULL)`,
      [pu.price, pu.name]
    );
  }

  // Ensure default_variant_prices table exists and is seeded
  await pool.query(`
    CREATE TABLE IF NOT EXISTS default_variant_prices (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id VARCHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      filling TEXT NOT NULL,
      weight TEXT,
      unit_price DECIMAL(12,2) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS default_variant_prices_product_idx ON default_variant_prices(product_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS default_variant_prices_lookup_idx ON default_variant_prices(product_id, filling, weight)`);

  // Seed default variant prices for 80% WINTER FILLED if not already present
  const dvpCount = await pool.query("SELECT COUNT(*) as cnt FROM default_variant_prices");
  if (parseInt(dvpCount.rows[0].cnt) === 0) {
    const winterProducts = await pool.query("SELECT id, name FROM products WHERE category = '80% WINTER FILLED'");
    const defaultPrices: Record<string, { Duck: string; Goose: string }> = {
      'SINGLE - 80% WINTER FILLED': { Duck: '105.00', Goose: '160.00' },
      'DOUBLE - 80% WINTER FILLED': { Duck: '120.00', Goose: '185.00' },
      'QUEEN - 80% WINTER FILLED': { Duck: '140.00', Goose: '215.00' },
      'KING - 80% WINTER FILLED': { Duck: '160.00', Goose: '245.00' },
      'SUPER KING - 80% WINTER FILLED': { Duck: '230.00', Goose: '330.00' },
    };
    for (const row of winterProducts.rows) {
      const prices = defaultPrices[row.name];
      if (prices) {
        await pool.query(
          `INSERT INTO default_variant_prices (product_id, filling, unit_price) VALUES ($1, 'Duck', $2), ($1, 'Goose', $3)`,
          [row.id, prices.Duck, prices.Goose]
        );
      }
    }
    console.log("Seeded default variant prices for 80% WINTER FILLED products");
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