import { db } from "./server/db";
import { emails } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as cheerio from "cheerio";

async function test() {
  // Get order 3345's source email
  const [email] = await db.select().from(emails).where(eq(emails.id, "28d0cd7b-6b49-4fc9-abb7-89da275ea400"));
  if (!email?.bodyHtml) { console.log("No email"); process.exit(1); }
  
  const $ = cheerio.load(email.bodyHtml);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  
  // Find shipping address section
  const addressMatch = bodyText.match(/Shipping address\s+(.+?)(?=Payment processing|Billing address|$)/i);
  console.log("Address match:", addressMatch ? addressMatch[1].substring(0, 200) : "NOT FOUND");
  
  // Also check for phone
  const phoneMatch = bodyText.match(/(\+?\d[\d\s]{8,}\d)/);
  console.log("Phone match:", phoneMatch ? phoneMatch[1] : "NOT FOUND");
  
  // Print area around "Shipping address"
  const idx = bodyText.indexOf("Shipping address");
  if (idx > -1) {
    console.log("\n--- Text around 'Shipping address' ---");
    console.log(bodyText.substring(idx, idx + 300));
  }
  
  // Also look for the specific order 3345
  const [email2] = await db.select().from(emails).where(eq(emails.subject, "%3345%")).catch(() => [null]);
  
  // Get all emails with "placed order" to find #3345
  const allEmails = await db.select({ id: emails.id, subject: emails.subject }).from(emails);
  const order3345 = allEmails.find(e => e.subject?.includes("3345"));
  console.log("\nOrder 3345 email:", order3345 ? order3345.id : "NOT FOUND");
  
  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
