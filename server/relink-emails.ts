import { db } from "./db";
import { companies, contacts, emails } from "@shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

const PURAX_COMPANY_ID = "81236af8-fd7f-4950-92dd-cdf5714597dd";
const PURAX_DOMAINS = ["purax.com.au", "puradown.com", "puradown.com.au"];
const GENERIC_DOMAINS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "live.com", "msn.com", "aol.com", "mail.com", "protonmail.com",
  "bigpond.com", "optusnet.com.au", "tpg.com.au", "westnet.com.au",
  "internode.on.net", "adam.com.au", "dodo.com.au", "iinet.net.au",
  "microsoft.com", "xerofiles.com", "getservicify.com",
];

function getDomain(email: string): string {
  return (email.split("@")[1] || "").toLowerCase();
}

function getDomainBase(domain: string): string {
  const parts = domain.split(".");
  return parts[0].toLowerCase();
}

function isPuraxDomain(domain: string): boolean {
  return PURAX_DOMAINS.includes(domain);
}

function isGenericDomain(domain: string): boolean {
  return GENERIC_DOMAINS.includes(domain);
}

function getExternalAddresses(fromAddress: string, toAddresses: string[], ccAddresses: string[]): string[] {
  const all = [fromAddress, ...toAddresses, ...ccAddresses].filter(Boolean);
  return all.filter(a => {
    const domain = getDomain(a);
    return domain && !isPuraxDomain(domain) && a !== "unknown";
  });
}

