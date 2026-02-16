import { ConfidentialClientApplication, Configuration, AuthorizationCodeRequest, AuthorizationUrlRequest } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import { db } from "./db";
import { outlookTokens, emails, contacts, companies } from "@shared/schema";
import { eq, desc, and, or, ilike, isNull } from "drizzle-orm";

const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID;
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET;

if (!OUTLOOK_CLIENT_ID || !OUTLOOK_CLIENT_SECRET) {
  console.warn("Outlook credentials not configured. Set OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET.");
}

const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Mail.Read",
  "Mail.Send",
  "Mail.ReadWrite",
];

// Tenant ID for Purax Feather Holdings (single-tenant app)
const OUTLOOK_TENANT_ID = "67838177-e1e4-42cd-9335-e66867ca148e";

export function createMsalClient(redirectUri: string): ConfidentialClientApplication {
  const config: Configuration = {
    auth: {
      clientId: OUTLOOK_CLIENT_ID!,
      clientSecret: OUTLOOK_CLIENT_SECRET!,
      authority: `https://login.microsoftonline.com/${OUTLOOK_TENANT_ID}`,
    },
  };
  return new ConfidentialClientApplication(config);
}

export async function getOutlookAuthUrl(redirectUri: string, state: string): Promise<string> {
  const msalClient = createMsalClient(redirectUri);
  const authUrlRequest: AuthorizationUrlRequest = {
    scopes: OUTLOOK_SCOPES,
    redirectUri,
    state,
  };
  return await msalClient.getAuthCodeUrl(authUrlRequest);
}

export async function exchangeCodeForTokens(
  redirectUri: string,
  code: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date; email?: string }> {
  const msalClient = createMsalClient(redirectUri);
  const tokenRequest: AuthorizationCodeRequest = {
    code,
    scopes: OUTLOOK_SCOPES,
    redirectUri,
  };
  
  const response = await msalClient.acquireTokenByCode(tokenRequest);
  
  if (!response || !response.accessToken) {
    throw new Error("Failed to acquire token from Microsoft");
  }

  const expiresAt = response.expiresOn ? new Date(response.expiresOn) : new Date(Date.now() + 3600 * 1000);
  
  let refreshToken = "";
  const tokenCache = msalClient.getTokenCache().serialize();
  const cacheData = JSON.parse(tokenCache);
  if (cacheData.RefreshToken) {
    const refreshTokenKeys = Object.keys(cacheData.RefreshToken);
    if (refreshTokenKeys.length > 0) {
      refreshToken = cacheData.RefreshToken[refreshTokenKeys[0]].secret;
    }
  }

  const email = response.account?.username;

  return {
    accessToken: response.accessToken,
    refreshToken,
    expiresAt,
    email,
  };
}

export async function getStoredOutlookToken(userId: string) {
  const [token] = await db.select().from(outlookTokens).where(eq(outlookTokens.userId, userId));
  return token;
}

export async function saveOutlookToken(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  emailAddress?: string
) {
  const existing = await getStoredOutlookToken(userId);
  if (existing) {
    await db.update(outlookTokens)
      .set({
        accessToken,
        refreshToken,
        expiresAt,
        emailAddress,
        updatedAt: new Date(),
      })
      .where(eq(outlookTokens.userId, userId));
  } else {
    await db.insert(outlookTokens).values({
      userId,
      accessToken,
      refreshToken,
      expiresAt,
      emailAddress,
    });
  }
}

export async function deleteOutlookToken(userId: string) {
  await db.delete(outlookTokens).where(eq(outlookTokens.userId, userId));
}

