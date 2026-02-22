import { pool } from "./db";
import * as fs from "fs";
import * as path from "path";

interface CsvRow {
  productName: string;
  category: string;
  sku: string;
  filling: string;
  weight: string;
  price: number | null;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else current += char;
  }
  fields.push(current.trim());
  return fields;
}

function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export async function importStandardPriceList() {
  const csvPath = path.join(
    process.cwd(),
    "attached_assets/PRICES_FOR_REPLIT_STANDARD_+_bulk_offical_1771740498750.csv"
  );

  if (!fs.existsSync(csvPath)) {
    console.log("Standard price list CSV not found, skipping import");
    return;
  }

  const existingProducts = await pool.query("SELECT COUNT(*) as cnt FROM products");
  if (parseInt(existingProducts.rows[0].cnt) > 0) {
    console.log("Products already exist, skipping Standard price list import");
    return;
  }

  console.log("Importing Standard price list from CSV...");

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").filter((l) => l.trim());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 6) continue;
    rows.push({
      productName: (fields[0] || "").trim().replace(/\s*-?\s*\([^)]*\)/, "").trim(),
      category: (fields[1] || "").trim(),
      sku: (fields[2] || "").trim(),
      filling: (fields[3] || "").trim(),
      weight: (fields[4] || "").trim(),
      price: parsePrice(fields[5] || ""),
    });
  }

  console.log(`Parsed ${rows.length} rows from CSV`);

  const grouped = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const key = `${row.productName}|||${row.category}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  console.log(`Found ${grouped.size} unique products (grouped by name+category)`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let priceListId: string;
    const existingPL = await client.query(
      `SELECT id FROM price_lists WHERE name = 'Standard'`
    );
    if (existingPL.rows.length > 0) {
      priceListId = existingPL.rows[0].id;
      await client.query(`DELETE FROM price_list_prices WHERE price_list_id = $1`, [priceListId]);
    } else {
      const newPL = await client.query(
        `INSERT INTO price_lists (name, description, is_default) 
         VALUES ('Standard', 'Standard pricing for all products', true) 
         RETURNING id`
      );
      priceListId = newPL.rows[0].id;
    }
    console.log(`Standard price list ID: ${priceListId}`);

    let productsCreated = 0;
    let variantsCreated = 0;
    let priceListEntriesCreated = 0;

    for (const [key, groupRows] of Array.from(grouped.entries())) {
      const firstRow = groupRows[0];
      const hasVariants = groupRows.length > 1;

      const basePrice = hasVariants
        ? "0.00"
        : firstRow.price !== null
          ? firstRow.price.toFixed(2)
          : "0.00";

      const productResult = await client.query(
        `INSERT INTO products (sku, name, category, unit_price, active) 
         VALUES ($1, $2, $3, $4, true) 
         RETURNING id`,
        [firstRow.sku, firstRow.productName, firstRow.category, basePrice]
      );
      const productId = productResult.rows[0].id;
      productsCreated++;

      if (hasVariants) {
        for (const row of groupRows) {
          if (row.price === null) continue;

          const filling = row.filling || null;
          const weight = row.weight || null;

          await client.query(
            `INSERT INTO default_variant_prices (product_id, filling, weight, unit_price) 
             VALUES ($1, $2, $3, $4)`,
            [productId, filling, weight, row.price.toFixed(2)]
          );
          variantsCreated++;

          await client.query(
            `INSERT INTO price_list_prices (price_list_id, product_id, filling, weight, unit_price) 
             VALUES ($1, $2, $3, $4, $5)`,
            [priceListId, productId, filling, weight, row.price.toFixed(2)]
          );
          priceListEntriesCreated++;
        }
      } else {
        if (firstRow.price !== null) {
          await client.query(
            `INSERT INTO price_list_prices (price_list_id, product_id, unit_price) 
             VALUES ($1, $2, $3)`,
            [priceListId, productId, firstRow.price.toFixed(2)]
          );
          priceListEntriesCreated++;
        }
      }
    }

    await client.query("COMMIT");
    console.log(
      `Standard price list import complete: ${productsCreated} products, ${variantsCreated} variant prices, ${priceListEntriesCreated} price list entries`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Standard price list import failed:", error);
    throw error;
  } finally {
    client.release();
  }
}
