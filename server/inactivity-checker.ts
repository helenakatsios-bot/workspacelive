import { pool } from "./db";
import { refreshOutlookTokenIfNeeded, sendEmail } from "./outlook";
import { db } from "./db";
import { outlookTokens } from "@shared/schema";

let inactivityInterval: ReturnType<typeof setInterval> | null = null;

async function checkAndSendInactivityAlerts(redirectUri: string) {
  try {
    const days = 60;

    const result = await pool.query(`
      SELECT 
        c.legal_name,
        c.trading_name,
        c.client_grade,
        c.total_revenue::float as total_revenue,
        MAX(o.order_date) as last_order_date,
        ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(o.order_date))) / 86400)::int as days_inactive
      FROM companies c
      INNER JOIN orders o ON o.company_id = c.id AND o.status NOT IN ('cancelled')
      GROUP BY c.id, c.legal_name, c.trading_name, c.client_grade, c.total_revenue
      HAVING EXTRACT(EPOCH FROM (NOW() - MAX(o.order_date))) / 86400 >= $1
      ORDER BY MAX(o.order_date) ASC
    `, [days]);

    if (result.rows.length === 0) {
      console.log("[INACTIVITY-CHECK] No inactive customers found (60+ days)");
      return;
    }

    const allTokens = await db.select().from(outlookTokens).limit(1);
    if (allTokens.length === 0) {
      console.log("[INACTIVITY-CHECK] Outlook not connected - skipping email alert");
      return;
    }

    const tokenUserId = allTokens[0].userId;
    const accessToken = await refreshOutlookTokenIfNeeded(tokenUserId, redirectUri);
    if (!accessToken) {
      console.log("[INACTIVITY-CHECK] Outlook token expired - skipping email alert");
      return;
    }

    const customerRows = result.rows.map((r: any) => {
      const name = r.trading_name || r.legal_name;
      const lastOrder = r.last_order_date ? new Date(r.last_order_date).toLocaleDateString('en-AU') : 'N/A';
      const revenue = r.total_revenue ? `$${Number(r.total_revenue).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : '$0.00';
      return `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${name}</td><td style="padding:8px;border-bottom:1px solid #eee;">${r.client_grade || '-'}</td><td style="padding:8px;border-bottom:1px solid #eee;">${revenue}</td><td style="padding:8px;border-bottom:1px solid #eee;">${lastOrder}</td><td style="padding:8px;border-bottom:1px solid #eee;color:#dc2626;font-weight:600;">${r.days_inactive} days</td></tr>`;
    }).join("");

    const emailBody = `
      <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
        <h2 style="color:#1a1a1a;">Daily Customer Inactivity Alert</h2>
        <p style="color:#666;">The following <strong>${result.rows.length}</strong> customer(s) have not placed an order in <strong>${days}+ days</strong>. Consider reaching out to re-engage them.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead>
            <tr style="background:#f8f8f8;">
              <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Customer</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Grade</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Revenue</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Last Order</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Inactive</th>
            </tr>
          </thead>
          <tbody>${customerRows}</tbody>
        </table>
        <p style="color:#888;margin-top:20px;font-size:12px;">This is an automated daily alert from Purax CRM - Customer Success</p>
      </div>
    `;

    const recipients = ["helena@purax.com.au", "michele@purax.com.au"];
    await sendEmail(
      accessToken,
      recipients,
      `Daily Inactivity Alert - ${result.rows.length} customer(s) inactive ${days}+ days`,
      emailBody
    );

    console.log(`[INACTIVITY-CHECK] Alert sent to ${recipients.join(", ")} for ${result.rows.length} inactive customer(s)`);
  } catch (error) {
    console.error("[INACTIVITY-CHECK] Error checking inactivity:", error);
  }
}

export function startInactivityChecker(redirectUri: string) {
  if (inactivityInterval) {
    clearInterval(inactivityInterval);
  }

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  setTimeout(() => {
    checkAndSendInactivityAlerts(redirectUri);
  }, 60 * 1000);

  inactivityInterval = setInterval(() => {
    checkAndSendInactivityAlerts(redirectUri);
  }, TWENTY_FOUR_HOURS);

  console.log("[INACTIVITY-CHECK] Daily inactivity checker started (runs every 24 hours)");
}