export async function refreshOutlookTokenIfNeeded(
  userId: string,
  redirectUri: string
): Promise<string | null> {
  const token = await getStoredOutlookToken(userId);
  if (!token) return null;

  const now = new Date();
  const expiresAt = new Date(token.expiresAt);
  
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return token.accessToken;
  }

  if (!token.refreshToken) {
    console.error("No refresh token available for Outlook");
    return null;
  }

  try {
    const msalClient = createMsalClient(redirectUri);
    
    const response = await msalClient.acquireTokenByRefreshToken({
      refreshToken: token.refreshToken,
      scopes: OUTLOOK_SCOPES,
    });

    if (!response || !response.accessToken) {
      console.error("Failed to refresh Outlook token");
      return null;
    }

    const newExpiresAt = response.expiresOn ? new Date(response.expiresOn) : new Date(Date.now() + 3600 * 1000);
    
    let newRefreshToken = token.refreshToken;
    const newTokenCache = msalClient.getTokenCache().serialize();
    try {
      const cacheData = JSON.parse(newTokenCache);
      if (cacheData.RefreshToken) {
        const refreshTokenKeys = Object.keys(cacheData.RefreshToken);
        if (refreshTokenKeys.length > 0) {
          newRefreshToken = cacheData.RefreshToken[refreshTokenKeys[0]].secret;
        }
      }
    } catch {
      // Keep the original refresh token if cache parsing fails
    }

    await saveOutlookToken(userId, response.accessToken, newRefreshToken, newExpiresAt, token.emailAddress || undefined);
    
    return response.accessToken;
  } catch (error) {
    console.error("Error refreshing Outlook token:", error);
    return null;
  }
}

function createGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done: (error: Error | null, token: string) => void) => {
      done(null, accessToken);
    },
  });
}

export interface OutlookMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: {
    content: string;
    contentType: string;
  };
  from?: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  isRead?: boolean;
  isDraft?: boolean;
  sentDateTime?: string;
  receivedDateTime?: string;
}

export async function fetchEmails(
  accessToken: string,
  folder: string = "inbox",
  top: number = 50
): Promise<OutlookMessage[]> {
  const client = createGraphClient(accessToken);
  
  let folderPath = "inbox";
  if (folder === "sent" || folder === "sentItems") folderPath = "sentItems";
  else if (folder === "drafts") folderPath = "drafts";
  
  const allMessages: OutlookMessage[] = [];
  const pageSize = Math.min(top, 250);
  let remaining = top;
  let nextLink: string | null = null;
  
  const response = await client.api(`/me/mailFolders/${folderPath}/messages`)
    .top(pageSize)
    .select("id,subject,bodyPreview,body,from,toRecipients,ccRecipients,isRead,isDraft,sentDateTime,receivedDateTime")
    .orderby("receivedDateTime desc")
    .get();
  
  allMessages.push(...(response.value || []));
  remaining -= allMessages.length;
  nextLink = response["@odata.nextLink"] || null;
  
  while (nextLink && remaining > 0) {
    const nextResponse = await client.api(nextLink).get();
    const msgs = nextResponse.value || [];
    allMessages.push(...msgs);
    remaining -= msgs.length;
    nextLink = nextResponse["@odata.nextLink"] || null;
  }
  
  return allMessages.slice(0, top);
}

export async function sendEmail(
  accessToken: string,
  to: string[],
  subject: string,
  body: string,
  cc?: string[]
): Promise<void> {
  const client = createGraphClient(accessToken);
  
  const message = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: body,
      },
      toRecipients: to.map(email => ({
        emailAddress: { address: email }
      })),
      ccRecipients: cc?.map(email => ({
        emailAddress: { address: email }
      })) || [],
    },
    saveToSentItems: true,
  };
  
  await client.api("/me/sendMail").post(message);
}

export async function replyToEmail(
  accessToken: string,
  messageId: string,
  body: string,
  replyAll: boolean = false
): Promise<void> {
  const client = createGraphClient(accessToken);
  const endpoint = replyAll
    ? `/me/messages/${messageId}/replyAll`
    : `/me/messages/${messageId}/reply`;
  await client.api(endpoint).post({
    message: {
      body: {
        contentType: "HTML",
        content: body,
      },
    },
  });
}

export async function markEmailAsRead(accessToken: string, messageId: string): Promise<void> {
  const client = createGraphClient(accessToken);
  await client.api(`/me/messages/${messageId}`).patch({ isRead: true });
}

export interface OutlookAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
}

export async function fetchEmailAttachments(accessToken: string, messageId: string): Promise<OutlookAttachment[]> {
  const client = createGraphClient(accessToken);
  const response = await client.api(`/me/messages/${messageId}/attachments`)
    .select("id,name,contentType,size,isInline")
    .get();
  return (response.value || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    contentType: a.contentType,
    size: a.size,
    isInline: a.isInline || false,
  }));
}

