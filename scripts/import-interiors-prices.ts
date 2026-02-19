import fs from 'fs';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

interface CsvRow {
  productName: string;
  sku: string;
  filling: string;
  weight: string;
  price: number;
  category: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split('\n').filter(l => l.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { parts.push(current); current = ''; continue; }
      current += ch;
    }
    parts.push(current);

    const productName = (parts[0] || '').trim();
    const sku = (parts[1] || '').trim();
    const category = (parts[3] || '').trim();
    const filling = (parts[4] || '').trim();
    const weight = (parts[5] || '').trim();
    const priceStr = (parts[6] || '').trim().replace('$', '').replace(',', '').trim();
    const price = parseFloat(priceStr);

    if (!productName || isNaN(price) || price <= 0) continue;
    rows.push({ productName, sku, filling, weight, price, category });
  }
  return rows;
}

const NAME_MAPPINGS: Record<string, string> = {
  '100% DUCK FEATHER': '100% FEATHER',
  '15% DUCK DOWN 85% DUCK FEATHER': '15% DOWN 85% FEATHER',
  '30% DUCK DOWN 70% DUCK FEATHER': '30% DOWN 70% FEATHER',
  '50% DUCK DOWN 50% DUCK FEATHER': '50% DOWN 50% FEATHER',
  '80% DUCK DOWN 20% DUCK FEATHER': '80% DOWN 20% FEATHER',
  'SINGLE - 50% DUCK WINTER FILLED': 'SINGLE - 50% WINTER FILLED',
  'DOUBLE - 50% DUCK WINTER FILLED': 'DOUBLE - 50% WINTER FILLED',
  'QUEEN - 50% DUCK WINTER FILLED': 'QUEEN - 50% WINTER FILLED',
  'KING - 50% DUCK WINTER FILLED': 'KING - 50% WINTER FILLED',
  'SUPER KING - 50% DUCK WINTER FILLED': 'SUPER KING - 50% WINTER FILLED',
  '65 X 65CM (68X68CM) - PIPED PILLOWS': '65X65CM (68X68CM) - PIPED PILLOWS',
  'Single/ King Single 180 x 230gms 300gms - SILVER BLANKET': 'SINGLE/KING SINGLE 180X230CMS 300GMS - SILVER BLANKET',
  'Double/Queen 230 x 240cms 450gms - SILVER BLANKET': 'DOUBLE/QUEEN 230X240CMS 450GMS - SILVER BLANKET',
  'King/Super King 270 x 240cms 535 gms - SILVER BLANKET': 'KING/SUPER KING 270X240CMS 535GMS - SILVER BLANKET',
  'Single/ King Single 180 x 230gms 300gms - KHAKI BLANKET': 'SINGLE/KING SINGLE 180X230CMS 300GMS - KHAKI BLANKET',
  'Double/Queen 230 x 240cms 450gms - KHAKI BLANKET': 'DOUBLE/QUEEN 230X240CMS 450GMS - KHAKI BLANKET',
  'King/Super King 270 x 240cms 535 gms - KHAKI BLANKET': 'KING/SUPER KING 270X240CMS 535GMS - KHAKI BLANKET',
};

async function main() {
  const csvContent = fs.readFileSync('attached_assets/ALL_PRODUCTS_replit_INTERIORS_CSV_new_1771542056032.csv', 'utf-8');
  const rows = parseCsv(csvContent);
  console.log(`Parsed ${rows.length} price rows from CSV`);

  const { rows: interiorsRows } = await pool.query(`SELECT id FROM price_lists WHERE name = 'Interiors'`);
  if (interiorsRows.length === 0) {
    console.error('Interiors price list not found');
    process.exit(1);
  }
  const priceListId = interiorsRows[0].id;
  console.log(`Interiors price list ID: ${priceListId}`);

  const { rows: products } = await pool.query(`SELECT id, name, sku FROM products ORDER BY name`);
  console.log(`Found ${products.length} products in database`);

  const productByName: Record<string, { id: string; name: string }> = {};
  const productBySku: Record<string, { id: string; name: string }> = {};
  for (const p of products) {
    productByName[p.name.toUpperCase().trim()] = p;
    if (p.sku) productBySku[p.sku.toUpperCase().trim()] = p;
  }

  await pool.query(`DELETE FROM price_list_prices WHERE price_list_id = $1`, [priceListId]);
  console.log('Cleared existing Interiors prices');

  let inserted = 0;
  let skipped = 0;
  const notFound: string[] = [];

  for (const row of rows) {
    let csvName = row.productName.toUpperCase().trim();
    const mappedName = NAME_MAPPINGS[row.productName.trim()];
    if (mappedName) csvName = mappedName.toUpperCase();

    let product = productByName[csvName];
    if (!product && row.sku) {
      product = productBySku[row.sku.toUpperCase().trim()];
    }
    if (!product) {
      if (!notFound.includes(row.productName)) {
        notFound.push(row.productName);
      }
      skipped++;
      continue;
    }

    const filling = row.filling || null;
    const weight = row.weight || null;

    await pool.query(
      `INSERT INTO price_list_prices (id, price_list_id, product_id, filling, weight, unit_price)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [priceListId, product.id, filling, weight, row.price.toFixed(2)]
    );
    inserted++;
  }

  console.log(`\nResults:`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped: ${skipped}`);
  if (notFound.length > 0) {
    console.log(`\nProducts not found in database (${notFound.length}):`);
    for (const name of notFound) {
      console.log(`  - "${name}"`);
    }
  }

  await pool.end();
}

main().catch(console.error);
