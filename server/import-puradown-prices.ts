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
    else if (char === "," && !inQuotes) { fields.push(current.trim()); current = ""; }
    else current += char;
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

export async function importPuradownPrices() {
  const csvPath = path.join(process.cwd(), "attached_assets/PRICES_FOR_REPLIT_STANDARD_1770941395824.csv");

  if (!fs.existsSync(csvPath)) {
    console.log("Puradown pricing CSV not found, skipping");
    return;
  }
  const csvContent = fs.readFileSync(csvPath, "utf-8");

  if (!csvContent) {
    console.log("Puradown pricing CSV not found, skipping");
    return;
  }

  const puradownRes = await pool.query(
    `SELECT id FROM companies WHERE LOWER(legal_name) = 'puradown website sales' OR LOWER(trading_name) = 'puradown website sales' LIMIT 1`
  );
  if (puradownRes.rows.length === 0) {
    console.log("PURADOWN WEBSITE SALES company not found, skipping price import");
    return;
  }
  const companyId = puradownRes.rows[0].id;

  const existingCount = await pool.query(
    `SELECT COUNT(*) as cnt FROM company_variant_prices WHERE company_id = $1`,
    [companyId]
  );
  if (parseInt(existingCount.rows[0].cnt) > 0) {
    console.log(`Puradown variant prices already imported (${existingCount.rows[0].cnt} rows), skipping`);
    return;
  }

  const allProducts = (await pool.query(`SELECT id, sku, name, category FROM products`)).rows;
  const skuMap = new Map<string, any>();
  for (const p of allProducts) {
    skuMap.set(p.sku.toUpperCase(), p);
  }

  const lines = csvContent.split("\n").filter((l: string) => l.trim());
  let imported = 0;
  let skipped = 0;
  const baseCompanyPrices: { productId: string; price: number }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 6) continue;

    const sku = (fields[1] || "").trim().toUpperCase();
    const filling = (fields[3] || "").trim();
    const weight = (fields[4] || "").trim() || null;
    const price = parsePrice(fields[5]);

    if (!sku || price === null) {
      skipped++;
      continue;
    }

    const product = skuMap.get(sku);
    if (!product) {
      skipped++;
      continue;
    }

    if (!filling) {
      skipped++;
      continue;
    }

    try {
      await pool.query(
        `INSERT INTO company_variant_prices (company_id, product_id, filling, weight, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [companyId, product.id, filling, weight, price.toFixed(2)]
      );
      imported++;

      if (!weight || weight === "Normal") {
        baseCompanyPrices.push({ productId: product.id, price });
      }
    } catch (err: any) {
      console.error(`Error importing row ${i}: ${err.message}`);
    }
  }

  const uniqueBaseProducts = new Map<string, number>();
  for (const bp of baseCompanyPrices) {
    if (!uniqueBaseProducts.has(bp.productId)) {
      uniqueBaseProducts.set(bp.productId, bp.price);
    }
  }
  let baseSet = 0;
  for (const [productId, price] of uniqueBaseProducts) {
    try {
      await pool.query(
        `INSERT INTO company_prices (company_id, product_id, unit_price)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [companyId, productId, price.toFixed(2)]
      );
      baseSet++;
    } catch (err: any) {
    }
  }

  console.log(`Puradown variant prices imported: ${imported} variant prices, ${baseSet} base prices set, ${skipped} skipped`);
}
