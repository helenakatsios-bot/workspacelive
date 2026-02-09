import { db } from "./db";
import { companies, contacts } from "@shared/schema";
import { ilike, sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

interface CsvContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  associatedCompany: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function extractDomainKeywords(email: string): string[] {
  if (!email) return [];
  const domain = email.split("@")[1];
  if (!domain) return [];
  const baseDomain = domain.split(".")[0];
  const keywords = baseDomain
    .replace(/[^a-zA-Z]/g, " ")
    .split(/\s+/)
    .filter(k => k.length > 2);
  return keywords;
}

function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(ptyltd|ptylimited|pty|ltd|limited|cod|inc|corp|au|com|net)/g, "");
}

async function importContacts() {
  const csvPath = path.join(process.cwd(), "attached_assets/hubspot-crm-exports-all-contacts-2026-02-10_1770680837777.csv");
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());
  
  const allCompanies = await db.select().from(companies);
  console.log(`Found ${allCompanies.length} companies in database`);
  
  const companyLookup = new Map<string, typeof allCompanies[0]>();
  for (const company of allCompanies) {
    const normalizedLegal = normalizeForMatch(company.legalName);
    const normalizedTrading = company.tradingName ? normalizeForMatch(company.tradingName) : "";
    companyLookup.set(normalizedLegal, company);
    if (normalizedTrading && normalizedTrading !== normalizedLegal) {
      companyLookup.set(normalizedTrading, company);
    }
  }

  const existingContacts = await db.select().from(contacts);
  const existingEmails = new Set(existingContacts.map(c => c.email?.toLowerCase()));
  
  let imported = 0;
  let matched = 0;
  let unmatched = 0;
  let skipped = 0;
  const unmatchedList: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 4) continue;
    
    const contact: CsvContact = {
      firstName: fields[1] || "",
      lastName: fields[2] || "",
      email: fields[3] || "",
      phone: fields[4] || "",
      associatedCompany: fields[11] || "",
    };

    if (!contact.email) continue;
    if (existingEmails.has(contact.email.toLowerCase())) {
      skipped++;
      continue;
    }

    let matchedCompany: typeof allCompanies[0] | null = null;

    const emailDomain = contact.email.split("@")[1] || "";
    const domainBase = emailDomain.split(".")[0];
    
    if (domainBase && !["gmail", "hotmail", "yahoo", "outlook", "bigpond", "live", "icloud", "y7mail", "ozemail", "iinet", "westnet", "optusnet", "tpg", "netspace", "aapt", "me", "rocketmail"].includes(domainBase.toLowerCase())) {
      const normalizedDomain = normalizeForMatch(domainBase);
      
      for (const company of allCompanies) {
        const normalizedLegal = normalizeForMatch(company.legalName);
        const normalizedTrading = company.tradingName ? normalizeForMatch(company.tradingName) : "";
        
        if (normalizedLegal.includes(normalizedDomain) || normalizedDomain.includes(normalizedLegal) ||
            (normalizedTrading && (normalizedTrading.includes(normalizedDomain) || normalizedDomain.includes(normalizedTrading)))) {
          matchedCompany = company;
          break;
        }
      }
    }

    if (!matchedCompany && contact.associatedCompany) {
      const normalizedAssoc = normalizeForMatch(contact.associatedCompany);
      matchedCompany = companyLookup.get(normalizedAssoc) || null;
    }

    if (matchedCompany) {
      try {
        await db.insert(contacts).values({
          companyId: matchedCompany.id,
          firstName: contact.firstName || contact.email.split("@")[0],
          lastName: contact.lastName || "",
          email: contact.email,
          phone: contact.phone || null,
        });
        matched++;
        imported++;
        existingEmails.add(contact.email.toLowerCase());
      } catch (err: any) {
        console.error(`Error importing ${contact.email}: ${err.message}`);
      }
    } else {
      unmatched++;
      unmatchedList.push(`${contact.firstName} ${contact.lastName} <${contact.email}>`);
    }
  }

  console.log(`\nImport Summary:`);
  console.log(`  Total contacts in CSV: ${lines.length - 1}`);
  console.log(`  Matched & imported: ${matched}`);
  console.log(`  Unmatched (no company found): ${unmatched}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  
  if (unmatchedList.length > 0 && unmatchedList.length <= 50) {
    console.log(`\nUnmatched contacts:`);
    unmatchedList.forEach(c => console.log(`  - ${c}`));
  } else if (unmatchedList.length > 50) {
    console.log(`\n${unmatchedList.length} unmatched contacts (too many to list)`);
  }
}

importContacts()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  });
