import { db } from "./db";
import { priceLists, priceListPrices, products } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

interface PriceListConfig {
  name: string;
  description: string;
  isDefault: boolean;
  csvFile: string;
}

const PRICE_LIST_CONFIGS: PriceListConfig[] = [
  { name: "Standard", description: "Standard pricing", isDefault: true, csvFile: "PRICES_FOR_REPLIT_STANDARD_+_bulk_CSV_1771462231694.csv" },
  { name: "Interiors", description: "Interiors pricing", isDefault: false, csvFile: "ALL_PRODUCTS_replit_INTERIORS_CSV_new_1771473578873.csv" },
  { name: "The Bedroom", description: "The Bedroom pricing", isDefault: false, csvFile: "Price_for_replit_the_bedroom_CSV_1771463298893.csv" },
  { name: "Walter G", description: "Walter G pricing", isDefault: false, csvFile: "prices_for_replit_watler_g_CSV_1771463426825.csv" },
  { name: "Poulos", description: "Poulos pricing", isDefault: false, csvFile: "prices_for_replit_poulos_CSV_1771463441907.csv" },
  { name: "L&M", description: "L&M pricing", isDefault: false, csvFile: "prices_for_replit_L&M_CSV_1771463473747.csv" },
  { name: "Frontline", description: "Frontline pricing", isDefault: false, csvFile: "Price_Replit_Frontline_CSV_1771463484555.csv" },
  { name: "Sage & Claire", description: "Sage & Claire pricing", isDefault: false, csvFile: "price_for_replit_sage_&_claire_CSV_1771463496136.csv" },
  { name: "Hotel Luxury Collection", description: "Hotel Luxury Collection pricing", isDefault: false, csvFile: "prices_for_replit_Hotel_Luxury_collection_CSV_1771463540309.csv" },
  { name: "Space Craft", description: "Space Craft pricing", isDefault: false, csvFile: "prices_for_replit_space_craft_CSV_1771463629286.csv" },
];

function cleanPrice(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim().replace("$", "").replace(" ", "").replace("..", ".");
  if (!s) return null;
  const val = parseFloat(s);
  if (isNaN(val) || val === 0) return null;
  return val;
}

interface ColumnMap {
  productName: number;
  sku: number;
  filling: number;
  weight: number;
  price: number;
}

function detectColumns(header: string): ColumnMap {
  const cols = header.split(",").map(c => c.trim().toLowerCase().replace(/[^a-z ]/g, ""));

  const nameIdx = cols.findIndex(c => c.includes("product name"));
  const priceIdx = cols.findIndex(c => c.includes("customer price") || c.includes("price"));

  const skuIdx = cols.indexOf("sku");
  const fillingIdx = cols.indexOf("filling");
  const weightIdx = cols.indexOf("weight");

  if (fillingIdx >= 0 && weightIdx >= 0) {
    return {
      productName: nameIdx >= 0 ? nameIdx : 0,
      sku: skuIdx >= 0 ? skuIdx : 1,
      filling: fillingIdx,
      weight: weightIdx,
      price: priceIdx >= 0 ? priceIdx : weightIdx + 1,
    };
  }

  return { productName: 0, sku: 1, filling: 3, weight: 4, price: 5 };
}

