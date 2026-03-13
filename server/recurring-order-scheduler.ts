import { pool, db } from "./db";
import { outlookTokens } from "@shared/schema";
import { refreshOutlookTokenIfNeeded, sendEmail } from "./outlook";
import { storage } from "./storage";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

function parseTemplates(raw: any, legacyWeeks?: number, legacyLastPlaced?: string | null): any[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [];
  if (arr.length === 0) return [];
  if (arr[0] && "productId" in arr[0]) {
    return [{ id: "default", name: "Regular Order", intervalWeeks: legacyWeeks ?? 2, lastPlaced: legacyLastPlaced || null, items: arr }];
  }
  return arr;
}

function isDue(lastPlaced: string | null, intervalWeeks: number): boolean {
  if (!lastPlaced) return false;
  const last = new Date(lastPlaced);
  if (isNaN(last.getTime())) return false;
  const nextDue = new Date(last.getTime() + intervalWeeks * 7 * 24 * 60 * 60 * 1000);
  return new Date() >= nextDue;
}

async function buildPriceMap(companyPriceListId: string | null): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();

  // Load all price list prices as a base fallback
  const allPrices = await pool.query(
    `SELECT product_id, filling, weight, unit_price FROM price_list_prices ORDER BY price_list_id`
  );
  for (const row of allPrices.rows) {
    const key = `${row.product_id}|${row.filling || ""}|${row.weight || ""}`;
    if (!priceMap.has(key)) priceMap.set(key, parseFloat(row.unit_price));
    if (!priceMap.has(row.product_id)) priceMap.set(row.product_id, parseFloat(row.unit_price));
  }

  // Determine effective price list
  let effectivePriceListId = companyPriceListId;
  if (!effectivePriceListId) {
    const stdList = await pool.query(`SELECT id FROM price_lists WHERE LOWER(name) = 'standard' LIMIT 1`);
    if (stdList.rows.length > 0) effectivePriceListId = stdList.rows[0].id;
  }

  // Override with company-specific prices
  if (effectivePriceListId) {
    const plPrices = await pool.query(
      `SELECT product_id, filling, weight, unit_price FROM price_list_prices WHERE price_list_id = $1`,
      [effectivePriceListId]
    );
    for (const row of plPrices.rows) {
      const key = `${row.product_id}|${row.filling || ""}|${row.weight || ""}`;
      priceMap.set(key, parseFloat(row.unit_price));
      priceMap.set(row.product_id, parseFloat(row.unit_price));
    }
  }

  return priceMap;
}

