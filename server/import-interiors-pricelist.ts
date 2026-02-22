import { pool } from "./db";
import * as fs from "fs";
import * as path from "path";

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

function cleanProductName(name: string, category: string): string {
  let cleaned = name.trim()
    .replace(/\s*-?\s*\([^)]*\)/, "")
    .replace(/ - KHAKI BLANKET$/, " - KHAKI")
    .replace(/ - SILVER BLANKET$/, " - SILVER")
    .trim();
  return cleaned;
}

function normalizeCategory(cat: string): string {
  if (cat === "KHAKI BLANKET" || cat === "SILVER BLANKET") return "BLANKET";
  return cat;
}

export async function importInteriorsPriceList() {
  const csvPath = path.join(
    process.cwd(),
    "attached_assets/replit_INTERIORS_CSV_OFFICAL_1771743126691.csv"
  );

  if (!fs.existsSync(csvPath)) {
    console.log("Interiors CSV not found, skipping");
    return;
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").filter((l) => l.trim());

  interface CsvRow {
    productName: string;
    category: string;
    sku: string;
    filling: string;
    weight: string;
    price: number | null;
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 6) continue;
    rows.push({
      productName: cleanProductName(fields[0] || "", fields[1] || ""),
      category: normalizeCategory((fields[1] || "").trim()),
      sku: (fields[2] || "").trim(),
      filling: (fields[3] || "").trim(),
      weight: (fields[4] || "").trim(),
      price: parsePrice(fields[5] || ""),
    });
  }

  console.log(`Interiors CSV: Parsed ${rows.length} rows`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const priceListResult = await client.query(
      "SELECT id FROM price_lists WHERE name = 'Interiors'"
    );
    if (priceListResult.rows.length === 0) {
      console.log("Interiors price list not found, skipping");
      await client.query("ROLLBACK");
      return;
    }
    const priceListId = priceListResult.rows[0].id;

    await client.query(
      "DELETE FROM price_list_prices WHERE price_list_id = $1",
      [priceListId]
    );

    const productsResult = await client.query(
      "SELECT id, name, category, sku FROM products"
    );
    const productByName = new Map<string, string>();
    const productBySku = new Map<string, string>();
    const productByCleanName = new Map<string, string>();
    for (const p of productsResult.rows) {
      const key = `${p.name.trim().toUpperCase()}|||${(p.category || "").trim().toUpperCase()}`;
      productByName.set(key, p.id);
      if (p.sku) productBySku.set(p.sku.trim().toUpperCase(), p.id);
      const cleanName = p.name.trim().toUpperCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s*-\s*-\s*/g, " - ")
        .replace(/\s+/g, " ")
        .trim();
      const cleanKey = `${cleanName}|||${(p.category || "").trim().toUpperCase()}`;
      if (!productByCleanName.has(cleanKey)) {
        productByCleanName.set(cleanKey, p.id);
      }
    }

    let insertedCount = 0;
    let skippedCount = 0;

    const grouped = new Map<string, CsvRow[]>();
    for (const row of rows) {
      const key = `${row.productName}|||${row.category}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    for (const [key, groupRows] of grouped) {
      const [name, category] = key.split("|||");
      const lookupKey = `${name.toUpperCase()}|||${category.toUpperCase()}`;
      let productId = productByName.get(lookupKey);

      if (!productId) {
        const cleanCsv = name.toUpperCase()
          .replace(/\s*-\s*-\s*/g, " - ")
          .replace(/\s+/g, " ")
          .trim();
        const cleanLookup = `${cleanCsv}|||${category.toUpperCase()}`;
        productId = productByCleanName.get(cleanLookup);
      }

      if (!productId) {
        const normalized = name.toUpperCase()
          .replace(/\s*-\s*/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        for (const [ck, cid] of productByCleanName) {
          const [cName] = ck.split("|||");
          const cNorm = cName.replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
          if (cNorm === normalized && ck.endsWith(`|||${category.toUpperCase()}`)) {
            productId = cid;
            break;
          }
        }
      }

      if (!productId) {
        const firstSku = groupRows[0].sku.toUpperCase();
        productId = productBySku.get(firstSku);
      }

      if (!productId) {
        console.log(`  Skipping unmatched product: ${name} (${category})`);
        skippedCount += groupRows.length;
        continue;
      }

      for (const row of groupRows) {
        if (row.price === null || row.price === 0) {
          skippedCount++;
          continue;
        }

        await client.query(
          `INSERT INTO price_list_prices (id, price_list_id, product_id, filling, weight, unit_price)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
          [priceListId, productId, row.filling || null, row.weight || null, row.price.toFixed(2)]
        );
        insertedCount++;
      }
    }

    await client.query("COMMIT");
    console.log(`Interiors import complete: ${insertedCount} prices inserted, ${skippedCount} skipped (no price/unmatched)`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Interiors import error:", error);
    throw error;
  } finally {
    client.release();
  }
}

const isMainModule = process.argv[1]?.includes("import-interiors-pricelist");
if (isMainModule) {
  importInteriorsPriceList()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