export async function seedPriceLists() {
  const existingLists = await db.select().from(priceLists);

  console.log("[PRICE-LISTS] Checking price lists for gaps...");

  const allProducts = await db.select().from(products);
  const skuMap: Record<string, string> = {};
  const nameMap: Record<string, string> = {};
  allProducts.forEach(p => {
    skuMap[p.sku] = p.id;
    nameMap[p.name.trim().toUpperCase()] = p.id;
  });

  function normalizeProductName(name: string): string {
    let n = name.toUpperCase().trim();
    n = n.replace(/\bDUCK FEATHER\b/g, "FEATHER");
    n = n.replace(/\bDUCK DOWN\b/g, "DOWN");
    n = n.replace(/\bDUCK WINTER\b/g, "WINTER");
    n = n.replace(/\s*-\s*\(\d+X\d+CM\)/g, "");
    n = n.replace(/\s+/g, " ").trim();
    return n;
  }

  const normalizedNameMap: Record<string, string> = {};
  allProducts.forEach(p => {
    normalizedNameMap[normalizeProductName(p.name)] = p.id;
  });

  function findProductId(productName: string, csvSku: string): string | null {
    if (csvSku && csvSku.length > 2 && skuMap[csvSku]) return skuMap[csvSku];
    const upperName = productName.toUpperCase().trim();
    if (nameMap[upperName]) return nameMap[upperName];
    const normalized = normalizeProductName(productName);
    if (normalizedNameMap[normalized]) return normalizedNameMap[normalized];
    const sizePart = upperName.split(" - ")[0]?.trim();
    if (sizePart && nameMap[sizePart]) return nameMap[sizePart];
    const normalizedSizePart = normalized.split(" - ")[0]?.trim();
    if (normalizedSizePart && normalizedNameMap[normalizedSizePart]) return normalizedNameMap[normalizedSizePart];
    for (const [dbName, dbId] of Object.entries(nameMap)) {
      if (upperName.startsWith(dbName) || dbName.startsWith(sizePart || "")) {
        return dbId;
      }
    }
    for (const [dbName, dbId] of Object.entries(normalizedNameMap)) {
      if (normalized.startsWith(dbName) || dbName.startsWith(normalizedSizePart || "")) {
        return dbId;
      }
    }
    return null;
  }

  const existingNames = new Set(existingLists.map(l => l.name));

  for (const config of PRICE_LIST_CONFIGS) {
    const csvPath = path.join(process.cwd(), "attached_assets", config.csvFile);
    if (!fs.existsSync(csvPath)) {
      console.log(`[PRICE-LISTS] CSV not found: ${config.csvFile}, skipping ${config.name}`);
      continue;
    }

    let priceListId: string;

    if (existingNames.has(config.name)) {
      const existing = existingLists.find(l => l.name === config.name);
      if (!existing) continue;
      priceListId = existing.id;
    } else {
      const [created] = await db.insert(priceLists).values({
        id: sql`gen_random_uuid()`,
        name: config.name,
        description: config.description,
        isDefault: config.isDefault,
      }).returning();
      priceListId = created.id;
    }

    const existingPricesRes = await db.select({
      productId: priceListPrices.productId,
      filling: priceListPrices.filling,
      weight: priceListPrices.weight,
    }).from(priceListPrices).where(eq(priceListPrices.priceListId, priceListId));
    const existingKeys = new Set(existingPricesRes.map(p => `${p.productId}|${p.filling || ""}|${p.weight || ""}`));

    const csv = fs.readFileSync(csvPath, "utf8");
    const allLines = csv.trim().split("\n");
    const header = allLines[0];
    const colMap = detectColumns(header);
    const lines = allLines.slice(1);

    let inserted = 0;
    let skipped = 0;

    const batchValues: any[] = [];

    for (const line of lines) {
      if (!line.trim() || line.trim().replace(/,/g, "") === "") continue;
      const parts = line.split(",");
      const productName = parts[colMap.productName]?.trim();
      const csvSku = parts[colMap.sku]?.trim() || "";
      const filling = parts[colMap.filling]?.trim() || null;
      const weight = parts[colMap.weight]?.trim() || null;
      const price = cleanPrice(parts[colMap.price]);

      if (!productName || price === null) { skipped++; continue; }

      const productId = findProductId(productName, csvSku);
      if (!productId) { skipped++; continue; }

      const key = `${productId}|${filling || ""}|${weight || ""}`;
      if (existingKeys.has(key)) continue;

      batchValues.push({
        id: sql`gen_random_uuid()`,
        priceListId,
        productId,
        filling: filling || null,
        weight: weight || null,
        unitPrice: price.toFixed(2),
      });
      existingKeys.add(key);
    }

    if (batchValues.length > 0) {
      for (let i = 0; i < batchValues.length; i += 50) {
        const batch = batchValues.slice(i, i + 50);
        await db.insert(priceListPrices).values(batch);
      }
      inserted = batchValues.length;
      console.log(`[PRICE-LISTS] ${config.name}: ${inserted} new prices added (${skipped} skipped, ${existingPricesRes.length} already existed)`);
    } else {
      console.log(`[PRICE-LISTS] ${config.name}: all ${existingPricesRes.length} prices already present`);
    }
  }

  // Sync default_variant_prices from Standard price list
  try {
    const standardList = existingLists.find(l => l.isDefault) || 
      (await db.select().from(priceLists).where(eq(priceLists.isDefault, true)))[0];
    if (standardList) {
      const standardPrices = await db.select().from(priceListPrices)
        .where(eq(priceListPrices.priceListId, standardList.id));
      
      const { defaultVariantPrices } = await import("@shared/schema");
      const existingDvp = await db.select({
        productId: defaultVariantPrices.productId,
        filling: defaultVariantPrices.filling,
      }).from(defaultVariantPrices);
      const dvpKeys = new Set(existingDvp.map(d => `${d.productId}|${d.filling || ""}`));
      
      let dvpAdded = 0;
      let dvpUpdated = 0;
      for (const sp of standardPrices) {
        if (!sp.unitPrice || sp.unitPrice === "0.00" || sp.unitPrice === "0") continue;
        if (!sp.filling) continue;
        const key = `${sp.productId}|${sp.filling}`;
        if (dvpKeys.has(key)) {
          const existing = existingDvp.find(d => d.productId === sp.productId && (d.filling || "") === (sp.filling || ""));
          if (existing) {
            const currentDvp = await db.select({ unitPrice: defaultVariantPrices.unitPrice })
              .from(defaultVariantPrices)
              .where(and(
                eq(defaultVariantPrices.productId, sp.productId),
                sp.filling ? eq(defaultVariantPrices.filling, sp.filling) : sql`${defaultVariantPrices.filling} IS NULL`
              ));
            if (currentDvp.length > 0 && (currentDvp[0].unitPrice === "0.00" || currentDvp[0].unitPrice === "0")) {
              await db.update(defaultVariantPrices)
                .set({ unitPrice: sp.unitPrice })
                .where(and(
                  eq(defaultVariantPrices.productId, sp.productId),
                  sp.filling ? eq(defaultVariantPrices.filling, sp.filling) : sql`${defaultVariantPrices.filling} IS NULL`
                ));
              dvpUpdated++;
            }
          }
        } else {
          await db.insert(defaultVariantPrices).values({
            id: sql`gen_random_uuid()`,
            productId: sp.productId,
            filling: sp.filling || null,
            weight: sp.weight || null,
            unitPrice: sp.unitPrice,
          });
          dvpAdded++;
          dvpKeys.add(key);
        }
      }
      if (dvpAdded > 0 || dvpUpdated > 0) {
        console.log(`[PRICE-LISTS] Default variant prices: ${dvpAdded} added, ${dvpUpdated} updated from Standard list`);
      }
    }
  } catch (err) {
    console.error("[PRICE-LISTS] Error syncing default variant prices:", err);
  }

  // Sync base product unit_price from Standard price list for products with $0.00
  try {
    const { pool: pgPool } = await import("./db");
    const fixResult = await pgPool.query(`
      UPDATE products p 
      SET unit_price = plp.unit_price 
      FROM price_list_prices plp 
      JOIN price_lists pl ON plp.price_list_id = pl.id 
      WHERE pl.is_default = true 
        AND plp.product_id = p.id 
        AND (p.unit_price = '0.00' OR p.unit_price = '0')
        AND plp.unit_price IS NOT NULL 
        AND plp.unit_price != '0.00'
        AND plp.unit_price != '0'
        AND plp.filling IS NULL
    `);
    if (fixResult.rowCount && fixResult.rowCount > 0) {
      console.log(`[PRICE-LISTS] Updated ${fixResult.rowCount} product base prices from Standard list`);
    }
    // Also fix products where no null-filling price exists but a variant price does
    const fixResult2 = await pgPool.query(`
      UPDATE products p 
      SET unit_price = sub.unit_price
      FROM (
        SELECT DISTINCT ON (plp.product_id) plp.product_id, plp.unit_price
        FROM price_list_prices plp 
        JOIN price_lists pl ON plp.price_list_id = pl.id 
        WHERE pl.is_default = true 
          AND plp.unit_price IS NOT NULL 
          AND plp.unit_price != '0.00'
          AND plp.unit_price != '0'
        ORDER BY plp.product_id, plp.unit_price ASC
      ) sub
      WHERE sub.product_id = p.id 
        AND (p.unit_price = '0.00' OR p.unit_price = '0')
    `);
    if (fixResult2.rowCount && fixResult2.rowCount > 0) {
      console.log(`[PRICE-LISTS] Updated ${fixResult2.rowCount} more product base prices from variant prices`);
    }
  } catch (err) {
    console.error("[PRICE-LISTS] Error syncing product base prices:", err);
  }

  console.log("[PRICE-LISTS] Price list seeding complete");
}