export async function downloadAttachment(accessToken: string, messageId: string, attachmentId: string): Promise<Buffer> {
  const client = createGraphClient(accessToken);
  const attachment = await client.api(`/me/messages/${messageId}/attachments/${attachmentId}`).get();
  console.log(`[PDF-EXTRACT] Attachment type: ${attachment.contentType}, name: ${attachment.name}, size: ${attachment.size}`);
  if (!attachment.contentBytes) {
    throw new Error(`Attachment has no content bytes. Type: ${attachment["@odata.type"]}, contentType: ${attachment.contentType}`);
  }
  return Buffer.from(attachment.contentBytes, "base64");
}

export async function syncEmailsToDatabase(
  userId: string,
  accessToken: string,
  folder: string = "inbox"
): Promise<number> {
  const messages = await fetchEmails(accessToken, folder, 500);
  let synced = 0;
  
  for (const msg of messages) {
    const existing = await db.select()
      .from(emails)
      .where(eq(emails.outlookMessageId, msg.id))
      .limit(1);
    
    if (existing.length === 0) {
      const fromAddress = msg.from?.emailAddress?.address || "unknown";
      const toAddresses = msg.toRecipients?.map(r => r.emailAddress?.address || "").filter(Boolean) || [];
      const match = await matchEmailToCompany(fromAddress, toAddresses);
      
      await db.insert(emails).values({
        outlookMessageId: msg.id,
        userId,
        fromAddress,
        fromName: msg.from?.emailAddress?.name || null,
        toAddresses,
        ccAddresses: msg.ccRecipients?.map(r => r.emailAddress?.address || "").filter(Boolean) || [],
        subject: msg.subject || null,
        bodyPreview: msg.bodyPreview || null,
        bodyHtml: msg.body?.content || null,
        isRead: msg.isRead || false,
        isDraft: msg.isDraft || false,
        sentAt: msg.sentDateTime ? new Date(msg.sentDateTime) : null,
        receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : null,
        folder,
        companyId: match.companyId,
        contactId: match.contactId,
      });
      synced++;
    }
  }
  
  return synced;
}

async function findContactByEmail(emailAddress: string) {
  const [contact] = await db.select()
    .from(contacts)
    .where(ilike(contacts.email, emailAddress))
    .limit(1);
  return contact;
}

async function matchEmailToCompany(fromAddress: string, toAddresses: string[]): Promise<{ companyId: string | null; contactId: string | null }> {
  const allAddresses = [fromAddress, ...toAddresses].filter(Boolean);
  
  for (const addr of allAddresses) {
    const contact = await findContactByEmail(addr);
    if (contact) {
      return { companyId: contact.companyId, contactId: contact.id };
    }
  }
  
  const allCompanies = await db.select().from(companies);
  
  for (const addr of allAddresses) {
    const company = allCompanies.find(c => 
      c.emailAddresses && (c.emailAddresses as string[]).some(
        (ce: string) => ce.toLowerCase() === addr.toLowerCase()
      )
    );
    if (company) {
      return { companyId: company.id, contactId: null };
    }
  }

  const puraxDomains = ["purax.com.au", "puradown.com", "puradown.com.au"];
  const externalAddresses = allAddresses.filter(a => {
    const domain = a.split("@")[1]?.toLowerCase() || "";
    return !puraxDomains.includes(domain);
  });
  
  if (externalAddresses.length > 0) {
    for (const addr of externalAddresses) {
      const domain = addr.split("@")[1]?.toLowerCase() || "";
      if (!domain || domain === "gmail.com" || domain === "yahoo.com" || domain === "outlook.com" || domain === "hotmail.com") continue;
      
      for (const company of allCompanies) {
        const companyName = (company.tradingName || company.legalName || "").toLowerCase().replace(/[\/\s]+/g, "");
        const domainBase = domain.split(".")[0].toLowerCase();
        if (domainBase.length > 2 && companyName.includes(domainBase)) {
          return { companyId: company.id, contactId: null };
        }
      }
    }
  }
  
  return { companyId: null, contactId: null };
}

export async function getEmailsForCompany(companyId: string, limit: number = 200, userId?: string) {
  return await db.select()
    .from(emails)
    .where(eq(emails.companyId, companyId))
    .orderBy(desc(emails.receivedAt))
    .limit(limit);
}

export async function getEmailsForContact(contactId: string, limit: number = 200, userId?: string) {
  return await db.select()
    .from(emails)
    .where(eq(emails.contactId, contactId))
    .orderBy(desc(emails.receivedAt))
    .limit(limit);
}

