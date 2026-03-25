import { XeroClient, Contact as XeroContact, Invoice as XeroInvoice, LineItem, Invoices } from "xero-node";
import { db } from "./db";
import { xeroTokens, xeroSyncMapping, companies, contacts, invoices, orders, orderLines, crmSettings } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;

if (!XERO_CLIENT_ID || !XERO_CLIENT_SECRET) {
  console.warn("Xero credentials not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET.");
}

// Xero OAuth scopes needed for our integration
const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "accounting.contacts",
  "accounting.contacts.read",
  "accounting.transactions",
  "accounting.transactions.read",
  "offline_access",
].join(" ");

export function createXeroClient(redirectUri: string) {
  return new XeroClient({
    clientId: XERO_CLIENT_ID!,
    clientSecret: XERO_CLIENT_SECRET!,
    redirectUris: [redirectUri],
    scopes: XERO_SCOPES.split(" "),
  });
}

export async function getStoredToken() {
  const [token] = await db.select().from(xeroTokens).orderBy(desc(xeroTokens.updatedAt)).limit(1);
  return token;
}

export async function saveXeroToken(
  tenantId: string,
  tenantName: string | undefined,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date
) {
  // Check if we already have a token for this tenant
  const [existing] = await db.select().from(xeroTokens).where(eq(xeroTokens.tenantId, tenantId));

  if (existing) {
    await db.update(xeroTokens)
      .set({
        accessToken,
        refreshToken,
        expiresAt,
        tenantName,
        updatedAt: new Date(),
      })
      .where(eq(xeroTokens.id, existing.id));
  } else {
    await db.insert(xeroTokens).values({
      tenantId,
      tenantName,
      accessToken,
      refreshToken,
      expiresAt,
    });
  }
}

export async function deleteXeroToken() {
  await db.delete(xeroTokens);
}

export async function getXeroSyncMapping(entityType: string, localId: string) {
  const [mapping] = await db.select()
    .from(xeroSyncMapping)
    .where(and(
      eq(xeroSyncMapping.entityType, entityType),
      eq(xeroSyncMapping.localId, localId)
    ));
  return mapping;
}

export async function getXeroSyncMappingByXeroId(entityType: string, xeroId: string) {
  const [mapping] = await db.select()
    .from(xeroSyncMapping)
    .where(and(
      eq(xeroSyncMapping.entityType, entityType),
      eq(xeroSyncMapping.xeroId, xeroId)
    ));
  return mapping;
}

export async function saveXeroSyncMapping(entityType: string, localId: string, xeroId: string) {
  const existing = await getXeroSyncMapping(entityType, localId);
  if (existing) {
    await db.update(xeroSyncMapping)
      .set({ xeroId, lastSyncedAt: new Date() })
      .where(eq(xeroSyncMapping.id, existing.id));
  } else {
    await db.insert(xeroSyncMapping).values({
      entityType,
      localId,
      xeroId,
    });
  }
}

function parseXeroDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return dateValue;
  const str = String(dateValue);
  const msMatch = str.match(/\/Date\((\d+)([+-]\d+)?\)\//);
  if (msMatch) {
    return new Date(parseInt(msMatch[1]));
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

export async function refreshTokenIfNeeded(xero: XeroClient, token: typeof xeroTokens.$inferSelect) {
  const now = new Date();
  const expiresAt = new Date(token.expiresAt);
  const isExpired = expiresAt.getTime() <= now.getTime();
  const expiresWithin5Min = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
  
  if (isExpired || expiresWithin5Min) {
    console.log(`[XERO] Token ${isExpired ? 'expired' : 'expiring soon'}, attempting refresh via direct API...`);
    try {
      const basicAuth = Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64");
      const refreshResponse = await fetch("https://identity.xero.com/connect/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token.refreshToken,
        }),
      });

      if (!refreshResponse.ok) {
        const errText = await refreshResponse.text();
        console.error("[XERO] Token refresh API error:", refreshResponse.status, errText);
        return false;
      }

      const newTokenSet = await refreshResponse.json() as any;
      
      if (newTokenSet.access_token && newTokenSet.refresh_token) {
        const expiresInSec = newTokenSet.expires_in || 1800;
        const newExpiresAt = new Date(Date.now() + expiresInSec * 1000);
        await saveXeroToken(
          token.tenantId,
          token.tenantName || undefined,
          newTokenSet.access_token,
          newTokenSet.refresh_token,
          newExpiresAt
        );
        console.log("[XERO] Token refreshed successfully via direct API");
        return true;
      }
      console.error("[XERO] Refresh returned empty tokens");
      return false;
    } catch (error: any) {
      console.error("[XERO] Failed to refresh token:", error?.message || error);
      if (error?.response?.body) {
        console.error("[XERO] Error response:", JSON.stringify(error.response.body));
      }
      return false;
    }
  }
  
  xero.setTokenSet({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    token_type: "Bearer",
    scope: XERO_SCOPES,
  });
  
  return true;
}

