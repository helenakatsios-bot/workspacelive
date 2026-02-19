import { db } from "./db";
import { priceLists, priceListPrices, products } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
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

function parseCsvLine(line: string): string[] {
  return line.split(",");
}

function cleanPrice(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim().replace("$", "").replace(" ", "").replace("..", ".");
  if (!s) return null;
  const val = parseFloat(s);
  if (isNaN(val) || val === 0) return null;
  return val;
}

export async function seedPriceLists() {
  const existingLists = await db.select().from(priceLists);
  if (existingLists.length > 0) {
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
    const upperName = productName.toUpperCase();
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

  for (const config of PRICE_LIST_CONFIGS) {
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
    const lines = csv.trim().split("\n").slice(1);

    let inserted = 0;
    let skipped = 0;

    for (const line of lines) {
      if (!line.trim() || line.trim() === ",,,,,,,,,,,,") continue;
      const parts = parseCsvLine(line);
      const productName = parts[0]?.trim();
      const csvSku = parts[1]?.trim() || "";
      const filling = parts[3]?.trim() || null;
      const weight = parts[4]?.trim() || null;
      const price = cleanPrice(parts[5]);

      if (!productName || price === null) { skipped++; continue; }

      const productId = findProductId(productName, csvSku);
      if (!productId) { skipped++; continue; }

      await db.insert(priceListPrices).values({
        id: sql`gen_random_uuid()`,
        priceListId: created.id,
        productId,
        filling: filling || null,
        weight: weight || null,
        unitPrice: price.toFixed(2),
      });
      inserted++;
    }

    console.log(`[PRICE-LISTS] ${config.name}: ${inserted} prices imported (${skipped} skipped)`);
  }

  console.log("[PRICE-LISTS] Price list seeding complete");
}
