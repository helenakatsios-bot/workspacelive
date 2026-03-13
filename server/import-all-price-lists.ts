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

interface PriceListConfig {
  name: string;
  description: string;
  isDefault: boolean;
  csvFiles: string[];
  categoryNorm?: (cat: string) => string;
  csvStartRow?: number;
  swapSkuCategory?: boolean;
  allowedCategories?: string[];
}

const PRICE_LISTS: PriceListConfig[] = [
  {
    name: "Standard",
    description: "Standard pricing",
    isDefault: true,
    csvFiles: [
      "PRICES_FOR_REPLIT_STANDARD_offical_1772687851524.csv",
      "PRICES_FOR_REPLIT_STANDARD_+_bulk_offical_1771740498750.csv",
      "PRICES_FOR_REPLIT_STANDARD_+_bulk_CSV_1771462231694.csv",
    ],
  },
  {
    name: "ECO DOWN UNDER",
    description: "ECO DOWN UNDER pricing",
    isDefault: false,
    csvFiles: [
      "ECO_DOWN_UNDER_PRICES_OFFICAL__1772688157685.csv",
      "ECO_DOWN_UNDER_PRICES_OFFICAL__1772682499501.csv",
    ],
  },
  {
    name: "ECO LINEN",
    description: "ECO LINEN pricing",
    isDefault: false,
    csvFiles: ["ECO_LINEN_OFFICAL_1772688303233.csv"],
    categoryNorm: (cat) => {
      if (cat === "KHAKI BLANKET" || cat === "SILVER BLANKET") return "BLANKET";
      return cat;
    },
  },
  {
    name: "L&M Home",
    description: "L&M Home pricing",
    isDefault: false,
    csvFiles: [
      "prices_for_replit_L&M_CSV_OFFICAL__1772688327814.csv",
      "prices_for_replit_L&M_CSV_OFFICAL_2_1771798461097.csv",
      "prices_for_replit_L&M_CSV_OFFICAL_1771748512450.csv",
    ],
  },
  {
    name: "Walter G",
    description: "Walter G pricing",
    isDefault: false,
    csvFiles: [
      "prices_for_replit_watler_g_CSV_OFFICAL_1772688319849.csv",
      "prices_for_replit_watler_g_CSV_OFFICAL_1771795752483.csv",
    ],
    categoryNorm: (cat) => {
      // Normalise "INSERT" → "INSERTS" so products match the DB category
      if (cat === "INSERT") return "INSERTS";
      return cat;
    },
  },
  {
    name: "Sage & Claire",
    description: "Sage & Claire pricing",
    isDefault: false,
    csvFiles: [
      "price_for_replit_sage_&_claire_CSV_OFFICAL_1772688360487.csv",
      "price_for_replit_sage_&_claire_CSV_OFFICAL_1771797664577.csv",
    ],
  },
  {
    name: "Jennifer Button",
    description: "Jennifer Button pricing",
    isDefault: false,
    csvFiles: [
      "JENNIFER_BUTTON_PRICES_OFFICAL...._1772607414995.csv",
      "JENNIFER_BUTTON_PRICES_OFFICAL...._1772607266616.csv",
    ],
  },
  {
    name: "Custom Inserts",
    description: "Custom Inserts pricing",
    isDefault: false,
    csvFiles: ["CUSTOM_INSERTS_OFFICAL_1772688432425.csv"],
  },
  {
    name: "Frontline",
    description: "Frontline pricing",
    isDefault: false,
    csvFiles: [
      "Price_Replit_Frontline_CSV_OFFICAL_1772688456028.csv",
      "Price_Replit_Frontline_CSV_OFFICAL_1771798326955.csv",
    ],
  },
  {
    name: "Poulos",
    description: "Poulos pricing",
    isDefault: false,
    csvFiles: ["prices_for_replit_poulos_CSV_OFFICAL_1773097451070.csv", "poulos_prices.csv"],
    categoryNorm: (cat) => {
      if (cat === "KHAKI BLANKET" || cat === "SILVER BLANKET") return "BLANKETS";
      if (cat === "STRIP PILLOW") return "HUNGARIAN PILLOW";
      if (cat === "BULK") return "BULK LOOSE FILLING";
      return cat;
    },
  },
  {
    name: "Hotel Luxury Collection",
    description: "Hotel Luxury Collection pricing",
    isDefault: false,
    csvFiles: [
      "prices_for_replit_Hotel_Luxury_collection_CSV_OFFICAL_1772688799837.csv",
      "prices_for_replit_Hotel_Luxury_collection_CSV_OFFICAL_1771748316614.csv",
    ],
  },
  {
    name: "Dyne",
    description: "Dyne pricing",
    isDefault: false,
    csvFiles: ["DYNE_REPLIT_OFFICAL_1772688816084.csv"],
  },
  {
    name: "Interiors",
    description: "Interiors pricing",
    isDefault: false,
    csvFiles: [
      "replit_INTERIORS_CSV_OFFICAL__1772688825279.csv",
      "replit_INTERIORS_CSV_OFFICAL_1771795542674.csv",
    ],
  },
  {
    name: "Comer & King",
    description: "Comer & King pricing",
    isDefault: false,
    csvFiles: ["COMER_&_KING_CUSTOM_INSERT_PRICES_OFFICAL_1772688867711.csv"],
  },
  {
    name: "Castle & Things",
    description: "Castle & Things pricing",
    isDefault: false,
    csvFiles: [
      "CASTLE_&_THINGS_OFFICAL__1772688878486.csv",
      "CASTLE_&_THINGS_OFFICAL__1771986640733.csv",
    ],
    categoryNorm: (cat) => {
      if (cat === "KHAKI BLANKET" || cat === "SILVER BLANKET") return "BLANKET";
      return cat;
    },
  },
  {
    name: "The Bedroom",
    description: "The Bedroom pricing",
    isDefault: false,
    csvFiles: [
      "Price_for_replit_the_bedroom_CSV_offical_1772688886226.csv",
      "Price_for_replit_the_bedroom_CSV_offical_1771797736638.csv",
    ],
  },
  {
    name: "Space Craft",
    description: "Space Craft pricing",
    isDefault: false,
    csvFiles: [
      "prices_for_replit_space_craft_CSV_OFFICAL_1772688893209.csv",
      "prices_for_replit_space_craft_CSV_OFFICAL_1771797487577.csv",
    ],
  },
  {
    name: "Pearls Manchester",
    description: "Pearls Manchester pricing",
    isDefault: false,
    csvFiles: ["PEARLS_MANCHESTER_OFFICAL_1773200416713.csv"],
    csvStartRow: 2,
    swapSkuCategory: true,
  },
  {
    name: "Highgate Inserts",
    description: "Highgate Inserts pricing",
    isDefault: false,
    csvFiles: ["HIGHGATE_INSERTS_OFFICAL__1773274327476.csv"],
  },
  {
    name: "15% Duck Down Inserts",
    description: "15% Duck Down Inserts pricing",
    isDefault: false,
    csvFiles: ["15%_DUCK_DOWN_INSERTS_OFFICAL_1773358738971.csv"],
    allowedCategories: ["15 % INSERTS"],
  },
];

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

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, "").replace(/\.\./g, ".").trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