export async function getAllEmails(userId: string, folder?: string, limit: number = 200) {
  if (folder) {
    return await db.select()
      .from(emails)
      .where(eq(emails.folder, folder))
      .orderBy(desc(emails.receivedAt))
      .limit(limit);
  }
  
  return await db.select()
    .from(emails)
    .orderBy(desc(emails.receivedAt))
    .limit(limit);
}

export async function backfillEmailCompanyLinks(): Promise<number> {
  const unlinkedEmails = await db.select().from(emails).where(isNull(emails.companyId));
  let updated = 0;
  const allCompanies = await db.select().from(companies);
  const allContacts = await db.select().from(contacts);
  
  for (const email of unlinkedEmails) {
    const toAddresses = (email.toAddresses || []) as string[];
    const allAddresses = [email.fromAddress, ...toAddresses].filter(Boolean);
    let matchedCompanyId: string | null = null;
    let matchedContactId: string | null = null;
    
    for (const addr of allAddresses) {
      const contact = allContacts.find(c => c.email && c.email.toLowerCase() === addr.toLowerCase());
      if (contact) {
        matchedCompanyId = contact.companyId;
        matchedContactId = contact.id;
        break;
      }
    }
    
    if (!matchedCompanyId) {
      for (const addr of allAddresses) {
        const company = allCompanies.find(c => 
          c.emailAddresses && (c.emailAddresses as string[]).some(
            (ce: string) => ce.toLowerCase() === addr.toLowerCase()
          )
        );
        if (company) {
          matchedCompanyId = company.id;
          break;
        }
      }
    }

    if (!matchedCompanyId) {
      const puraxDomains = ["purax.com.au", "puradown.com", "puradown.com.au"];
      const externalAddresses = allAddresses.filter(a => {
        const domain = a.split("@")[1]?.toLowerCase() || "";
        return !puraxDomains.includes(domain);
      });
      
      for (const addr of externalAddresses) {
        const domain = addr.split("@")[1]?.toLowerCase() || "";
        if (!domain || ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"].includes(domain)) continue;
        const domainBase = domain.split(".")[0].toLowerCase();
        if (domainBase.length > 2) {
          const company = allCompanies.find(c => {
            const name = (c.tradingName || c.legalName || "").toLowerCase().replace(/[\/\s]+/g, "");
            return name.includes(domainBase);
          });
          if (company) {
            matchedCompanyId = company.id;
            break;
          }
        }
      }
    }
    
    if (!matchedCompanyId && email.subject) {
      const nameMatch = email.subject.match(/placed by\s+(.+?)$/i);
      if (nameMatch) {
        const customerName = nameMatch[1].trim().toLowerCase();
        const contact = allContacts.find(c => {
          const fullName = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
          return fullName === customerName;
        });
        if (contact) {
          matchedCompanyId = contact.companyId;
          matchedContactId = contact.id;
        }
      }
    }
    
    if (matchedCompanyId) {
      await db.update(emails).set({
        companyId: matchedCompanyId,
        contactId: matchedContactId || email.contactId,
      }).where(eq(emails.id, email.id));
      updated++;
    }
  }
  
  return updated;
}

let autoSyncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoEmailSync(redirectUri: string, intervalMinutes: number = 5) {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
  }

  const syncAll = async () => {
    try {
      const allTokens = await db.select().from(outlookTokens);
      if (allTokens.length === 0) return;

      for (const token of allTokens) {
        try {
          const accessToken = await refreshOutlookTokenIfNeeded(token.userId, redirectUri);
          if (!accessToken) {
            console.log(`[AUTO-SYNC] Skipping user ${token.userId} - token expired or unavailable`);
            continue;
          }

          const folders = ["inbox", "sentItems", "drafts"];
          let totalSynced = 0;
          for (const folder of folders) {
            const synced = await syncEmailsToDatabase(token.userId, accessToken, folder);
            totalSynced += synced;
          }

          if (totalSynced > 0) {
            console.log(`[AUTO-SYNC] Synced ${totalSynced} new emails for user ${token.userId}`);
          }
        } catch (err) {
          console.error(`[AUTO-SYNC] Error syncing emails for user ${token.userId}:`, err);
        }
      }
    } catch (err) {
      console.error("[AUTO-SYNC] Error in auto email sync:", err);
    }
  };

  syncAll();

  autoSyncInterval = setInterval(syncAll, intervalMinutes * 60 * 1000);
  console.log(`[AUTO-SYNC] Email auto-sync started (every ${intervalMinutes} minutes)`);
}