export async function importContactsFromXero(xero: XeroClient, tenantId: string) {
  const response = await xero.accountingApi.getContacts(tenantId);
  const xeroContacts = response.body.contacts || [];
  
  const imported: { name: string; isNew: boolean }[] = [];
  
  for (const xeroContact of xeroContacts) {
    if (!xeroContact.contactID || !xeroContact.name) continue;
    
    // Check if already synced
    const existing = await getXeroSyncMappingByXeroId("company", xeroContact.contactID);
    
    if (!existing) {
      // Create new company
      const [newCompany] = await db.insert(companies).values({
        legalName: xeroContact.name,
        tradingName: xeroContact.name,
        billingAddress: formatXeroAddress(xeroContact.addresses),
        internalNotes: `Imported from Xero on ${new Date().toLocaleDateString()}`,
      }).returning();
      
      await saveXeroSyncMapping("company", newCompany.id, xeroContact.contactID);
      imported.push({ name: xeroContact.name, isNew: true });
      
      // Import contact persons if available
      if (xeroContact.contactPersons && xeroContact.contactPersons.length > 0) {
        for (const person of xeroContact.contactPersons) {
          if (person.firstName) {
            await db.insert(contacts).values({
              companyId: newCompany.id,
              firstName: person.firstName,
              lastName: person.lastName || "",
              email: person.emailAddress || undefined,
            });
          }
        }
      }
    } else {
      imported.push({ name: xeroContact.name, isNew: false });
    }
  }
  
  return imported;
}

function formatXeroAddress(addresses?: Array<{ addressType?: string; addressLine1?: string; city?: string; region?: string; postalCode?: string; country?: string }>) {
  if (!addresses || addresses.length === 0) return undefined;
  
  const addr = addresses.find(a => a.addressType === "POBOX") || addresses[0];
  const parts = [
    addr.addressLine1,
    addr.city,
    addr.region,
    addr.postalCode,
    addr.country,
  ].filter(Boolean);
  
  return parts.join("\n");
}

export async function syncInvoiceToXero(
  xero: XeroClient,
  tenantId: string,
  localInvoice: typeof invoices.$inferSelect,
  company: typeof companies.$inferSelect,
  lineItems: Array<{ description: string; quantity: number; unitAmount: number }>
) {
  // Get or create Xero contact for this company
  let xeroContactId: string | undefined;
  const companyMapping = await getXeroSyncMapping("company", company.id);
  
  if (companyMapping) {
    xeroContactId = companyMapping.xeroId;
  } else {
    // Create contact in Xero
    const contact: XeroContact = {
      name: company.tradingName || company.legalName,
    };
    
    const contactResponse = await xero.accountingApi.createContacts(tenantId, { contacts: [contact] });
    const createdContact = contactResponse.body.contacts?.[0];
    
    if (createdContact?.contactID) {
      xeroContactId = createdContact.contactID;
      await saveXeroSyncMapping("company", company.id, xeroContactId);
    }
  }
  
  if (!xeroContactId) {
    throw new Error("Could not create or find Xero contact for company");
  }
  
  // Check if invoice already synced
  const invoiceMapping = await getXeroSyncMapping("invoice", localInvoice.id);
  
  const xeroLineItems: LineItem[] = lineItems.map(item => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    accountCode: "200", // Default sales account
  }));
  
  const xeroInvoice: XeroInvoice = {
    type: XeroInvoice.TypeEnum.ACCREC,
    contact: { contactID: xeroContactId },
    lineItems: xeroLineItems,
    date: localInvoice.issueDate.toISOString().split("T")[0],
    dueDate: localInvoice.dueDate?.toISOString().split("T")[0],
    invoiceNumber: localInvoice.invoiceNumber,
    reference: `CRM Invoice ${localInvoice.invoiceNumber}`,
    status: localInvoice.status === "draft" ? XeroInvoice.StatusEnum.DRAFT : XeroInvoice.StatusEnum.AUTHORISED,
  };
  
  if (invoiceMapping) {
    // Update existing invoice
    xeroInvoice.invoiceID = invoiceMapping.xeroId;
    await xero.accountingApi.updateInvoice(tenantId, invoiceMapping.xeroId, { invoices: [xeroInvoice] });
  } else {
    // Create new invoice
    const invoiceResponse = await xero.accountingApi.createInvoices(tenantId, { invoices: [xeroInvoice] });
    const createdInvoice = invoiceResponse.body.invoices?.[0];
    
    if (createdInvoice?.invoiceID) {
      await saveXeroSyncMapping("invoice", localInvoice.id, createdInvoice.invoiceID);
    }
  }
  
  return { success: true };
}

