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
      fields.push(current);
      current = "";
    } else current += char;
  }
  fields.push(current);
  return fields;
}

function normalizeCategory(cat: string): string {
  cat = cat.trim().toUpperCase();
  if (cat === "KHAKI BLANKET" || cat === "SILVER BLANKET") return "BLANKET";
  return cat;
}

export async function importSpaceCraftPriceList() {
  const csvPath = path.join(
    process.cwd(),
    "attached_assets/prices_for_replit_space_craft_CSV_OFFICAL_1771748848548.csv"
  );

  if (!fs.existsSync(csvPath)) {
    console.log("Space Craft CSV not found, skipping");
    return;
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").filter((l) => l.trim());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 6) continue;

    const productName = (fields[0] || "").trim();
    const category = normalizeCategory((fields[1] || "").trim());
    const sku = (fields[2] || "").trim();
    const filling = (fields[3] || "").trim();
    const weight = (fields[4] || "").trim();
    const priceStr = (fields[5] || "").trim().replace(/[$,]/g, "").replace(/\.\./g, ".");
    const price = priceStr ? parseFloat(priceStr) : null;

    if (!productName) continue;

    rows.push({
      productName,
      category,
      sku,
      filling,
      weight,
      price: price !== null && !isNaN(price) ? price : null,
    });
  }

  console.log(`Space Craft CSV: Parsed ${rows.length} rows`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let priceListId: string;
    const existingPL = await client.query(
      "SELECT id FROM price_lists WHERE name = 'Space Craft'"
    );
    if (existingPL.rows.length > 0) {
      priceListId = existingPL.rows[0].id;
      await client.query(
        "DELETE FROM price_list_prices WHERE price_list_id = $1",
        [priceListId]
      );
    } else {
      const newPL = await client.query(
        `INSERT INTO price_lists (name, description, is_default) VALUES ('Space Craft', 'Space Craft pricing', false) RETURNING id`
      );
      priceListId = newPL.rows[0].id;
    }
    console.log(`Space Craft price list ID: ${priceListId}`);

    const productsResult = await client.query(
      "SELECT id, name, category, sku FROM products"
    );
    const productByName = new Map<string, any>();
    const productByCleanName = new Map<string, any>();
    for (const p of productsResult.rows) {
      const key = `${p.name.trim().toUpperCase()}|||${(p.category || "").trim().toUpperCase()}`;
      productByName.set(key, p);
      const clean = p.name
        .trim()
        .toUpperCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s*-\s*-\s*/g, " - ")
        .replace(/\s+/g, " ")
        .trim();
      const cleanKey = `${clean}|||${(p.category || "").trim().toUpperCase()}`;
      if (!productByCleanName.has(cleanKey)) {
        productByCleanName.set(cleanKey, p);
      }
    }

    const grouped = new Map<string, CsvRow[]>();
    for (const row of rows) {
      const key = `${row.productName}|||${row.category}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    let insertedCount = 0;
    let skippedCount = 0;
    let newProductCount = 0;

    for (const [key, groupRows] of grouped) {
      const [name, category] = key.split("|||");
      const lookupKey = `${name.toUpperCase()}|||${category.toUpperCase()}`;

      let product = productByName.get(lookupKey);

      if (!product) {
        const cleanCsv = name
          .toUpperCase()
          .replace(/\s*\([^)]*\)\s*/g, " ")
          .replace(/\s*-\s*-\s*/g, " - ")
          .replace(/\s+/g, " ")
          .trim();
        product = productByCleanName.get(`${cleanCsv}|||${category.toUpperCase()}`);
      }

      if (!product) {
        const norm = name
          .toUpperCase()
          .replace(/\s*-\s*/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        for (const [ck, cp] of productByCleanName) {
          const [cName] = ck.split("|||");
          if (
            cName.replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim() === norm &&
            ck.endsWith(`|||${category.toUpperCase()}`)
          ) {
            product = cp;
            break;
          }
        }
      }

      if (!product) {
        const firstRow = groupRows[0];
        const hasVariants = groupRows.length > 1;
        const basePrice = hasVariants ? "0.00" : (firstRow.price?.toFixed(2) || "0.00");
        const generatedSku = firstRow.sku || `SC-${Date.now()}-${newProductCount}`;
        const result = await client.query(
          `INSERT INTO products (id, sku, name, category, unit_price, active)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, true)
           RETURNING id, name, category, sku`,
          [generatedSku, name, category, basePrice]
        );
        product = result.rows[0];
        productByName.set(lookupKey, product);
        const cleanNew = name.toUpperCase().replace(/\s+/g, " ").trim();
        productByCleanName.set(`${cleanNew}|||${category.toUpperCase()}`, product);
        newProductCount++;
        console.log(`  New product: ${name} (${category})`);
      }

      for (const row of groupRows) {
        if (row.price === null || row.price === 0) {
          skippedCount++;
          continue;
        }

        await client.query(
          `INSERT INTO price_list_prices (id, price_list_id, product_id, sku, filling, weight, unit_price)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
          [priceListId, product.id, row.sku || null, row.filling || null, row.weight || null, row.price.toFixed(2)]
        );
        insertedCount++;
      }
    }

    await client.query("COMMIT");
    console.log(
      `Space Craft import complete: ${insertedCount} prices inserted, ${skippedCount} skipped, ${newProductCount} new products created`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Space Craft import error:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.includes("import-spacecraft-pricelist")) {
  importSpaceCraftPriceList()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
