import { db } from "./server/db";
import { emails } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as cheerio from "cheerio";

async function test() {
  const [email] = await db.select().from(emails).where(eq(emails.id, "28d0cd7b-6b49-4fc9-abb7-89da275ea400"));
  if (!email?.bodyHtml) { console.log("No email"); process.exit(1); }
  const $ = cheerio.load(email.bodyHtml);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  
  // Look for order header
  const orderMatch = bodyText.match(/([\w\s]+)\s+placed order\s+#?(\d+)\s+on\s+([^.]+)/i);
  console.log("Order header:", orderMatch ? orderMatch[0] : "NOT FOUND");
  
  // Look for product items - search all tables for content
  $("table").each((i, table) => {
    const text = $(table).text().replace(/\s+/g, " ").trim();
    if (text.length > 20 && text.length < 500) {
      if (text.includes("$") || text.includes("Qty")) {
        console.log(`\nTable ${i} (${text.length} chars): ${text.substring(0, 200)}`);
      }
    }
  });

  // Look for specific patterns
  const paymentMatch = bodyText.match(/Payment processing method\s+(.+?)(?=Delivery|Shipping|$)/i);
  console.log("\nPayment:", paymentMatch ? paymentMatch[1].substring(0, 50) : "NOT FOUND");
  
  const deliveryMatch = bodyText.match(/Delivery method\s+(.+?)(?=Shipping|Payment|$)/i);
  console.log("Delivery:", deliveryMatch ? deliveryMatch[1].substring(0, 50) : "NOT FOUND");
  
  const addressMatch = bodyText.match(/Shipping address\s+(.+?)(?=Payment|Delivery|Billing|$)/i);
  console.log("Address:", addressMatch ? addressMatch[1].substring(0, 100) : "NOT FOUND");
  
  // Print a chunk of the body text to understand structure
  const subtotalIdx = bodyText.indexOf("Subtotal");
  if (subtotalIdx > -1) {
    console.log("\nAround subtotal:", bodyText.substring(subtotalIdx, subtotalIdx + 200));
  }

  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