interface XeroInvoiceRaw {
  InvoiceID: string;
  InvoiceNumber?: string;
  Type: string;
  Contact?: { ContactID: string; Name?: string };
  Date?: string;
  DueDate?: string;
  AmountDue?: number;
  Status?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  Reference?: string;
  LineItems?: Array<{
    Description?: string;
    Quantity?: number;
    UnitAmount?: number;
    LineAmount?: number;
    AccountCode?: string;
  }>;
}

async function fetchXeroOnlineInvoiceUrl(accessToken: string, tenantId: string, invoiceId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}/OnlineInvoice`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Xero-Tenant-Id": tenantId,
          "Accept": "application/json",
        },
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.OnlineInvoices?.[0]?.OnlineInvoiceUrl || null;
  } catch {
    return null;
  }
}

async function createInvoiceFromXero(
  xInv: XeroInvoiceRaw,
  companyId: string,
  orderId: string | null,
  invNumber: string,
  accessToken: string,
  tenantId: string,
) {
  let invoiceStatus = "draft";
  if (xInv.Status === "DRAFT") invoiceStatus = "draft";
  else if (xInv.Status === "SUBMITTED" || xInv.Status === "AUTHORISED") invoiceStatus = "sent";
  else if (xInv.Status === "PAID") invoiceStatus = "paid";
  else if (xInv.Status === "VOIDED") invoiceStatus = "void";
  else if (xInv.Status === "OVERDUE") invoiceStatus = "overdue";

  const onlineUrl = await fetchXeroOnlineInvoiceUrl(accessToken, tenantId, xInv.InvoiceID);

  const balanceDue = xInv.Status === "PAID" ? "0" : String(xInv.AmountDue ?? xInv.Total ?? 0);

  await db.insert(invoices).values({
    invoiceNumber: invNumber,
    orderId,
    companyId,
    status: invoiceStatus,
    issueDate: parseXeroDate(xInv.Date) || new Date(),
    dueDate: parseXeroDate(xInv.DueDate) || null,
    subtotal: String(xInv.SubTotal || 0),
    tax: String(xInv.TotalTax || 0),
    total: String(xInv.Total || 0),
    balanceDue,
    xeroInvoiceId: xInv.InvoiceID,
    xeroOnlineUrl: onlineUrl,
  }).onConflictDoNothing();
}

async function getFreshXeroToken(tenantId: string): Promise<string | null> {
  const token = await getStoredToken();
  if (!token || token.tenantId !== tenantId) return null;
  const now = new Date();
  const expiresAt = new Date(token.expiresAt);
  if (expiresAt.getTime() - now.getTime() < 2 * 60 * 1000) {
    const basicAuth = Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64");
    try {
      const refreshResponse = await fetch("https://identity.xero.com/connect/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token.refreshToken,
        }),
      });
      if (!refreshResponse.ok) return null;
      const newTokenSet = await refreshResponse.json() as any;
      if (newTokenSet.access_token && newTokenSet.refresh_token) {
        const expiresInSec = newTokenSet.expires_in || 1800;
        await saveXeroToken(tenantId, token.tenantName || undefined, newTokenSet.access_token, newTokenSet.refresh_token, new Date(Date.now() + expiresInSec * 1000));
        console.log("[XERO] Mid-import token refresh successful");
        return newTokenSet.access_token;
      }
    } catch (e: any) {
      console.error("[XERO] Mid-import token refresh failed:", e?.message);
    }
    return null;
  }
  return token.accessToken;
}

export async function importInvoicesFromXero(accessToken: string, tenantId: string) {
  const imported: { invoiceNumber: string; companyName: string; isNew: boolean; total: number }[] = [];
  const errors: { invoiceNumber: string; error: string }[] = [];
  let page = 1;
  let hasMore = true;
  let currentToken = accessToken;

  while (hasMore) {
    const freshToken = await getFreshXeroToken(tenantId);
    if (freshToken) currentToken = freshToken;

    const response = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices?page=${page}&where=Type%3D%3D%22ACCREC%22&order=Date%20DESC`,
      {
        headers: {
          "Authorization": `Bearer ${currentToken}`,
          "Xero-Tenant-Id": tenantId,
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        const retryToken = await getFreshXeroToken(tenantId);
        if (retryToken && retryToken !== currentToken) {
          currentToken = retryToken;
          console.log(`[XERO] Token refreshed mid-import, retrying page ${page}`);
          continue;
        }
      }
      const errorText = await response.text();
      console.error(`Xero invoices API error (page ${page}):`, errorText);
      throw new Error(`Failed to fetch invoices from Xero: ${response.status}`);
    }

    const data = await response.json();
    const xeroInvoices: XeroInvoiceRaw[] = data.Invoices || [];

    if (xeroInvoices.length === 0) {
      hasMore = false;
      break;
    }

    for (const xInv of xeroInvoices) {
      if (!xInv.InvoiceID) continue;

      const invNumber = xInv.InvoiceNumber || xInv.InvoiceID.substring(0, 8);

      const existingMapping = await getXeroSyncMappingByXeroId("order", xInv.InvoiceID);
      if (existingMapping) {
        imported.push({
          invoiceNumber: invNumber,
          companyName: xInv.Contact?.Name || "Unknown",
          isNew: false,
          total: xInv.Total || 0,
        });
        continue;
      }

      let companyId: string | undefined;
      let companyName = xInv.Contact?.Name || "Unknown Company";

      if (xInv.Contact?.ContactID) {
        const companyMapping = await getXeroSyncMappingByXeroId("company", xInv.Contact.ContactID);
        if (companyMapping) {
          companyId = companyMapping.localId;
        } else {
          const [newCompany] = await db.insert(companies).values({
            legalName: companyName,
            tradingName: companyName,
            internalNotes: `Auto-created during Xero invoice import on ${new Date().toLocaleDateString()}`,
          }).returning();
          companyId = newCompany.id;
          await saveXeroSyncMapping("company", newCompany.id, xInv.Contact.ContactID);
        }
      }

      if (!companyId) {
        errors.push({ invoiceNumber: invNumber, error: "No contact associated with invoice" });
        continue;
      }

      try {
        const existingOrder = await db.select().from(orders).where(sql`internal_notes LIKE ${'%Xero invoice ' + invNumber + '%'}`).limit(1);
        if (existingOrder.length > 0) {
          await saveXeroSyncMapping("order", existingOrder[0].id, xInv.InvoiceID);
          // Also ensure invoice record exists for portal visibility
          const existingInvoice = await db.select().from(invoices).where(eq(invoices.xeroInvoiceId, xInv.InvoiceID)).limit(1);
          if (existingInvoice.length === 0) {
            await createInvoiceFromXero(xInv, companyId, existingOrder[0].id, invNumber, accessToken, tenantId);
          }
          imported.push({ invoiceNumber: invNumber, companyName, isNew: false, total: xInv.Total || 0 });
          continue;
        }

        let status = "completed";
        if (xInv.Status === "DRAFT") status = "new";
        else if (xInv.Status === "SUBMITTED" || xInv.Status === "AUTHORISED") status = "confirmed";
        else if (xInv.Status === "PAID") status = "completed";
        else if (xInv.Status === "VOIDED") status = "cancelled";

        const subtotal = String(xInv.SubTotal || 0);
        const tax = String(xInv.TotalTax || 0);
        const total = String(xInv.Total || 0);

        const orderDate = parseXeroDate(xInv.Date) || new Date();

        const maxResultXero = await db.execute(sql`SELECT COALESCE(MAX(CAST(order_number AS INTEGER)), 0) as max_num FROM orders WHERE order_number ~ '^[0-9]+$'`);
        const orderNumber = String((parseInt(String((maxResultXero as any).rows?.[0]?.max_num || (maxResultXero as any)[0]?.max_num)) || 0) + 1);

        const [newOrder] = await db.insert(orders).values({
          orderNumber,
          companyId,
          status,
          orderDate,
          subtotal,
          tax,
          total,
          internalNotes: `Imported from Xero invoice ${invNumber}${xInv.Reference ? ` (Ref: ${xInv.Reference})` : ""}`,
        }).returning();

        if (xInv.LineItems && xInv.LineItems.length > 0) {
          for (const line of xInv.LineItems) {
            if (!line.Description && !line.LineAmount) continue;
            await db.insert(orderLines).values({
              orderId: newOrder.id,
              descriptionOverride: line.Description || "Line item",
              quantity: Math.round(line.Quantity || 1),
              unitPrice: String(line.UnitAmount || 0),
              lineTotal: String(line.LineAmount || 0),
            });
          }
        }

        await saveXeroSyncMapping("order", newOrder.id, xInv.InvoiceID);

        // Create invoice record for portal visibility
        await createInvoiceFromXero(xInv, companyId, newOrder.id, invNumber, accessToken, tenantId);

        imported.push({ invoiceNumber: invNumber, companyName, isNew: true, total: xInv.Total || 0 });
      } catch (err: any) {
        console.error(`Error importing Xero invoice ${invNumber}:`, err);
        errors.push({ invoiceNumber: invNumber, error: err.message || "Unknown error" });
      }
    }

    if (xeroInvoices.length < 100) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return { imported, errors };
}