export async function relinkAllEmails() {
  console.log("\n========================================");
  console.log("COMPREHENSIVE EMAIL RE-LINKING AUDIT");
  console.log("========================================\n");

  const allCompanies = await db.select().from(companies);
  const allContacts = await db.select().from(contacts);
  const allEmails = await db.select().from(emails);

  console.log(`Total companies: ${allCompanies.length}`);
  console.log(`Total contacts: ${allContacts.length}`);
  console.log(`Total emails: ${allEmails.length}`);

  const contactsByEmail = new Map<string, typeof allContacts[0]>();
  for (const c of allContacts) {
    if (c.email) contactsByEmail.set(c.email.toLowerCase(), c);
  }

  const companyByEmail = new Map<string, typeof allCompanies[0]>();
  for (const c of allCompanies) {
    if (c.emailAddresses) {
      for (const e of c.emailAddresses as string[]) {
        companyByEmail.set(e.toLowerCase(), c);
      }
    }
  }

  const companyByDomain = new Map<string, typeof allCompanies[0]>();
  for (const c of allContacts) {
    if (c.email && c.companyId) {
      const domain = getDomain(c.email);
      if (domain && !isGenericDomain(domain) && !isPuraxDomain(domain)) {
        const company = allCompanies.find(co => co.id === c.companyId);
        if (company && company.id !== PURAX_COMPANY_ID) {
          companyByDomain.set(domain, company);
        }
      }
    }
  }

  for (const c of allCompanies) {
    if (c.emailAddresses && c.id !== PURAX_COMPANY_ID) {
      for (const e of c.emailAddresses as string[]) {
        const domain = getDomain(e);
        if (domain && !isGenericDomain(domain) && !isPuraxDomain(domain)) {
          companyByDomain.set(domain, c);
        }
      }
    }
  }

  console.log(`\nContact email lookup entries: ${contactsByEmail.size}`);
  console.log(`Company email lookup entries: ${companyByEmail.size}`);
  console.log(`Domain-to-company lookup entries: ${companyByDomain.size}`);

  function matchEmail(email: typeof allEmails[0]): { companyId: string | null; contactId: string | null; method: string } {
    const toAddresses = (email.toAddresses || []) as string[];
    const ccAddresses = (email.ccAddresses || []) as string[];
    const externalAddrs = getExternalAddresses(email.fromAddress || "", toAddresses, ccAddresses);

    for (const addr of externalAddrs) {
      const contact = contactsByEmail.get(addr.toLowerCase());
      if (contact && contact.companyId && contact.companyId !== PURAX_COMPANY_ID) {
        return { companyId: contact.companyId, contactId: contact.id, method: "contact_email" };
      }
    }

    for (const addr of externalAddrs) {
      const company = companyByEmail.get(addr.toLowerCase());
      if (company && company.id !== PURAX_COMPANY_ID) {
        return { companyId: company.id, contactId: null, method: "company_email" };
      }
    }

    for (const addr of externalAddrs) {
      const domain = getDomain(addr);
      if (domain && !isGenericDomain(domain)) {
        const company = companyByDomain.get(domain);
        if (company && company.id !== PURAX_COMPANY_ID) {
          return { companyId: company.id, contactId: null, method: "domain_match" };
        }
      }
    }

    for (const addr of externalAddrs) {
      const domain = getDomain(addr);
      if (domain && !isGenericDomain(domain)) {
        const domainBase = getDomainBase(domain);
        if (domainBase.length > 2) {
          const company = allCompanies.find(c => {
            if (c.id === PURAX_COMPANY_ID) return false;
            const name = (c.tradingName || c.legalName || "").toLowerCase().replace(/[\/\s\-\(\)]+/g, "");
            return name.includes(domainBase) || domainBase.includes(name.replace(/cod$/i, "").trim());
          });
          if (company) {
            return { companyId: company.id, contactId: null, method: "domain_name_fuzzy" };
          }
        }
      }
    }

    if (email.subject) {
      const nameMatch = email.subject.match(/placed by\s+(.+?)$/i);
      if (nameMatch) {
        const customerName = nameMatch[1].trim().toLowerCase();
        const contact = allContacts.find(c => {
          const fullName = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
          return fullName === customerName;
        });
        if (contact && contact.companyId && contact.companyId !== PURAX_COMPANY_ID) {
          return { companyId: contact.companyId, contactId: contact.id, method: "subject_name" };
        }
      }
    }

    return { companyId: null, contactId: null, method: "none" };
  }

  const puraxEmails = allEmails.filter(e => e.companyId === PURAX_COMPANY_ID);
  const unlinkedEmails = allEmails.filter(e => !e.companyId);
  const otherEmails = allEmails.filter(e => e.companyId && e.companyId !== PURAX_COMPANY_ID);

  console.log(`\nEmails linked to Purax: ${puraxEmails.length}`);
  console.log(`Emails with no company: ${unlinkedEmails.length}`);
  console.log(`Emails linked to other companies: ${otherEmails.length}`);

  let relinkedFromPurax = 0;
  let linkedFromNull = 0;
  const relinkedDetails: { subject: string; from: string; oldCompany: string; newCompany: string; method: string }[] = [];

  for (const email of puraxEmails) {
    const match = matchEmail(email);
    if (match.companyId && match.companyId !== PURAX_COMPANY_ID) {
      const newCompany = allCompanies.find(c => c.id === match.companyId);
      relinkedDetails.push({
        subject: (email.subject || "(no subject)").substring(0, 60),
        from: email.fromAddress || "unknown",
        oldCompany: "Purax pty ltd",
        newCompany: newCompany?.legalName || "Unknown",
        method: match.method,
      });

      await db.update(emails).set({
        companyId: match.companyId,
        contactId: match.contactId || email.contactId,
      }).where(eq(emails.id, email.id));
      relinkedFromPurax++;
    }
  }

  for (const email of unlinkedEmails) {
    const match = matchEmail(email);
    if (match.companyId) {
      const newCompany = allCompanies.find(c => c.id === match.companyId);
      relinkedDetails.push({
        subject: (email.subject || "(no subject)").substring(0, 60),
        from: email.fromAddress || "unknown",
        oldCompany: "(none)",
        newCompany: newCompany?.legalName || "Unknown",
        method: match.method,
      });

      await db.update(emails).set({
        companyId: match.companyId,
        contactId: match.contactId || email.contactId,
      }).where(eq(emails.id, email.id));
      linkedFromNull++;
    }
  }

  console.log("\n========================================");
  console.log("RESULTS");
  console.log("========================================");
  console.log(`Re-linked from Purax to customer companies: ${relinkedFromPurax}`);
  console.log(`Linked previously unlinked emails: ${linkedFromNull}`);
  console.log(`Total emails updated: ${relinkedFromPurax + linkedFromNull}`);

  if (relinkedDetails.length > 0) {
    console.log("\n--- DETAILED CHANGES ---");
    const byCompany = new Map<string, number>();
    for (const d of relinkedDetails) {
      byCompany.set(d.newCompany, (byCompany.get(d.newCompany) || 0) + 1);
    }
    const sorted = [...byCompany.entries()].sort((a, b) => b[1] - a[1]);
    console.log("\nEmails linked per company:");
    for (const [company, count] of sorted) {
      console.log(`  ${company}: ${count} email(s)`);
    }

    const byMethod = new Map<string, number>();
    for (const d of relinkedDetails) {
      byMethod.set(d.method, (byMethod.get(d.method) || 0) + 1);
    }
    console.log("\nBy matching method:");
    for (const [method, count] of byMethod.entries()) {
      console.log(`  ${method}: ${count}`);
    }
  }

  const remainingPurax = await db.select({ count: sql<number>`count(*)::int` })
    .from(emails).where(eq(emails.companyId, PURAX_COMPANY_ID));
  const remainingNull = await db.select({ count: sql<number>`count(*)::int` })
    .from(emails).where(isNull(emails.companyId));

  console.log(`\nRemaining emails on Purax: ${remainingPurax[0].count}`);
  console.log(`Remaining unlinked emails: ${remainingNull[0].count}`);
  console.log("\n========================================\n");

  return { relinkedFromPurax, linkedFromNull, total: relinkedFromPurax + linkedFromNull };
}

const isMain = process.argv[1]?.includes("relink-emails");
if (isMain) {
  relinkAllEmails()
    .then(result => {
      console.log("Done!", result);
      process.exit(0);
    })
    .catch(err => {
      console.error("Error:", err);
      process.exit(1);
    });
}
