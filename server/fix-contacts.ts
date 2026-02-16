import { pool } from "./db";
import fs from "fs";
import path from "path";

async function fixContacts() {
  const filePath = path.join(process.cwd(), "attached_assets", "Pasted-ABBEY-GOVAN-accounts-homecrafttextiles-com-au-HOME-CRAF_1771214917387.txt");
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split("\n").filter(line => line.trim().length > 0);

  console.log(`Parsed ${lines.length} lines from mapping file\n`);

  let successCount = 0;
  let noContactCount = 0;
  let noCompanyCount = 0;
  let errorCount = 0;
  const unmatchedCompanies: string[] = [];
  const unmatchedContacts: string[] = [];

  for (const line of lines) {
    const parts = line.split("\t");

    let firstName = "";
    let lastName = "";
    let email = "";
    let phone = "";
    let companyName = "";

    if (parts.length >= 6) {
      firstName = parts[0].trim();
      lastName = parts[1].trim();
      email = parts[2].trim();
      phone = parts[3].trim();
      companyName = parts[5].trim();
    } else if (parts.length === 5) {
      firstName = parts[0].trim();
      lastName = parts[1].trim();
      email = parts[2].trim();
      phone = parts[3].trim();
      companyName = parts[4].trim();
    } else {
      console.log(`SKIP: Could not parse line: ${line}`);
      errorCount++;
      continue;
    }

    if (!email) {
      console.log(`SKIP: No email found in line: ${line}`);
      errorCount++;
      continue;
    }

    if (!companyName) {
      console.log(`SKIP: No company name found for email: ${email}`);
      errorCount++;
      continue;
    }

    const contactResult = await pool.query(
      `SELECT id, company_id, first_name, last_name, phone FROM contacts WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (contactResult.rows.length === 0) {
      console.log(`NO CONTACT: No contact found with email: ${email}`);
      unmatchedContacts.push(email);
      noContactCount++;
      continue;
    }

    const contact = contactResult.rows[0];

    const companySearchName = companyName;
    const ampVariant = companyName.replace(/&/g, "&amp;");

    const companyResult = await pool.query(
      `SELECT id, legal_name, trading_name FROM companies 
       WHERE legal_name ILIKE $1 OR trading_name ILIKE $1
       OR legal_name ILIKE $2 OR trading_name ILIKE $2`,
      [companySearchName, ampVariant]
    );

    if (companyResult.rows.length === 0) {
      console.log(`NO COMPANY: No company found matching "${companyName}" for contact ${email}`);
      unmatchedCompanies.push(`${companyName} (${email})`);
      noCompanyCount++;
      continue;
    }

    const company = companyResult.rows[0];

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    updates.push(`company_id = $${paramIndex}`);
    values.push(company.id);
    paramIndex++;

    if (firstName) {
      updates.push(`first_name = $${paramIndex}`);
      values.push(firstName);
      paramIndex++;
    }

    if (lastName) {
      updates.push(`last_name = $${paramIndex}`);
      values.push(lastName);
      paramIndex++;
    }

    if (phone) {
      updates.push(`phone = $${paramIndex}`);
      values.push(phone);
      paramIndex++;
    }

    values.push(contact.id);

    const updateQuery = `UPDATE contacts SET ${updates.join(", ")} WHERE id = $${paramIndex}`;

    try {
      await pool.query(updateQuery, values);
      console.log(`SUCCESS: Updated contact ${email} -> company "${company.legal_name || company.trading_name}" (${company.id})`);
      successCount++;
    } catch (err: any) {
      console.log(`ERROR: Failed to update contact ${email}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Total lines processed: ${lines.length}`);
  console.log(`Successful updates: ${successCount}`);
  console.log(`No contact found: ${noContactCount}`);
  console.log(`No company found: ${noCompanyCount}`);
  console.log(`Errors/skipped: ${errorCount}`);

  if (unmatchedCompanies.length > 0) {
    console.log(`\n--- Unmatched Companies ---`);
    unmatchedCompanies.forEach(c => console.log(`  ${c}`));
  }

  if (unmatchedContacts.length > 0) {
    console.log(`\n--- Unmatched Contacts (by email) ---`);
    unmatchedContacts.forEach(e => console.log(`  ${e}`));
  }

  await pool.end();
  process.exit(0);
}

fixContacts().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