async function getLastXeroSyncTime(): Promise<Date | null> {
  const [setting] = await db.select().from(crmSettings).where(eq(crmSettings.key, "last_xero_invoice_sync"));
  if (setting?.value) {
    return new Date(setting.value);
  }
  return null;
}

async function saveLastXeroSyncTime(time: Date) {
  const [existing] = await db.select().from(crmSettings).where(eq(crmSettings.key, "last_xero_invoice_sync"));
  if (existing) {
    await db.update(crmSettings).set({ value: time.toISOString() }).where(eq(crmSettings.key, "last_xero_invoice_sync"));
  } else {
    await db.insert(crmSettings).values({ key: "last_xero_invoice_sync", value: time.toISOString() });
  }
}

export async function autoSyncXeroInvoices(accessToken: string, tenantId: string) {
  let updated = 0;
  let created = 0;
  let page = 1;
  let hasMore = true;

  const lastSync = await getLastXeroSyncTime();
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - 7);
  const modifiedAfter = lastSync || fallback;
  modifiedAfter.setMinutes(modifiedAfter.getMinutes() - 5);
  const ifModifiedSince = modifiedAfter.toUTCString();

  while (hasMore) {
    const response = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices?page=${page}&where=Type%3D%3D%22ACCREC%22&order=UpdatedDateUTC%20DESC`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Xero-Tenant-Id": tenantId,
          "Accept": "application/json",
          "If-Modified-Since": ifModifiedSince,
        },
      }
    );

    if (!response.ok) {
      console.error(`[XERO-AUTOSYNC] API error (page ${page}):`, await response.text());
      break;
    }

    const data = await response.json();
    const xeroInvoices: XeroInvoiceRaw[] = data.Invoices || [];

    if (xeroInvoices.length === 0) {
      hasMore = false;
      break;
    }

    for (const xInv of xeroInvoices) {
      if (!xInv.InvoiceID) continue;

      const invNumber = xInv.InvoiceNumber || xInv.InvoiceID.substring(0, 8);

      let invoiceStatus = "draft";
      if (xInv.Status === "DRAFT") invoiceStatus = "draft";
      else if (xInv.Status === "SUBMITTED" || xInv.Status === "AUTHORISED") invoiceStatus = "sent";
      else if (xInv.Status === "PAID") invoiceStatus = "paid";
      else if (xInv.Status === "VOIDED") invoiceStatus = "void";
      else if (xInv.Status === "OVERDUE") invoiceStatus = "overdue";

      const balanceDue = xInv.Status === "PAID" ? "0" : String(xInv.AmountDue ?? xInv.Total ?? 0);

      const existingInvoice = await db.select().from(invoices).where(eq(invoices.xeroInvoiceId, xInv.InvoiceID)).limit(1);

      if (existingInvoice.length > 0) {
        await db.update(invoices).set({
          status: invoiceStatus,
          balanceDue,
          subtotal: String(xInv.SubTotal || 0),
          tax: String(xInv.TotalTax || 0),
          total: String(xInv.Total || 0),
          dueDate: parseXeroDate(xInv.DueDate) || null,
        }).where(eq(invoices.id, existingInvoice[0].id));
        // When Xero marks an invoice as paid, sync that to the order's payment status
        if (invoiceStatus === "paid") {
          if (existingInvoice[0].orderId) {
            await db.update(orders).set({ paymentStatus: "paid" })
              .where(and(eq(orders.id, existingInvoice[0].orderId), eq(orders.paymentStatus, "unpaid")));
          }
          // Also match via order's own xeroInvoiceId column (belt and suspenders)
          await db.update(orders).set({ paymentStatus: "paid" })
            .where(and(eq(orders.xeroInvoiceId, xInv.InvoiceID), eq(orders.paymentStatus, "unpaid")));
        }
        updated++;
      } else {
        let companyId: string | undefined;

        if (xInv.Contact?.ContactID) {
          const companyMapping = await getXeroSyncMappingByXeroId("company", xInv.Contact.ContactID);
          if (companyMapping) {
            companyId = companyMapping.localId;
          }
        }

        if (!companyId) continue;

        const existingMapping = await getXeroSyncMappingByXeroId("order", xInv.InvoiceID);
        let orderId: string | null = existingMapping?.localId || null;

        // If no explicit mapping, try to match by invoice number = order number (same company)
        if (!orderId && invNumber) {
          const orderMatch = await db.select({ id: orders.id }).from(orders)
            .where(and(eq(orders.companyId, companyId), eq(orders.orderNumber, invNumber)))
            .limit(1);
          if (orderMatch.length > 0) {
            orderId = orderMatch[0].id;
            // If Xero invoice is paid, update the matched order's payment_status
            if (invoiceStatus === "paid") {
              await db.update(orders).set({ paymentStatus: "paid" })
                .where(and(eq(orders.id, orderId), sql`${orders.paymentStatus} != 'paid'`));
            }
          }
        }

        await createInvoiceFromXero(xInv, companyId, orderId || null, invNumber, accessToken, tenantId);
        created++;
      }
    }

    if (xeroInvoices.length < 100) {
      hasMore = false;
    } else {
      page++;
    }
  }

  await saveLastXeroSyncTime(new Date());

  // After syncing, refresh overdue_amount on all companies from the local invoices table
  // This keeps the portal dashboard "Outstanding" card accurate without a live Xero API call
  try {
    await db.execute(sql`
      UPDATE companies c
      SET overdue_amount = sub.total
      FROM (
        SELECT company_id, COALESCE(SUM(balance_due::numeric), 0) AS total
        FROM invoices
        WHERE status = 'overdue'
        GROUP BY company_id
      ) sub
      WHERE c.id = sub.company_id
        AND sub.total > 0
    `);
    // Zero out companies that no longer have any overdue invoices
    await db.execute(sql`
      UPDATE companies
      SET overdue_amount = 0
      WHERE id NOT IN (
        SELECT DISTINCT company_id FROM invoices WHERE status = 'overdue' AND company_id IS NOT NULL
      )
      AND overdue_amount > 0
    `);
  } catch (refreshErr) {
    console.error("[XERO-AUTOSYNC] Could not refresh overdue_amount on companies:", refreshErr);
  }

  return { updated, created };
}

let xeroSyncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoXeroInvoiceSync(intervalMinutes: number = 15) {
  if (xeroSyncInterval) {
    clearInterval(xeroSyncInterval);
  }

  const syncAll = async () => {
    try {
      const token = await getStoredToken();
      if (!token) return;

      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPL_SLUG
          ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
          : "http://localhost:5000";
      const redirectUri = `${baseUrl}/api/xero/callback`;

      const xero = createXeroClient(redirectUri);
      const refreshed = await refreshTokenIfNeeded(xero, token);
      if (!refreshed) {
        console.log("[XERO-AUTOSYNC] Token refresh failed, skipping sync");
        return;
      }

      const freshToken = await getStoredToken();
      if (!freshToken) return;

      const result = await autoSyncXeroInvoices(freshToken.accessToken, freshToken.tenantId);
      if (result.updated > 0 || result.created > 0) {
        console.log(`[XERO-AUTOSYNC] Synced invoices: ${result.updated} updated, ${result.created} created`);
      }
    } catch (err) {
      console.error("[XERO-AUTOSYNC] Error in auto invoice sync:", err);
    }
  };

  setTimeout(syncAll, 10000);

  xeroSyncInterval = setInterval(syncAll, intervalMinutes * 60 * 1000);
  console.log(`[XERO-AUTOSYNC] Invoice auto-sync started (every ${intervalMinutes} minutes)`);
}

export async function repairMissingInvoiceRecords(accessToken: string, tenantId: string): Promise<{ fixed: number; skipped: number; errors: { invoiceNumber: string; error: string }[] }> {
  let fixed = 0;
  let skipped = 0;
  const errors: { invoiceNumber: string; error: string }[] = [];
  let page = 1;
  let hasMore = true;
  let currentToken = accessToken;

  while (hasMore) {
    const freshToken = await getFreshXeroToken(tenantId);
    if (freshToken) currentToken = freshToken;

    const response = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices?page=${page}&where=Type%3D%3D%22ACCREC%22&order=Date%20DESC`,
      {
        headers: {
          "Authorization": `Bearer ${currentToken}`,
          "Xero-Tenant-Id": tenantId,
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        const retryToken = await getFreshXeroToken(tenantId);
        if (retryToken && retryToken !== currentToken) {
          currentToken = retryToken;
          continue;
        }
      }
      const errorText = await response.text();
      console.error(`[XERO-REPAIR] API error (page ${page}):`, errorText);
      throw new Error(`Failed to fetch invoices from Xero: ${response.status}`);
    }

    const data = await response.json();
    const xeroInvoices: XeroInvoiceRaw[] = data.Invoices || [];

    if (xeroInvoices.length === 0) {
      hasMore = false;
      break;
    }

    for (const xInv of xeroInvoices) {
      if (!xInv.InvoiceID) continue;
      const invNumber = xInv.InvoiceNumber || xInv.InvoiceID.substring(0, 8);

      try {
        const existingInvoice = await db.select().from(invoices).where(eq(invoices.xeroInvoiceId, xInv.InvoiceID)).limit(1);
        if (existingInvoice.length > 0) {
          skipped++;
          continue;
        }

        const mapping = await getXeroSyncMappingByXeroId("order", xInv.InvoiceID);
        if (!mapping) {
          skipped++;
          continue;
        }

        const [orderRow] = await db.select().from(orders).where(eq(orders.id, mapping.localId)).limit(1);
        if (!orderRow) {
          skipped++;
          continue;
        }

        const companyId = orderRow.companyId;
        if (!companyId) {
          errors.push({ invoiceNumber: invNumber, error: "Order has no company_id" });
          continue;
        }

        await createInvoiceFromXero(xInv, companyId, orderRow.id, invNumber, currentToken, tenantId);
        fixed++;
        console.log(`[XERO-REPAIR] Created missing invoice record for ${invNumber}`);
      } catch (err: any) {
        errors.push({ invoiceNumber: invNumber, error: err.message || "Unknown error" });
      }
    }

    if (xeroInvoices.length < 100) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return { fixed, skipped, errors };
}
