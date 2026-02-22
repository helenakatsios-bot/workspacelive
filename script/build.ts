import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, copyFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@azure/msal-node",
  "@google/generative-ai",
  "@microsoft/microsoft-graph-client",
  "axios",
  "bcrypt",
  "bcryptjs",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pdfkit",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xero-node",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Copy data files for production sync
  await mkdir("dist/data", { recursive: true });
  await copyFile("server/data/products.json", "dist/data/products.json");
  await copyFile("server/data/companies.json", "dist/data/companies.json");
  console.log("copied data files to dist/data/");

  // Copy standard price list CSV for production import
  try {
    await copyFile("server/standard-pricelist.csv", "dist/standard-pricelist.csv");
    console.log("copied standard-pricelist.csv to dist/");
  } catch (e) {
    console.log("standard-pricelist.csv not found, skipping");
  }

  // Copy PDFKit font data files for production PDF generation
  const { readdirSync } = await import("fs");
  const pdfkitDataDir = "node_modules/pdfkit/js/data";
  const afmFiles = readdirSync(pdfkitDataDir).filter((f: string) => f.endsWith(".afm"));
  for (const file of afmFiles) {
    await copyFile(`${pdfkitDataDir}/${file}`, `dist/data/${file}`);
  }
  console.log(`copied ${afmFiles.length} PDFKit font files to dist/data/`);
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