async function importOnePriceList(config: PriceListConfig): Promise<void> {
  const cwd = process.cwd();

  const csvPath = config.csvFiles
    .map((f) => path.join(cwd, "attached_assets", f))
    .find((p) => fs.existsSync(p));

  if (!csvPath) {
    console.log(`[${config.name}] CSV not found, skipping`);
    return;
  }

  const defaultNorm = (cat: string) => cat.trim().toUpperCase();
  const normCategory = config.categoryNorm
    ? (cat: string) => config.categoryNorm!(cat.trim().toUpperCase())
    : defaultNorm;

  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  const startRow = config.csvStartRow ?? 1;
  let rows: CsvRow[] = [];
  for (let i = startRow; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 6) continue;
    const productName = fields[0].trim().replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!productName) continue;
    const rawCategoryField = config.swapSkuCategory ? fields[2] : fields[1];
    const rawSkuField = config.swapSkuCategory ? fields[1] : fields[2];
    const category = normCategory(rawCategoryField);
    const sku = rawSkuField.trim();
    const filling = fields[3].trim();
    const weight = fields[4].trim();
    const price = parsePrice(fields[5]);
    rows.push({ productName, category, sku, filling, weight, price: price !== null && !isNaN(price) ? price : null });
  }

  console.log(`[${config.name}] Parsed ${rows.length} rows from CSV`);

  // Filter to only allowed categories if specified
  if (config.allowedCategories && config.allowedCategories.length > 0) {
    const allowed = new Set(config.allowedCategories.map(c => c.toUpperCase().trim()));
    const before = rows.length;
    rows = rows.filter(r => allowed.has(r.category.toUpperCase().trim()));
    if (rows.length !== before) {
      console.log(`[${config.name}] Category filter: kept ${rows.length}/${before} rows (allowed: ${config.allowedCategories.join(", ")})`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let priceListId: string;
    const existingPL = await client.query("SELECT id FROM price_lists WHERE name = $1", [config.name]);
    if (existingPL.rows.length > 0) {
      priceListId = existingPL.rows[0].id;
      const existingPrices = await client.query(
        "SELECT COUNT(*) as cnt FROM price_list_prices WHERE price_list_id = $1",
        [priceListId]
      );
      if (parseInt(existingPrices.rows[0].cnt) >= rows.length) {
        console.log(`[${config.name}] Already imported (${existingPrices.rows[0].cnt} prices), skipping`);
        await client.query("ROLLBACK");
        return;
      }
    } else {
      const newPL = await client.query(
        "INSERT INTO price_lists (name, description, is_default) VALUES ($1, $2, $3) RETURNING id",
        [config.name, config.description, config.isDefault]
      );
      priceListId = newPL.rows[0].id;
    }

    const productsResult = await client.query("SELECT id, name, category, sku FROM products");
    const productByName = new Map<string, any>();
    const productBySku = new Map<string, any>();
    for (const p of productsResult.rows) {
      const key = `${p.name.trim().toUpperCase()}|||${(p.category || "").trim().toUpperCase()}`;
      productByName.set(key, p);
      if (p.sku) productBySku.set(p.sku.trim().toUpperCase(), p);
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

      if (!product && groupRows[0].sku) {
        product = productBySku.get(groupRows[0].sku.toUpperCase());
      }

      if (!product) {
        const firstRow = groupRows[0];
        const hasVariants = groupRows.length > 1;
        const basePrice = hasVariants ? "0.00" : (firstRow.price?.toFixed(2) || "0.00");
        const generatedSku = firstRow.sku || `AUTO-${Date.now()}-${newProductCount}`;
        const result = await client.query(
          `INSERT INTO products (id, sku, name, category, unit_price, active)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, true)
           ON CONFLICT (sku) DO UPDATE SET name = products.name
           RETURNING id, name, category, sku`,
          [generatedSku, name, category, basePrice]
        );
        product = result.rows[0];
        productByName.set(lookupKey, product);
        if (product.sku) productBySku.set(product.sku.toUpperCase(), product);
        newProductCount++;
      }

      // RULE: Never import any product with "HIGHGATE" in its category or SKU (HG##) into any price list other than "Highgate Inserts"
      const prodCatUpper = (product.category || "").toUpperCase();
      const prodSkuUpper = (product.sku || "").toUpperCase();
      if (
        config.name.toLowerCase() !== "highgate inserts" &&
        (prodCatUpper.includes("HIGHGATE") || /^HG\d+$/.test(prodSkuUpper))
      ) {
        skippedCount += groupRows.length;
        continue;
      }

      for (const row of groupRows) {
        if (row.price === null || row.price === 0) {
          skippedCount++;
          continue;
        }
        try {
          await client.query(
            `INSERT INTO price_list_prices (id, price_list_id, product_id, sku, filling, weight, unit_price)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [priceListId, product.id, row.sku || null, row.filling || null, row.weight || null, row.price.toFixed(2)]
          );
          insertedCount++;
        } catch {
          skippedCount++;
        }
      }
    }

    await client.query("COMMIT");
    console.log(`[${config.name}] Done: ${insertedCount} inserted, ${skippedCount} skipped, ${newProductCount} new products`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`[${config.name}] Import error:`, error);
  } finally {
    client.release();
  }
}

export async function importAllPriceLists(): Promise<void> {
  console.log("Starting price list import for all 19 lists...");
  for (const config of PRICE_LISTS) {
    try {
      await importOnePriceList(config);
    } catch (error) {
      console.error(`[${config.name}] Failed:`, error);
    }
  }
  console.log("Price list import complete.");
}

if (process.argv[1]?.includes("import-all-price-lists")) {
  importAllPriceLists()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
