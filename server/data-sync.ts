import { pool } from "./db";
import fs from "fs";
import path from "path";

function loadJsonData(filename: string): any[] | null {
  const candidates = [
    path.join(process.cwd(), "server", "data", filename),
    path.join(process.cwd(), "dist", "data", filename),
    path.join(process.cwd(), "data", filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  }
  console.warn(`Data file ${filename} not found`);
  return null;
}

async function importProductsFromCsv() {
  const csvPaths = [
    path.join(process.cwd(), "attached_assets", "ALL_PRODUCTS_replit_1771449439042.csv"),
  ];
  let csvContent: string | null = null;
  for (const p of csvPaths) {
    if (fs.existsSync(p)) {
      csvContent = fs.readFileSync(p, "utf-8");
      break;
    }
  }
  if (!csvContent) {
    console.log("CSV product file not found, skipping CSV import");
    return;
  }

  const lines = csvContent.split("\n").filter(l => l.trim());
  const rows = lines.slice(1).map(line => {
    const parts = line.split(",");
    return {
      name: (parts[0] || "").trim(),
      sku: (parts[1] || "").trim(),
      subcategory: (parts[2] || "").trim(),
      category: (parts[3] || "").trim(),
      filling: (parts[4] || "").trim(),
      weight: (parts[5] || "").trim(),
    };
  });

  const existingProducts = await pool.query("SELECT id, sku, name FROM products");
  const existingSkus = new Set(existingProducts.rows.map((p: any) => p.sku));
  const existingNames = new Set(existingProducts.rows.map((p: any) => p.name.toUpperCase()));
  const productIdBySku = new Map(existingProducts.rows.map((p: any) => [p.sku, p.id]));
  const productIdByName = new Map(existingProducts.rows.map((p: any) => [p.name.toUpperCase(), p.id]));

  const productMap = new Map<string, { name: string; sku: string; category: string; variants: { filling: string; weight: string }[] }>();
  for (const row of rows) {
    if (!row.name) continue;
    const key = row.sku || row.name;
    if (!productMap.has(key)) {
      productMap.set(key, { name: row.name, sku: row.sku, category: row.category || row.subcategory, variants: [] });
    }
    if (row.filling || row.weight) {
      const variants = productMap.get(key)!.variants;
      if (!variants.some(v => v.filling === row.filling && v.weight === row.weight)) {
        variants.push({ filling: row.filling, weight: row.weight });
      }
    }
  }

  let insertedProducts = 0;
  let insertedVariants = 0;

  for (const [key, prod] of productMap) {
    let sku = prod.sku;
    let productId: string | undefined;

    if (!sku || sku === "BULK") {
      if (existingNames.has(prod.name.toUpperCase())) {
        productId = productIdByName.get(prod.name.toUpperCase());
      } else {
        const catPrefix = (prod.category || "MISC").substring(0, 4).toUpperCase();
        let counter = 900;
        while (existingSkus.has(`${catPrefix}-${String(counter).padStart(3, "0")}`)) counter++;
        sku = `${catPrefix}-${String(counter).padStart(3, "0")}`;
      }
    }

    if (!productId && existingSkus.has(sku)) {
      productId = productIdBySku.get(sku);
    }

    if (!productId && sku) {
      try {
        let cat = prod.category;
        if (["4 SEASON", "5 SEASON", "6 SEASON", "7 SEASON", "8 SEASON", "9 SEASON", "10 SEASON", "11 SEASON", "12 SEASON", "13 SEASON"].includes(cat)) {
          cat = "4 SEASONS FILLED";
        }
        const result = await pool.query(
          `INSERT INTO products (sku, name, category, unit_price, active) VALUES ($1, $2, $3, '0.00', true) ON CONFLICT (sku) DO NOTHING RETURNING id`,
          [sku, prod.name, cat || null]
        );
        if (result.rows.length > 0) {
          productId = result.rows[0].id;
          existingSkus.add(sku);
          productIdBySku.set(sku, productId!);
          insertedProducts++;
        } else {
          const existing = await pool.query("SELECT id FROM products WHERE sku = $1", [sku]);
          if (existing.rows.length > 0) productId = existing.rows[0].id;
        }
      } catch (e: any) {
        // skip
      }
    }

    if (productId && prod.variants.length > 0) {
      for (const v of prod.variants) {
        if (!v.filling) continue;
        try {
          const exists = await pool.query(
            "SELECT id FROM default_variant_prices WHERE product_id = $1 AND filling = $2 AND COALESCE(weight, '') = $3",
            [productId, v.filling, v.weight || ""]
          );
          if (exists.rows.length === 0) {
            await pool.query(
              "INSERT INTO default_variant_prices (product_id, filling, weight, unit_price) VALUES ($1, $2, $3, '0.00')",
              [productId, v.filling, v.weight || null]
            );
            insertedVariants++;
          }
        } catch (e: any) {
          // skip duplicates
        }
      }
    }
  }

  if (insertedProducts > 0 || insertedVariants > 0) {
    console.log(`CSV import: ${insertedProducts} products, ${insertedVariants} variant prices added`);
  }
}

export async function syncProductionData() {
  // Ensure all BULK filling products exist
  const bulkProducts = [
    { sku: 'BULK-001', name: '100% FEATHER', category: 'BULK' },
    { sku: 'BULK-002', name: 'FEATHER & FIBRE', category: 'BULK' },
    { sku: 'BULK-003', name: '15% DOWN 85% FEATHER', category: 'BULK' },
    { sku: 'BULK-004', name: '30% DOWN 70% FEATHER', category: 'BULK' },
    { sku: 'BULK-005', name: '50% DOWN 50% FEATHER', category: 'BULK' },
    { sku: 'BULK-006', name: '80% DOWN 20% FEATHER', category: 'BULK' },
    { sku: 'BULK-007', name: '80% GOOSE DOWN 20% GOOSE FEATHER', category: 'BULK' },
    { sku: 'BULK-008', name: 'FEATHER/FIBRE/DOWN', category: 'BULK' },
    { sku: 'BULK-009', name: '230CM COTTON JAPARA', category: 'BULK' },
    { sku: 'BULK-010', name: 'FEATHER & FOAM', category: 'BULK' },
  ];
  let bulkInserted = 0;
  for (const bp of bulkProducts) {
    const exists = await pool.query("SELECT id FROM products WHERE sku = $1", [bp.sku]);
    if (exists.rows.length === 0) {
      await pool.query(
        "INSERT INTO products (sku, name, category, unit_price, active) VALUES ($1, $2, $3, '0.00', true) ON CONFLICT (sku) DO NOTHING",
        [bp.sku, bp.name, bp.category]
      );
      bulkInserted++;
    }
  }
  if (bulkInserted > 0) {
    console.log(`Added ${bulkInserted} BULK filling products`);
  }

  // Clean up duplicate BULK products with auto-generated SKUs (BULK-900, BULK-901, etc.)
  await pool.query("DELETE FROM products WHERE sku LIKE 'BULK-9%' AND category = 'BULK'");

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

  await importProductsFromCsv();
}