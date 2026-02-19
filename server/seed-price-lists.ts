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
  { name: "Interiors", description: "Interiors pricing", isDefault: false, csvFile: "prices_for_replit_INTERIORS_PLUS_BULK_CSV_1771463115800.csv" },
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

async function deduplicatePriceLists() {
  const allLists = await db.select().from(priceLists);
  const nameGroups: Record<string, typeof allLists> = {};
  allLists.forEach(l => {
    if (!nameGroups[l.name]) nameGroups[l.name] = [];
    nameGroups[l.name].push(l);
  });

  for (const [name, lists] of Object.entries(nameGroups)) {
    if (lists.length <= 1) continue;
    const counts = await Promise.all(lists.map(async l => {
      const rows = await db.select({ count: sql<number>`count(*)` }).from(priceListPrices)
        .where(eq(priceListPrices.priceListId, l.id));
      return { list: l, count: Number(rows[0]?.count || 0) };
    }));
    counts.sort((a, b) => b.count - a.count);
    for (let i = 1; i < counts.length; i++) {
      console.log(`[PRICE-LISTS] Removing duplicate "${name}" (${counts[i].count} prices, keeping one with ${counts[0].count} prices)`);
      await db.delete(priceListPrices).where(eq(priceListPrices.priceListId, counts[i].list.id));
      await db.delete(priceLists).where(eq(priceLists.id, counts[i].list.id));
    }
  }
}

export async function seedPriceLists() {
  await deduplicatePriceLists();

  const existingLists = await db.select().from(priceLists);

  if (existingLists.length >= PRICE_LIST_CONFIGS.length) {
    console.log(`Price lists already seeded (${existingLists.length} lists), skipping`);
    return;
  }

  console.log("[PRICE-LISTS] Seeding price lists...");

  const allProducts = await db.select().from(products);
  const skuMap: Record<string, string> = {};
  const nameMap: Record<string, string> = {};
  allProducts.forEach(p => {
    skuMap[p.sku] = p.id;
    nameMap[p.name.trim().toUpperCase()] = p.id;
  });

  function findProductId(productName: string, csvSku: string): string | null {
    if (csvSku && csvSku.length > 2 && skuMap[csvSku]) return skuMap[csvSku];
    const upperName = productName.toUpperCase().trim();
    if (nameMap[upperName]) return nameMap[upperName];
    const sizePart = upperName.split(" - ")[0]?.trim();
    if (sizePart && nameMap[sizePart]) return nameMap[sizePart];
    for (const [dbName, dbId] of Object.entries(nameMap)) {
      if (upperName.startsWith(dbName) || dbName.startsWith(sizePart || "")) {
        return dbId;
      }
    }
    return null;
  }

  const existingNames = new Set(existingLists.map(l => l.name));

  for (const config of PRICE_LIST_CONFIGS) {
    if (existingNames.has(config.name)) {
      const existing = existingLists.find(l => l.name === config.name);
      if (existing) {
        const prices = await db.select({ id: priceListPrices.id }).from(priceListPrices)
          .where(eq(priceListPrices.priceListId, existing.id)).limit(1);
        if (prices.length > 0) {
          console.log(`[PRICE-LISTS] ${config.name} already has prices, skipping`);
          continue;
        }
        await db.delete(priceListPrices).where(eq(priceListPrices.priceListId, existing.id));
        await db.delete(priceLists).where(eq(priceLists.id, existing.id));
        console.log(`[PRICE-LISTS] Removed empty ${config.name} list, re-importing`);
      }
    }

    const csvPath = path.join(process.cwd(), "attached_assets", config.csvFile);
    if (!fs.existsSync(csvPath)) {
      console.log(`[PRICE-LISTS] CSV not found: ${config.csvFile}, skipping ${config.name}`);
      continue;
    }

    const [created] = await db.insert(priceLists).values({
      id: sql`gen_random_uuid()`,
      name: config.name,
      description: config.description,
      isDefault: config.isDefault,
    }).returning();

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

      batchValues.push({
        id: sql`gen_random_uuid()`,
        priceListId: created.id,
        productId,
        filling: filling || null,
        weight: weight || null,
        unitPrice: price.toFixed(2),
      });
    }

    for (let i = 0; i < batchValues.length; i += 50) {
      const batch = batchValues.slice(i, i + 50);
      await db.insert(priceListPrices).values(batch);
    }
    inserted = batchValues.length;

    console.log(`[PRICE-LISTS] ${config.name}: ${inserted} prices imported (${skipped} skipped)`);
  }

  console.log("[PRICE-LISTS] Price list seeding complete");
}
