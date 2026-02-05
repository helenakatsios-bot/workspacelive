import { XeroClient, Contact as XeroContact, Invoice as XeroInvoice, LineItem, Invoices } from "xero-node";
import { db } from "./db";
import { xeroTokens, xeroSyncMapping, companies, contacts, invoices } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

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

export async function refreshTokenIfNeeded(xero: XeroClient, token: typeof xeroTokens.$inferSelect) {
  const now = new Date();
  const expiresAt = new Date(token.expiresAt);
  
  // Refresh if token expires in less than 5 minutes
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    try {
      xero.setTokenSet({
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        token_type: "Bearer",
        scope: XERO_SCOPES,
      });
      
      const newTokenSet = await xero.refreshToken();
      
      if (newTokenSet.access_token && newTokenSet.refresh_token) {
        await saveXeroToken(
          token.tenantId,
          token.tenantName || undefined,
          newTokenSet.access_token,
          newTokenSet.refresh_token,
          new Date((newTokenSet.expires_at || 0) * 1000)
        );
        return true;
      }
    } catch (error) {
      console.error("Failed to refresh Xero token:", error);
      return false;
    }
  }
  
  // Set token on client
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