async function processRecurringOrders() {
  console.log("[RECURRING-SCHEDULER] Checking for due recurring orders...");
  try {
    // Get all portal users with recurring templates
    const result = await pool.query(`
      SELECT 
        pu.id, pu.name, pu.email,
        pu.recurring_items, pu.recurring_interval_weeks, pu.recurring_last_placed,
        c.id as company_id, c.legal_name, c.trading_name,
        c.shipping_address, c.billing_address, c.phone,
        c.price_list_id
      FROM portal_users pu
      JOIN companies c ON c.id = pu.company_id
      WHERE pu.active = true
        AND pu.recurring_items IS NOT NULL
    `);

    let placedCount = 0;

    for (const row of result.rows) {
      const templates = parseTemplates(
        row.recurring_items,
        row.recurring_interval_weeks,
        row.recurring_last_placed
      );

      const companyName = row.trading_name || row.legal_name || "Unknown";
      const priceMap = await buildPriceMap(row.price_list_id);

      for (const template of templates) {
        if (!isDue(template.lastPlaced, template.intervalWeeks || 2)) continue;

        const templateItems: any[] = template.items || [];
        if (templateItems.length === 0) continue;

        console.log(`[RECURRING-SCHEDULER] Placing auto order for ${companyName} — template "${template.name}"`);

        // Build order items with live pricing
        const orderItems: any[] = [];
        for (const item of templateItems) {
          if (!item.productId) continue;
          const prodResult = await pool.query(
            "SELECT id, name, sku, unit_price FROM products WHERE id = $1 AND active = true",
            [item.productId]
          );
          if (prodResult.rows.length === 0) continue;
          const prod = prodResult.rows[0];
          const qty = Math.max(1, parseInt(item.quantity) || 1);
          const desc = item.filling
            ? `${prod.name} (${item.filling}${item.weight ? `, ${item.weight}` : ""})`
            : prod.name;
          const variantKey = `${prod.id}|${item.filling || ""}|${item.weight || ""}`;
          const unitPrice =
            priceMap.get(variantKey) ??
            priceMap.get(prod.id) ??
            parseFloat(prod.unit_price || "0");
          const lineTotal = Math.round(qty * unitPrice * 100) / 100;
          orderItems.push({
            productId: prod.id,
            productName: desc,
            sku: prod.sku,
            quantity: qty,
            unitPrice: unitPrice.toFixed(2),
            lineTotal: lineTotal.toFixed(2),
            filling: item.filling || undefined,
            weight: item.weight || undefined,
          });
        }

        if (orderItems.length === 0) continue;

        const today = new Date().toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        const customerNotes = `🔁 Recurring order — "${template.name}" (auto-placed ${today})`;
        const shippingAddress = row.shipping_address || row.billing_address || null;

        // Create the order request
        await storage.createCustomerOrderRequest({
          companyName,
          contactName: row.name || companyName,
          contactEmail: row.email || "",
          contactPhone: row.phone || null,
          shippingAddress,
          customerNotes,
          items: orderItems,
          status: "pending",
          convertedOrderId: null,
          reviewedBy: null,
        });

        // Update lastPlaced on the template to now
        const updatedTemplates = templates.map((t: any) =>
          t.id === template.id ? { ...t, lastPlaced: new Date().toISOString() } : t
        );
        await pool.query(
          `UPDATE portal_users SET recurring_items = $1 WHERE id = $2`,
          [JSON.stringify(updatedTemplates), row.id]
        );

        placedCount++;

        // Send staff email notification
        try {
          const notificationEmailSetting = await storage.getSetting("notification_email");
          if (notificationEmailSetting) {
            const recipientEmails = notificationEmailSetting
              .split(",")
              .map((e: string) => e.trim())
              .filter((e: string) => e.length > 0 && e.includes("@"));

            if (recipientEmails.length > 0) {
              const allUsers = await storage.getAllUsers();
              let emailSent = false;
              const redirectUri = "https://purax-crm.replit.app/api/outlook/callback";

              for (const user of allUsers) {
                if (emailSent) break;
                try {
                  const accessToken = await refreshOutlookTokenIfNeeded(user.id, redirectUri);
                  if (accessToken) {
                    const itemsList = orderItems.map((item: any) =>
                      `<tr>
                        <td style="padding:8px;border:1px solid #ddd;">${item.quantity}</td>
                        <td style="padding:8px;border:1px solid #ddd;">${item.productName}</td>
                        <td style="padding:8px;border:1px solid #ddd;">$${parseFloat(item.unitPrice || "0").toFixed(2)}</td>
                        <td style="padding:8px;border:1px solid #ddd;text-align:right;">$${parseFloat(item.lineTotal || "0").toFixed(2)}</td>
                      </tr>`
                    ).join("");
                    const subtotal = orderItems.reduce((s: number, i: any) => s + parseFloat(i.lineTotal || "0"), 0);

                    const emailBody = `
                      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
                        <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
                          <strong style="color:#92400e;">🔁 Auto-Placed Recurring Order</strong>
                          <p style="margin:4px 0 0;color:#78350f;font-size:0.9em;">This order was placed automatically by the system. Please review and forward to Purax (Milo) promptly.</p>
                        </div>
                        <h2 style="color:#1e293b;">Recurring Order from ${companyName}</h2>
                        <p><strong>Template:</strong> ${template.name}</p>
                        <p><strong>Contact:</strong> ${row.name || ""}${row.email ? ` &lt;${row.email}&gt;` : ""}</p>
                        ${shippingAddress ? `<p><strong>Delivery Address:</strong> ${shippingAddress}</p>` : ""}
                        <h3>Items:</h3>
                        <table style="border-collapse:collapse;width:100%;">
                          <tr>
                            <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Qty</th>
                            <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Product</th>
                            <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Unit Price</th>
                            <th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;text-align:right;">Total</th>
                          </tr>
                          ${itemsList}
                        </table>
                        <p style="margin-top:12px;text-align:right;font-size:1.1em;"><strong>Order Total: $${subtotal.toFixed(2)}</strong></p>
                        <p style="margin-top:16px;color:#64748b;font-size:0.9em;">Log in to the CRM to review and convert this to a confirmed order.</p>
                      </div>
                    `;

                    await sendEmail(
                      accessToken,
                      recipientEmails,
                      `🔁 Auto Recurring Order — ${companyName} (${template.name})`,
                      emailBody
                    );
                    emailSent = true;
                    console.log(`[RECURRING-SCHEDULER] Notification sent to ${recipientEmails.join(", ")} for ${companyName}`);
                  }
                } catch (tokenErr) {
                  console.error("[RECURRING-SCHEDULER] Email token error:", tokenErr);
                }
              }
            }
          }
        } catch (emailErr) {
          console.error("[RECURRING-SCHEDULER] Email notification error:", emailErr);
        }
      }
    }

    if (placedCount === 0) {
      console.log("[RECURRING-SCHEDULER] No recurring orders due today.");
    } else {
      console.log(`[RECURRING-SCHEDULER] Auto-placed ${placedCount} recurring order(s).`);
    }
  } catch (error) {
    console.error("[RECURRING-SCHEDULER] Error processing recurring orders:", error);
  }
}

export function startRecurringOrderScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  // Run after 2-minute delay on startup, then every 24 hours
  setTimeout(() => {
    processRecurringOrders();
  }, 2 * 60 * 1000);

  schedulerInterval = setInterval(() => {
    processRecurringOrders();
  }, TWENTY_FOUR_HOURS);

  console.log("[RECURRING-SCHEDULER] Automatic recurring order scheduler started (runs every 24 hours)");
}
