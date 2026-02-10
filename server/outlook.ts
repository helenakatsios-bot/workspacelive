import { ConfidentialClientApplication, Configuration, AuthorizationCodeRequest, AuthorizationUrlRequest } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import { db } from "./db";
import { outlookTokens, emails, contacts, companies } from "@shared/schema";
import { eq, desc, and, or, ilike } from "drizzle-orm";

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
  if (folder === "sent") folderPath = "sentItems";
  else if (folder === "drafts") folderPath = "drafts";
  
  const response = await client.api(`/me/mailFolders/${folderPath}/messages`)
    .top(top)
    .select("id,subject,bodyPreview,body,from,toRecipients,ccRecipients,isRead,isDraft,sentDateTime,receivedDateTime")
    .orderby("receivedDateTime desc")
    .get();
  
  return response.value || [];
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

export async function syncEmailsToDatabase(
  userId: string,
  accessToken: string,
  folder: string = "inbox"
): Promise<number> {
  const messages = await fetchEmails(accessToken, folder, 100);
  let synced = 0;
  
  for (const msg of messages) {
    const existing = await db.select()
      .from(emails)
      .where(eq(emails.outlookMessageId, msg.id))
      .limit(1);
    
    if (existing.length === 0) {
      const fromAddress = msg.from?.emailAddress?.address || "unknown";
      const matchedContact = await findContactByEmail(fromAddress);
      
      await db.insert(emails).values({
        outlookMessageId: msg.id,
        userId,
        fromAddress,
        fromName: msg.from?.emailAddress?.name || null,
        toAddresses: msg.toRecipients?.map(r => r.emailAddress?.address || "").filter(Boolean) || [],
        ccAddresses: msg.ccRecipients?.map(r => r.emailAddress?.address || "").filter(Boolean) || [],
        subject: msg.subject || null,
        bodyPreview: msg.bodyPreview || null,
        bodyHtml: msg.body?.content || null,
        isRead: msg.isRead || false,
        isDraft: msg.isDraft || false,
        sentAt: msg.sentDateTime ? new Date(msg.sentDateTime) : null,
        receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : null,
        folder,
        companyId: matchedContact?.companyId || null,
        contactId: matchedContact?.id || null,
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

export async function getEmailsForCompany(companyId: string, limit: number = 50) {
  return await db.select()
    .from(emails)
    .where(eq(emails.companyId, companyId))
    .orderBy(desc(emails.receivedAt))
    .limit(limit);
}

export async function getEmailsForContact(contactId: string, limit: number = 50) {
  return await db.select()
    .from(emails)
    .where(eq(emails.contactId, contactId))
    .orderBy(desc(emails.receivedAt))
    .limit(limit);
}

export async function getAllEmails(userId: string, folder?: string, limit: number = 50) {
  let query = db.select()
    .from(emails)
    .where(eq(emails.userId, userId))
    .orderBy(desc(emails.receivedAt))
    .limit(limit);
  
  if (folder) {
    query = db.select()
      .from(emails)
      .where(and(eq(emails.userId, userId), eq(emails.folder, folder)))
      .orderBy(desc(emails.receivedAt))
      .limit(limit);
  }
  
  return await query;
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

          const folders = ["inbox", "sentItems"];
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
